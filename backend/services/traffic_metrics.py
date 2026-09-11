"""트래픽 관측 계측 — 요청 수·고유 방문자·응답시간 분포·에러율.

무료 공개 전환(사용자 39명 → 불특정 다수) 대비 "지금 얼마나 들어오고 있나"를
숫자로 보기 위한 관측 계층. 회계·과금용이 아니라 **관측용**이다.

설계 (services/naver_call_counter.py 패턴 답습 — lock + deque 슬라이딩 윈도우):
- **순수 in-memory**. 매 요청 DB INSERT 는 그 자체가 부하이고 statement_timeout(8s)·
  연결 고갈(Supabase Small max_connections=90) 위험이라 하지 않는다. naver_call_counter 가
  24h 영속화를 위해 시간버킷 upsert 를 하는 것과 달리, 여기는 요청량이 2~3자릿수 더 많아
  같은 방식을 쓸 수 없다(요청당 1 INSERT = 트래픽만큼의 DB 쓰기).
- 프로세스 재시작 시 소실 = 수용. 재시작 시각은 process_uptime_seconds 로 함께 노출해
  "24시간 수치가 아직 안 찼다"를 화면이 판단할 수 있게 한다(naver_call_counter 선례).
- 메모리 상한 필수: 레코드 총량 상한 + 경로 그룹 카디널리티 상한.
  알 수 없는 경로는 "other" 로 합쳐 경로 폭발(공격자가 /api/<랜덤> 을 난사)로
  메모리가 터지는 것을 막는다.

식별자 정책 (개인정보):
- 원문 IP 는 저장하지 않는다. HMAC 유사 salt 를 붙인 SHA-256 앞 12자만 보관한다.
  salt 는 프로세스 시작 시 무작위 생성 → 재시작하면 같은 IP 도 다른 해시가 되어
  장기 추적이 불가능하고, 프로세스 수명 안에서는 "같은 사람"으로 집계된다.
- 로그인 사용자는 Authorization 토큰의 해시를 쓴다. 미들웨어는 의존성 주입 전이라
  검증된 user_id 를 얻을 수 없고, 미검증 JWT payload 를 파싱해 쓰면 위조 가능한 값을
  집계에 넣게 된다. 토큰 해시는 위조해도 "다른 방문자 1명"이 될 뿐 남을 사칭할 수 없다.
  (토큰 자체는 저장하지 않는다 — 해시만.)
"""

import hashlib
import logging
import os
import re
import threading
import time
from collections import deque
from time import monotonic

logger = logging.getLogger(__name__)

_started_at = time.time()  # 모듈 로드 시각 (epoch)

_WINDOW_SECONDS = 24 * 3600  # 24시간 초과 레코드 잘라냄
# 레코드 1건 = (ts, group_idx, status, ms, identity) 튜플. 20만 건이면 대략 수십 MB 이내.
# 하루 20만 요청을 넘으면 오래된 것부터 밀려나 24h 창이 실제로는 더 짧아진다 —
# 그 경우 window_truncated 플래그로 화면에 알린다(조용히 틀린 수치를 보여주지 않는다).
_MAX_RECORDS = 200_000
_MAX_PATH_GROUPS = 40  # 경로 그룹 카디널리티 상한 (초과분은 "other")
_MAX_IDENTITIES_PER_WINDOW = 50_000  # 고유 방문자 집계 시 순회 상한 (응답 지연 방지)

# 경로 그룹 정규화에 쓰는 salt (프로세스마다 무작위 — 재식별 방지)
_IDENTITY_SALT = os.urandom(16)

_lock = threading.Lock()
# (ts_monotonic, group, status_code, duration_ms, identity)
_records: deque[tuple[float, str, int, float, str]] = deque()
_known_groups: set[str] = set()
# 상한 때문에 오래된 레코드를 버린 적이 있는가 (24h 창 신뢰도 표시용)
_evicted = False

# 경로 세그먼트가 식별자(숫자·UUID·해시 등)인지 판정 — 그룹 카디널리티 폭발 방지
_ID_SEGMENT = re.compile(r"^[0-9]+$|^[0-9a-fA-F-]{8,}$")


def _hash_identity(raw: str) -> str:
    """식별자 원문 → salt 붙인 SHA-256 앞 12자. 원문은 어디에도 남기지 않는다."""
    return hashlib.sha256(_IDENTITY_SALT + raw.encode("utf-8", "replace")).hexdigest()[:12]


def normalize_path(path: str) -> str:
    """요청 경로 → 경로 그룹 (2단계까지).

    /api/complexes/12345/articles → /api/complexes
    /api/live/search              → /api/live
    /api/mb/apartments            → /api/mb

    2단계까지만 남기는 이유 = 카디널리티 통제. 단지 번호·매물 번호가 경로에 박혀 있어
    전체 경로를 키로 쓰면 그룹 수가 무한히 늘어난다.
    """
    parts = [p for p in path.split("/") if p]
    if not parts or parts[0] != "api":
        return "other"
    # /api 단독
    if len(parts) == 1:
        return "/api"
    second = parts[1]
    # 두 번째 세그먼트가 식별자면 그룹으로 삼을 의미가 없다
    if _ID_SEGMENT.match(second):
        return "/api"
    return f"/api/{second}"


def record_request(
    path: str,
    status_code: int,
    duration_ms: float,
    identity_raw: str,
) -> None:
    """요청 1건 기록. 미들웨어에서 응답 직후 호출.

    identity_raw 는 원문(IP 또는 토큰) — 이 함수 안에서 즉시 해시되며 원문은 보관되지 않는다.
    """
    global _evicted
    now = monotonic()
    group = normalize_path(path)
    identity = _hash_identity(identity_raw)

    with _lock:
        # 새 그룹이 상한을 넘으면 "other" 로 합침 (경로 폭발 방어)
        if group not in _known_groups:
            if len(_known_groups) >= _MAX_PATH_GROUPS:
                group = "other"
            else:
                _known_groups.add(group)

        _records.append((now, group, status_code, duration_ms, identity))

        # 24시간 초과 레코드 정리
        cutoff = now - _WINDOW_SECONDS
        while _records and _records[0][0] < cutoff:
            _records.popleft()

        # 총량 상한 초과 시 오래된 쪽부터 버림 (메모리 보호)
        while len(_records) > _MAX_RECORDS:
            _records.popleft()
            _evicted = True


def get_uptime_seconds() -> float:
    """프로세스(모듈 로드) 이후 경과 초."""
    return time.time() - _started_at


def _percentile(sorted_values: list[float], pct: float) -> float:
    """정렬된 리스트에서 백분위수 (nearest-rank). 빈 리스트면 0."""
    if not sorted_values:
        return 0.0
    idx = int(round(pct / 100 * len(sorted_values) + 0.5)) - 1
    idx = max(0, min(idx, len(sorted_values) - 1))
    return sorted_values[idx]


def _summarize(
    rows: list[tuple[float, str, int, float, str]],
    top_paths: int,
    top_identities: int,
) -> dict:
    """한 윈도우 분량의 레코드 → 집계 dict."""
    total = len(rows)
    if total == 0:
        return {
            "total_requests": 0,
            "unique_visitors": 0,
            "p50_ms": 0.0,
            "p95_ms": 0.0,
            "rate_4xx": 0.0,
            "rate_5xx": 0.0,
            "top_paths": [],
            "top_identities": [],
        }

    durations = sorted(r[3] for r in rows)
    count_4xx = sum(1 for r in rows if 400 <= r[2] < 500)
    count_5xx = sum(1 for r in rows if r[2] >= 500)

    per_group: dict[str, int] = {}
    per_identity: dict[str, int] = {}
    for _, group, _status, _ms, identity in rows:
        per_group[group] = per_group.get(group, 0) + 1
        # 고유 방문자 dict 도 상한을 둔다 (극단적 분산 공격 시 메모리 보호)
        if identity in per_identity or len(per_identity) < _MAX_IDENTITIES_PER_WINDOW:
            per_identity[identity] = per_identity.get(identity, 0) + 1

    sorted_groups = sorted(per_group.items(), key=lambda kv: (-kv[1], kv[0]))[:top_paths]
    sorted_ids = sorted(per_identity.items(), key=lambda kv: (-kv[1], kv[0]))[:top_identities]

    return {
        "total_requests": total,
        "unique_visitors": len(per_identity),
        "p50_ms": round(_percentile(durations, 50), 1),
        "p95_ms": round(_percentile(durations, 95), 1),
        "rate_4xx": round(count_4xx / total * 100, 2),
        "rate_5xx": round(count_5xx / total * 100, 2),
        "top_paths": [{"path": g, "count": c} for g, c in sorted_groups],
        "top_identities": [{"identity": i, "count": c} for i, c in sorted_ids],
    }


def get_stats(top_paths: int = 10, top_identities: int = 10) -> dict:
    """최근 10분/1시간/24시간 트래픽 요약.

    top_identities 는 "최근 1시간 요청 상위 식별자"용 — 비정상 사용자를 **보이게만** 한다.
    자동 차단은 하지 않는다(오탐 시 정상 사용자를 막는다). 차단은 사람이 판단.
    """
    now = monotonic()
    windows = {"10m": 600, "1h": 3600, "24h": _WINDOW_SECONDS}

    with _lock:
        # 24h 초과 레코드 lazy GC
        cutoff_24h = now - _WINDOW_SECONDS
        while _records and _records[0][0] < cutoff_24h:
            _records.popleft()
        snapshot = list(_records)
        evicted = _evicted

    result: dict[str, dict] = {}
    for key, seconds in windows.items():
        cutoff = now - seconds
        rows = [r for r in snapshot if r[0] >= cutoff]
        # 상위 식별자는 1시간 창에서만 의미가 있다 (남용 감지 목적)
        ident_n = top_identities if key == "1h" else 0
        result[key] = _summarize(rows, top_paths, ident_n)

    return {
        "windows": result,
        "process_uptime_seconds": get_uptime_seconds(),
        # True 면 레코드 상한에 걸려 오래된 것을 버렸다는 뜻 = 24h 수치가 실제보다 작다
        "window_truncated": evicted,
        "record_count": len(snapshot),
        "max_records": _MAX_RECORDS,
    }


def reset() -> None:
    """테스트 전용: 카운터 전체 초기화."""
    global _evicted
    with _lock:
        _records.clear()
        _known_groups.clear()
        _evicted = False
