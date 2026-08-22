"""공동주택 공시가격 수집 — V-WORLD getApartHousingPriceAttr → complex_official_prices.

법정동(cortar_no 10자리) 단위로 공시가격 전량을 받아 우리 단지(APT·JGC)에 매칭하고,
(단지 × 기준연도 × 전용면적) 중위 공시가격을 저장한다. 보유세 계산기 자동입력과
단지 상세 표시의 원천 데이터.

매칭은 **보수적으로** 한다 — 세금 계산에 쓰이는 값이라 "틀린 값 < 값 없음" 이다
(플랜 §3-2-5, 부평동 오매칭 52건 실측 근거). 세대수 ±5% 게이트를 통과한 후보가
2개 이상이면 임의로 고르지 않고 그 단지는 아예 저장하지 않는다.

네이버 API 를 전혀 쓰지 않으므로 IP 차단·data.go.kr 공유 쿼터와 무관하다.
"""

import logging
import os
import re
import statistics
import time
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from crawler.cortar_legacy import to_vworld_cortar
from crawler.env_common import _complete_job, _fail_job, _record_job
from crawler.service_common import RESUME_MAX_AGE_HOURS, _checkpoint
from db.database import SessionLocal
from db.models import Complex, ComplexOfficialPrice, CrawlJob
from services.upsert import _do_upsert
from utils import utcnow

logger = logging.getLogger(__name__)

# 공시가격 대상 매물유형 — 아파트·재건축만. 오피스텔(OPST)·분양권(ABYG/OBYG/PRE)은
# 공동주택가격 공시 대상 체계가 달라 제외 (플랜 §2 실측: APT 47,054 + JGC 1,011).
TARGET_TYPE_CODES = ("APT", "JGC")

# 세대수 게이트 허용 오차 — 정상 매칭의 (공시 호수 / 우리 세대수) 비율 중앙값이 1.000
# 이라 ±5% 로 충분하다. ±20% 로 넓히면 오매칭만 늘어난다 (플랜 §3-2-5 실측).
HOUSEHOLD_TOLERANCE = 0.05

# 공시 기준월 방어 필터 — 실측상 전 지역이 '01' 뿐이나, 반기 공시가 생기면
# 같은 호가 2번 잡혀 중위값이 왜곡되므로 '01' 만 채택한다.
TARGET_STDR_MT = "01"

# 재수집 패스 상한 — V-WORLD 전면 장애로 전량 소실 판정이 나도 재조회가 폭주하지 않게
# 법정동 수를 캡한다. 정상 실행의 소실은 한 자릿수라(세션 370 실측 5단지) 충분하다.
_REPASS_MAX_DONGS = 20

# 붕괴 조기 이탈 임계 — 소실이 이 수를 넘으면 페이지 드리프트가 아니라 시스템 이상
# (매칭 규칙 붕괴·API 응답 구조 변경 등)으로 본다. 드리프트 소실은 실측 한 자릿수라
# 200 이면 충분한 여유이며, 이 경우 재수집은 구제가 아니라 무의미한 폭주가 된다.
_REPASS_COLLAPSE_THRESHOLD = 200

# 재수집 벽시계 캡 — 현실 소실은 한 자릿수라 재수집이 수 분에 끝나지만, 이론 최악
# (대형 동 20개 전부 재조회)은 ~1.8h 가 된다. 1h 로 끊어 "본 루프 최악 7h + 재수집 1h
# = 8h < 16h(monitor stale 예외)" 여유를 보장한다. 이로써 재수집 상한이
# 규모(_REPASS_MAX_DONGS)·이상(_REPASS_COLLAPSE_THRESHOLD)·시간 3중 방어가 된다.
_REPASS_MAX_SECONDS = 3600

# 신코드 이관 감시 보초 — 옛 데이터셋(개편 전 시군구) 4개마다 대표 1곳(옛 코드 행수가 큰 동).
# 이관은 옛 시군구 데이터셋 단위로 일어날 것이라 데이터셋당 1곳이면 충분하다(2026-08-22
# 세션 375 설계, 적대검증이 옛 중구 사각 적발 → 운서동 추가). 옛 데이터셋 = 28110 옛 중구
# (신 제물포 24동+영종 4동) · 28140 옛 동구 · 28260 옛 서구 · 41590 옛 화성시.
# 행수 근거 = tests/test_cortar_legacy.py _KNOWN_REFORM 실측 주석.
# 감시 범위 = 2026 개편맵(VWORLD_REFORM_CORTAR_MAP)만 — 12-프리픽스 광주·전남 맵은 미감시(백로그).
_MIGRATION_SENTINELS: dict[str, str] = {
    "2827511100": "인천 서해구 청라동",   # 옛 서구 61,994행 — 28260 옛 서구 대표
    "2812510700": "인천 제물포구 송림동",  # 옛 동구 17,638행 — 28140 옛 동구 대표
    "2815510300": "인천 영종구 운서동",   # 옛 중구 20,930행 — 28110 옛 중구 대표
    "4159710200": "화성 동탄구 반송동",   # 옛 화성시 39,546행 — 41590 옛 화성시 대표
}

_PAREN = re.compile(r"\([^)]*\)")
# 꼬리 동목록 — "대치우성아파트1동 2동 3동 5동 6동 7동" 처럼 공시측 단지명 끝에
# 동 번호가 나열되는 실제 패턴(라이브 실측)을 제거한다.
_TAIL_DONG_LIST = re.compile(r"(\d+\s*동[\s,]*)+$")
# 차수 표기 통일 — "래미안2차" / "래미안 2 차" / "래미안II" 류의 표기 흔들림 흡수.
_CHASU = re.compile(r"(\d+)\s*차")
_NON_ALNUM_KO = re.compile(r"[^0-9A-Za-z가-힣]")

# ── 2차(이름) 매칭 전용 패턴 — 1차는 이 패턴들을 쓰지 않는다(1차 무변경 원칙) ──
# "(2단지)" → "2차" : 1차가 괄호를 통째로 지워 잃어버리는 차수를 살린다.
# 공시 "성서주공(2단지)" ↔ 우리 "성서주공2차" 실측 패턴.
#
# ⚠ 전제 — "N단지 ≡ N차" 동일시는 일반 명제가 아니라 **법정동 스코프 + 세대수 ±5%
# 게이트**를 전제로 수용한 설계 위험이다(세션 371 실측 3/3 세대수 완전일치가 근거).
# 한 법정동 안에서 같은 브랜드의 N단지와 N차가 각각 다른 단지로 공존하면서 세대수까지
# 겹치는 경우에만 문제가 되는데, 그 조합은 실측에서 나오지 않았다.
# ⚠ 알려진 한계 — "(제2단지)" 처럼 숫자 앞에 접두어가 붙는 표기는 이 패턴에 안 걸려
# 차수가 소실된다. 그 결과는 **미스**(매칭 안 됨)이지 오매칭이 아니라 보수 방향이므로
# 수용한다(넓히면 오폭 위험이 반대로 커진다).
_PAREN_DANJI = re.compile(r"\(\s*(\d+)\s*단지\s*\)")
# 괄호 밖 "2단지" → "2차" — 숫자 선행이라 "임대단지" 류 일반 명칭은 안 걸린다.
# 위 _PAREN_DANJI 의 전제·한계가 그대로 적용된다.
_BARE_DANJI = re.compile(r"(\d+)\s*단지")
# 꼬리 "상가" — 공시 "광동상가" ↔ 우리 "광동". 끝일 때만 지운다.
_TAIL_SANGGA = re.compile(r"상가$")
# 부분포함 최소 길이 — 짧은 쪽이 이보다 짧으면 아무 이름에나 걸려 폭발한다.
_PARTIAL_MIN_LEN = 3


def normalize_complex_name(name: str | None) -> str:
    """단지명 정규화 — 우리 DB 이름과 공시 단지명을 같은 축으로 맞춘다.

    순서가 중요하다: 괄호 제거 → 꼬리 동목록 제거 → "아파트" 제거 → 차수 통일 →
    나머지 특수문자·공백 제거. 꼬리 동목록을 "아파트" 제거보다 먼저 지워야
    "대치우성아파트1동 2동" 이 "대치우성" 으로 수렴한다.
    """
    if not name:
        return ""
    s = _PAREN.sub("", str(name)).strip()
    s = _TAIL_DONG_LIST.sub("", s).strip()
    s = s.replace("아파트", "")
    s = _CHASU.sub(r"\1차", s)  # "2 차" → "2차"
    s = _NON_ALNUM_KO.sub("", s)
    return s.upper()


def _normalize_alt(name: str | None) -> str:
    """2차 매칭 전용 정규화 — 1차가 놓치는 표기 차이 두 가지를 흡수한다 (PR-E3).

    1차(normalize_complex_name)와 **같은 순서·같은 규칙**이되 두 곳만 다르다:

      1) "(2단지)" → "2차" 보존. 1차는 괄호를 통째로 지워 차수가 소실되므로
         공시 "성서주공(2단지)" 와 우리 "성서주공2차" 가 서로 다른 키가 된다.
         괄호를 지우기 **전에** 치환해야 살릴 수 있다. 숫자 선행을 요구하므로
         "(임대단지)" 같은 일반 명칭은 건드리지 않는다.
      2) 꼬리 "상가" 제거. 공시 "광동상가" ↔ 우리 "광동" 처럼 상가동이 단지명에
         붙어 오는 실측 패턴. 문자열 **끝**일 때만 지워 "상가동일하이빌" 류의
         선두·중간 등장은 보존한다.

    1차 함수를 재사용(파라미터 추가)하지 않고 따로 둔다 — 1차 시그니처·본문
    불변이 PR-E3 의 절대 원칙이라(기존 26,307개 매칭 회귀 위험 0) 별도 경로로 뗀다.
    """
    if not name:
        return ""
    s = str(name).strip()
    # 괄호 제거 전에 차수를 살린다 — "(2단지)" → "2차", 이어서 괄호 밖 "2단지" → "2차".
    s = _PAREN_DANJI.sub(r"\1차", s)
    s = _BARE_DANJI.sub(r"\1차", s)
    s = _PAREN.sub("", s).strip()
    s = _TAIL_DONG_LIST.sub("", s).strip()
    s = s.replace("아파트", "")
    s = _TAIL_SANGGA.sub("", s).strip()
    s = _CHASU.sub(r"\1차", s)
    s = _NON_ALNUM_KO.sub("", s)
    return s.upper()


def _index_groups_alt(
    grouped_by_name: dict[str, list[tuple[str, dict]]],
) -> tuple[dict[str, list[tuple[str, dict]]], list[tuple[str, str, dict]]]:
    """1차 색인을 2차용으로 재색인 — alt 키 색인 + 부분포함 스캔용 평탄 리스트.

    Returns:
        ({alt키: [(aphusCode, group), ...]}, [(alt키, aphusCode, group), ...])

    비용 — 호출처가 이 함수를 **1차 미매칭 단지마다** 부르므로 실제 비용은
    O(미매칭 단지 수 × 그 동의 공시 그룹 수)다(fetch 단위 1회가 아니다).
    법정동 하나가 미매칭 수십 × 그룹 수십 수준이고, 같은 fetch 단위의 지배적 비용은
    V-WORLD 조회(수 초)라 이 재색인은 실측상 무시 가능하다. 1차 색인을 만들 때 함께
    만들지 않고 따로 도는 이유 = 1차 경로 무변경 원칙(호출 빈도보다 우선).
    """
    alt_index: dict[str, list[tuple[str, dict]]] = {}
    flat: list[tuple[str, str, dict]] = []
    for candidates in grouped_by_name.values():
        for code, group in candidates:
            alt_key = _normalize_alt(group["name"])
            if not alt_key:
                continue
            alt_index.setdefault(alt_key, []).append((code, group))
            flat.append((alt_key, code, group))
    return alt_index, flat


def match_complex_group_secondary(
    complex_name: str,
    household_count: int | None,
    grouped_by_name: dict[str, list[tuple[str, dict]]],
    claimed: set[str],
) -> tuple[str, dict] | None:
    """1차 실패 단지 전용 2차 매칭 — 이름 표기 차이만 흡수한다 (PR-E3).

    Args:
        complex_name: 우리 DB 단지명
        household_count: 우리 DB 세대수
        grouped_by_name: 1차와 같은 {정규화이름: [(aphusCode, group), ...]}
        claimed: 이 fetch 단위에서 **이미 다른 단지가 가져간** aphusCode 집합

    안전장치는 1차와 동일하게 3중이다 — 세대수 ±5% 게이트 + 후보 유일성 +
    claimed 제외. 보수 원칙("틀린 값 < 값 없음")을 2차에서도 그대로 지킨다.

    단계:
      (a) alt 키 완전일치 — 게이트·claimed 통과 후보가 정확히 1개면 채택.
      (a') **완전일치 키가 색인에 존재하기만 하면 (b)로 넘어가지 않는다** — 후보가
          모호(2개+)했든 게이트 탈락·claimed 로 전멸했든 마찬가지다. 이름-쌍둥이
          그룹의 존재 자체가 "진짜 짝이 여기 있(었)다"는 강한 증거라서, 그 짝이
          V-WORLD 드리프트로 게이트를 놓쳤거나 이미 선점됐다면 정답은 None(이번 달
          미스 → 재수집·다음 달 구제)이지 더 느슨한 부분포함이 아니다. 이 차단이
          없으면 드리프트로 인한 **미스가 오매칭으로 변환**된다(적대검증 HIGH-1).
      (b) 부분포함 — 완전일치 키가 **아예 없을 때만**. 우리 "신당한화꿈에그린" ↔
          공시 "한화꿈에그린" 처럼 동명(洞名) 프리픽스가 붙는 실측 패턴 회수용.
          두 가지를 추가로 막는다:
            · 짧은 쪽 길이 3 미만 제외 ("동" 같은 2글자가 아무 데나 붙는 폭발 차단)
            · **잉여 문자열에 숫자가 있으면 제외** — "현대홈타운" ⊂ "현대홈타운2차"
              의 잉여 "2차" 는 표기 차이가 아니라 **형제 단지(차수) 신호**다. 이걸
              허용하면 차수 단지가 서로를 흡수해 오매칭이 된다(적대검증 HIGH-1).
              잉여가 무숫자면(예: "신당") 동명 프리픽스로 보고 살린다.
          포함 방향은 양방향 유지 — 역방향(우리 이름이 더 긴) 동명 프리픽스가
          실사례라 방향 한정은 기각했다.
    """
    key = _normalize_alt(complex_name)
    if not key:
        return None

    alt_index, flat = _index_groups_alt(grouped_by_name)

    # (a) alt 키 완전일치
    exact_all = alt_index.get(key, [])
    exact = [
        (code, group)
        for code, group in exact_all
        if code not in claimed and _household_gate_ok(len(group["ho_keys"]), household_count)
    ]
    if len(exact) == 1:
        return exact[0]
    # (a') 이름-쌍둥이가 하나라도 있으면 여기서 끝 — (b) 진입 금지 (docstring 참조)
    if exact_all:
        return None

    # (b) 부분포함 (한쪽이 다른쪽을 완전히 품는 경우만, 같은 키는 (a) 소관)
    partial = []
    for alt_key, code, group in flat:
        if alt_key == key or code in claimed:
            continue
        if min(len(alt_key), len(key)) < _PARTIAL_MIN_LEN:
            continue
        if alt_key in key:
            long_key, short_key = key, alt_key
        elif key in alt_key:
            long_key, short_key = alt_key, key
        else:
            continue
        # 잉여에 숫자 → 형제 단지(차수) 신호라 같은 단지로 보지 않는다
        if any(c.isdigit() for c in long_key.replace(short_key, "", 1)):
            continue
        if _household_gate_ok(len(group["ho_keys"]), household_count):
            partial.append((code, group))
    if len(partial) != 1:
        return None
    return partial[0]


def _to_area(raw) -> Decimal | None:
    """전용면적 문자열 → Decimal (소수 2자리).

    ⚠ float 를 경유하면 안 된다 — PG NUMERIC(8,2) 반올림과 어긋나면 같은 평형이
    별개 행으로 쌓인다(복합 충돌키의 한 축). 문자열에서 곧바로 Decimal 로 간다.
    """
    if raw is None:
        return None
    try:
        return Decimal(str(raw).strip()).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError, ArithmeticError):
        return None


def _to_price(raw) -> int | None:
    """공시가격 문자열(원 단위) → int. 0·음수·파싱 실패는 None."""
    if raw is None:
        return None
    try:
        value = int(str(raw).strip())
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def _ho_key(row: dict) -> tuple:
    """호 식별 키 (dongNm, hoNm) — 게이트(ho_keys)와 집계(ho_count)가 같은 키를 쓴다."""
    return (row.get("dongNm"), row.get("hoNm"))


def _group_by_aphus(rows: list[dict]) -> dict[str, dict]:
    """공시 행들을 단지(aphusCode) 단위로 묶는다.

    반환: {aphusCode: {"name": 대표 단지명, "ho_keys": {(dongNm,hoNm)}, "rows": [...]}}
    stdrMt 방어 필터(=TARGET_STDR_MT)를 여기서 적용한다.
    """
    grouped: dict[str, dict] = {}
    for row in rows:
        if (row.get("stdrMt") or "").strip() != TARGET_STDR_MT:
            continue
        code = (row.get("aphusCode") or "").strip()
        if not code:
            continue
        group = grouped.get(code)
        if group is None:
            group = {"name": (row.get("aphusNm") or "").strip(), "ho_keys": set(), "rows": []}
            grouped[code] = group
        group["ho_keys"].add(_ho_key(row))
        group["rows"].append(row)
    return grouped


def _household_gate_ok(ho_count: int, household_count: int | None) -> bool:
    """공시측 유니크 호수 vs 우리 세대수 ±5% 게이트.

    세대수(total_household_count)가 없으면 대조 기준이 없어 통과시키지 않는다 —
    APT/JGC 실측 NULL 0건이라 이 분기는 사실상 방어용이다.
    """
    if not household_count or household_count <= 0:
        return False
    ratio = ho_count / household_count
    return (1 - HOUSEHOLD_TOLERANCE) <= ratio <= (1 + HOUSEHOLD_TOLERANCE)


def match_complex_group(
    complex_name: str,
    household_count: int | None,
    grouped_by_name: dict[str, list[tuple[str, dict]]],
) -> tuple[str, dict] | None:
    """단지 하나에 대응하는 공시 단지 그룹을 찾는다. 못 찾거나 모호하면 None.

    Args:
        complex_name: 우리 DB 단지명
        household_count: 우리 DB 세대수
        grouped_by_name: {정규화이름: [(aphusCode, group), ...]}

    규칙(플랜 §3-2-5):
      1) 정규화 이름 완전일치 후보만 본다.
      2) 세대수 ±5% 게이트를 통과한 후보만 남긴다.
      3) 남은 후보가 정확히 1개일 때만 채택 — 2개 이상이면 폐기(임의 선택 금지).
    """
    key = normalize_complex_name(complex_name)
    if not key:
        return None
    candidates = grouped_by_name.get(key) or []
    passed = [
        (code, group)
        for code, group in candidates
        if _household_gate_ok(len(group["ho_keys"]), household_count)
    ]
    if len(passed) != 1:
        return None
    return passed[0]


def aggregate_area_medians(rows: list[dict]) -> list[tuple[Decimal, int, int]]:
    """공시 행들을 전용면적별 중위 공시가격으로 집계.

    Returns: [(prvuse_ar, price_median, ho_count), ...] — 면적 오름차순.
    같은 면적의 여러 호(dongNm/hoNm)를 중위값으로 묶고 표본 수를 남긴다.

    표본 수 = **유니크 호**(dongNm,hoNm). V-WORLD 는 호마다 완전 동일 행을 2회 반환하므로
    (2026-08-22 실측: pnu=2826011800 2,622행 = 유니크 1,311 × 2; 페이지네이션 드리프트로 1·3회도
    섞인다 — dedupe 는 배수와 무관하게 옳다), 원본 행 수로 세면 세대수의 2배가 저장된다.
    fetch 층의 행수 정합성 가드는 raw 행수 기준이라 dedupe 는 여기(집계)에서만 한다 —
    같은 _ho_key 의 **유효한** 첫 행만 쓴다(앞 복제본이 깨져 있으면 뒤의 멀쩡한 복제본 사용).
    """
    buckets: dict[Decimal, list[int]] = {}
    seen: set[tuple] = set()
    for row in rows:
        key = _ho_key(row)
        if key in seen:
            continue
        area = _to_area(row.get("prvuseAr"))
        price = _to_price(row.get("pblntfPc"))
        if area is None or price is None:
            continue
        seen.add(key)  # 유효 행만 '본 것'으로 — 첫 복제본이 깨져도 뒤의 멀쩡한 복제본이 살아남는다
        buckets.setdefault(area, []).append(price)

    result = []
    for area in sorted(buckets):
        prices = buckets[area]
        result.append((area, int(statistics.median(prices)), len(prices)))
    return result


def _alert_official_price(message: str) -> None:
    """운영 텔레그램 알림 — 실패해도 수집을 죽이지 않는다(best-effort, lazy import).

    job_error_listener._send_alert 패턴 답습. TELEGRAM_ENABLED 토글을 공유하며,
    테스트에서는 conftest 가 그 토글을 false 로 강제해 실발송이 0 이다(세션 325 사고 답습).
    """
    try:
        from services.telegram import send_telegram

        send_telegram(message)
    except Exception:
        logger.warning("[official_price] 텔레그램 알림 발송 실패", exc_info=True)


def _probe_reform_migration(year: str) -> None:
    """신코드 이관 감시 — 보초 신코드에 데이터가 생겼으면 텔레그램 경보 1회.

    2026 개편 지역은 to_vworld_cortar() 번역(신코드 → 옛코드)으로 조회한다. V-WORLD 가
    데이터를 신코드로 이관하기 시작하면 그 번역이 오히려 **빈 옛 코드 조회**가 되어
    조용히 0건이 된다. 보초 신코드를 1페이지만 찔러 총 행수>0 이면 이관 시작으로 본다.

    경보만 하고 자동 전환은 하지 않는다 — 과도기에 신·옛 코드가 양쪽 다 살아 있을 수
    있어(중복 수집 위험) 전환 시점은 사람이 판단한다.

    감시가 수집을 죽이면 안 되므로 어떤 경우에도 예외를 밖으로 던지지 않는다.
    조회 실패(None)·0건은 조용히 통과한다(0건 = 아직 이관 전 = 정상).
    """
    try:
        # lazy import — import chain 실패 방지 (collect_official_prices 답습)
        from crawler.vworld_price_api import probe_official_price_total

        migrated: list[str] = []
        for code, label in _MIGRATION_SENTINELS.items():
            try:
                total = probe_official_price_total(code, year)
            except Exception:
                logger.warning(
                    "[official_price] 이관 감시 프로브 실패 (%s %s)", label, code, exc_info=True
                )
                continue
            if total and total > 0:
                migrated.append(f"{label}({code}) {total:,}행")

        if not migrated:
            return

        detail = " / ".join(migrated)
        logger.warning("[official_price] 신코드 이관 감지 — %s", detail)
        _alert_official_price(
            "⚠️ 공시가격 V-WORLD 신코드 이관 감지 — cortar_legacy 개편맵 번역이 역효과 "
            f"시작. 감지 보초: {detail}. 이관 지역은 번역 해제·신코드 직접 조회 전환 "
            "검토 필요(과도기 양쪽 공존 가능성 때문에 자동 전환은 하지 않음)."
        )
    except Exception:
        logger.warning("[official_price] 이관 감시 자체 실패 — 수집은 계속", exc_info=True)


def _save_matched_areas(db, complex_no: str, year: str, aphus_code: str, group: dict) -> int:
    """매칭된 공시 그룹을 평형별 중위가로 저장. 반환: 저장한 행 수(0 이면 미저장).

    본 루프와 재수집 패스가 같은 저장 규칙을 쓰도록 한 곳에 모은 것뿐이다.
    """
    areas = aggregate_area_medians(group["rows"])
    for area, median_price, ho_count in areas:
        _do_upsert(
            db,
            ComplexOfficialPrice,
            {
                "complex_no": complex_no,
                "stdr_year": year,
                "prvuse_ar": area,
                "price_median": median_price,
                "ho_count": ho_count,
                "aphus_code": aphus_code,
                "aphus_nm": group["name"],
                "collected_at": utcnow(),
            },
            ["complex_no", "stdr_year", "prvuse_ar"],
        )
    return len(areas)


def _index_groups_by_name(rows: list[dict]) -> dict[str, list[tuple[str, dict]]]:
    """공시 행 → {정규화 단지명: [(aphusCode, group), ...]} 매칭용 색인."""
    grouped_by_name: dict[str, list[tuple[str, dict]]] = {}
    for code, group in _group_by_aphus(rows).items():
        grouped_by_name.setdefault(normalize_complex_name(group["name"]), []).append(
            (code, group)
        )
    return grouped_by_name


def _find_regressed_targets(
    db, targets: list, matched_complex_nos: set[str], processed_ld_codes: set[str], year: str
):
    """이번 실행에서 매칭이 '소실'된 단지 목록 — 올해 값이 있었는데 이번엔 못 붙은 것.

    V-WORLD 페이지네이션이 불안정해 같은 법정동을 연속 조회해도 총행수는 같은데 행
    구성이 다르다(중복+누락). 대형 단지가 뒷페이지에 몰려 유니크 호수가 실행마다
    흔들리고, 세대수 ±5% 게이트에서 비결정적으로 탈락한다(세션 370 라이브 실증:
    은마 유니크 호수 1차 3,947(탈락) vs 2차 4,320(통과)). 기존 행수 정합성 가드는
    총량이 맞아떨어져 못 잡는다.

    소실 판정 3조건 (AND) — 셋 다 있어야 오탐이 안 난다:
      1) 이번 실행에서 미매칭
      2) **이번 실행이 실제로 조회한 법정동**(processed_ld_codes)에 속함 — 체크포인트로
         스킵된 동(재개 실행의 관할 밖)과 조회 실패한 동(원인이 API 다운이지 매칭
         문제가 아님)을 동시에 배제한다. 이게 빠지면 재개 실행에서 수천~만 단지가
         한꺼번에 소실로 오판돼 진짜 드리프트 소실이 거짓 경보에 묻힌다.
      3) **올해(stdr_year=year) 행 보유** — 연도 무필터면 작년 행만 있는 단지가 연초
         (공시 미발표) 실행마다 소실로 잡혀 오탐이 폭발하고, 영구 미매칭 단지가 매달
         재판정돼 경보 피로를 만든다.

    판정은 "올해 행이 있었나" **존재 여부만** 본다 — 수집 시각의 크기 비교는 하지 않는다
    (관할 범위는 위 2)의 processed_ld_codes 가 이미 가른다). collected_at 이 NULL 인
    행만 가진 단지는 제외 = 신규 취급 — 수집 시각을 모르면 '과거에 있었다'를 주장할 수 없다.
    """
    if not processed_ld_codes:
        return []

    candidates = [
        t
        for t in targets
        if t.complex_no not in matched_complex_nos and t.cortar_no in processed_ld_codes
    ]
    if not candidates:
        return []

    # 전체 단지를 IN 절에 넣지 않는다(수만 개) — 올해 행 보유 단지를 통째로 뽑아 Python 에서 교집합.
    prior_seen = {
        row[0]
        for row in db.query(ComplexOfficialPrice.complex_no)
        .filter(
            ComplexOfficialPrice.stdr_year == year,
            ComplexOfficialPrice.collected_at.isnot(None),
        )
        .distinct()
        .all()
    }

    return [t for t in candidates if t.complex_no in prior_seen]


def collect_official_prices(
    stdr_year: str | None = None,
    scheduler_job_id: str | None = None,
):
    """공동주택 공시가격 수집 — 법정동 루프 → 단지 매칭 → 평형별 중위가 저장.

    Args:
        stdr_year: 기준연도 4자리 문자열. 미지정 시 현재 연도.
        scheduler_job_id: 스케줄러 잡 ID (관리자 화면 last_run 표시용)

    토글: OFFICIAL_PRICE_ENABLED (기본 false). 꺼져 있으면 cancelled 로 기록만 남긴다.
    """
    if os.getenv("OFFICIAL_PRICE_ENABLED", "false").strip().lower() != "true":
        logger.info("[official_price] OFFICIAL_PRICE_ENABLED 미설정 — 공시가격 수집 건너뜀")
        if scheduler_job_id:
            db = SessionLocal()
            try:
                job = _record_job(db, "official_price", scheduler_job_id)
                job.status = "cancelled"
                job.error_message = "OFFICIAL_PRICE_ENABLED 미설정"
                job.completed_at = utcnow()
                db.commit()
            finally:
                db.close()
        return

    year = (stdr_year or str(date.today().year)).strip()

    # lazy import — import chain 실패 방지 (service_public.py 답습)
    from crawler.vworld_price_api import fetch_official_prices

    # 신코드 이관 감시 — 경보만 하고 수집 흐름에는 영향 0 (best-effort).
    _probe_reform_migration(year)

    db = SessionLocal()

    # 재개(resume) — 직전 중단분의 체크포인트를 이어받는다. 최근 N건을 최신순으로 훑어
    # 체크포인트가 실제로 있는 첫 job 을 찾는다(연속 2회 실패 시 2번째 job 이 자기
    # 체크포인트를 저장하기 전에 죽으면 진행분이 유실되던 세션 346 사고 답습).
    #
    # ⚠ 건수 상한(10)만으론 부족하다(세션 370 발견) — 실패 잡의 체크포인트는 영구 잔존하고
    # 이 잡은 월 1회라 신규 실패가 쌓여 밀려나지도 않는다. 9/15 실행이 중간 실패하고 아무도
    # 재트리거 안 하면 10/15 정기 실행이 지난달 "완료 목록"을 이어받아 그 절반을 스킵하고,
    # 연도가 넘어가면 작년 완료 마커로 올해 수집을 스킵한다(체크포인트에 연도 정보 없음).
    # 재개는 "중단 직후 곧 재실행" 의도이므로 신선도(RESUME_MAX_AGE_HOURS)로 함께 막는다.
    done_ld_codes: set[str] = set()
    resume_cutoff = utcnow() - timedelta(hours=RESUME_MAX_AGE_HOURS)
    recent_stopped_jobs = (
        db.query(CrawlJob)
        .filter(
            CrawlJob.job_type == "official_price",
            CrawlJob.status.in_(["failed", "cancelled"]),
            CrawlJob.started_at >= resume_cutoff,
        )
        .order_by(CrawlJob.id.desc())
        .limit(10)
        .all()
    )
    for prev_job in recent_stopped_jobs:
        prev_state = _checkpoint.load(db, prev_job.id)
        if prev_state and prev_state.get("done_ld_codes"):
            done_ld_codes = set(prev_state["done_ld_codes"])
            logger.info(
                "[official_price] 재개: 이전 job %d 에서 법정동 %d개 완료분 이어받음",
                prev_job.id, len(done_ld_codes),
            )
            break

    job = _record_job(db, "official_price", scheduler_job_id or "collect_official_prices")

    try:
        # cortar_no 가 없는 대상은 조회 자체가 불가 — 건수만 남긴다(플랜 §2).
        missing_cortar = (
            db.query(Complex.complex_no)
            .filter(
                Complex.real_estate_type_code.in_(TARGET_TYPE_CODES),
                Complex.cortar_no.is_(None),
            )
            .count()
        )
        if missing_cortar:
            logger.info("[official_price] cortar_no 없는 대상 %d개 제외", missing_cortar)

        targets = (
            db.query(
                Complex.complex_no,
                Complex.complex_name,
                Complex.cortar_no,
                Complex.total_household_count,
            )
            .filter(
                Complex.real_estate_type_code.in_(TARGET_TYPE_CODES),
                Complex.cortar_no.isnot(None),
            )
            .all()
        )

        # 법정동별로 우리 단지를 묶는다 — API 호출 단위가 법정동이므로.
        by_ld_code: dict[str, list] = {}
        for row in targets:
            by_ld_code.setdefault(row.cortar_no, []).append(row)

        all_ld_codes = sorted(by_ld_code)
        remaining = [c for c in all_ld_codes if c not in done_ld_codes]
        logger.info(
            "[official_price] %s년 수집 시작: 단지 %d개 / 법정동 %d개 중 %d개 남음",
            year, len(targets), len(all_ld_codes), len(remaining),
        )

        matched_complexes = 0
        saved_rows = 0
        # 2차(이름) 매칭으로 건진 단지 수 — 3개 패스 공통 누계. 9/15 정기 실행에서
        # PR-E3 의 실효를 완료 로그로 측정하기 위한 관찰 지표다.
        name_matched = 0
        failed_ld_codes = 0
        failed_ld_codes_list: list[str] = []
        # 이번 실행에서 실제로 매칭된 단지 — 재수집 패스의 '소실' 판정 기준.
        matched_complex_nos: set[str] = set()
        # 이번 실행이 **조회에 성공한** 법정동 — 소실 판정의 관할 범위.
        # 체크포인트로 스킵된 동·조회 실패한 동은 여기 안 들어가 자연 배제된다.
        processed_ld_codes: set[str] = set()
        # 동별로 본루프가 이미 배정한 공시 그룹(aphusCode) — 재수집 패스에 인계한다.
        # aphusCode 는 V-WORLD 단지 고유코드라 재fetch 사이에 안정적이므로, 본루프에서
        # 다른 단지가 가져간 그룹을 재수집의 2차가 다시 집어 **이중 배정**(한쪽은 필연
        # 오매칭, 월 1회 잡이라 매달 고착)되는 것을 막는다(적대검증 MEDIUM-1).
        claimed_by_dong: dict[str, set[str]] = {}

        for idx, ld_code in enumerate(remaining):
            # 전 페이지 수집 완료 후에만 매칭 — 부분 수집 시 세대수 게이트가 통째로
            # 어긋난다(V-WORLD 가 대형 단지를 뒷페이지에 배치, 플랜 §3-2-5).
            #
            # ⚠ 조회 직전에만 V-WORLD 용 코드로 번역한다(cortar_legacy.py 참조).
            # 두 가지가 걸린다 — ① 광주·전남 12-프리픽스(V-WORLD 는 옛 29/46 만 받음)
            # ② 2026 개편 신코드(V-WORLD 는 아직 개편 전 옛 코드에만 데이터 보유).
            # ②는 **공시가격 전용**이라 to_standard_cortar 가 아니라 to_vworld_cortar 를
            # 쓴다 — 국토부 실거래가는 정반대로 신 코드를 받기 때문이다.
            # 루프 키·체크포인트(done_ld_codes)는 **원본 그대로** 둬야 재개 호환이
            # 깨지지 않는다.
            rows = fetch_official_prices(to_vworld_cortar(ld_code), year)
            if rows is None:
                # 4번째 재시도 계층 — vworld_price_api.py 내부에 이미 429 전용
                # MAX_RETRIES=3 재시도가 있지만, 그건 페이지 단위(1회 호출)의 순간적인
                # rate limit 만 흡수한다. 이건 그 위에 얹는 법정동 단위 1회 재시도다 —
                # 대형 법정동(대치동 49페이지 등)은 페이지 수가 많아 그 사이 어딘가
                # 일시적 네트워크 오류·타임아웃으로 통째 실패하는 빈도가 높은데, 몇 초
                # 후 재시도하면 살아나는 경우가 실측상 다수라 여기서 한 번 더 감아준다.
                time.sleep(2)
                rows = fetch_official_prices(to_vworld_cortar(ld_code), year)
            if rows is None:
                failed_ld_codes += 1
                failed_ld_codes_list.append(ld_code)
                logger.warning("[official_price] 법정동 %s 조회 실패 — 건너뜀", ld_code)
                continue

            # 조회 성공 — 빈 리스트(공시 0건인 동)도 성공이다. 소실 판정 관할에 넣는다.
            processed_ld_codes.add(ld_code)
            grouped_by_name = _index_groups_by_name(rows)

            # 1차(완전일치) 전량 처리 후에 2차(이름)를 돌린다 — 순서가 뒤집히면 느슨한
            # 2차가 그룹을 먼저 선점해 뒤 단지의 엄격한 1차 매칭을 뺏는다(PR-E3).
            claimed: set[str] = set()
            unmatched: list = []
            for target in by_ld_code[ld_code]:
                hit = match_complex_group(
                    target.complex_name, target.total_household_count, grouped_by_name
                )
                if hit is None:
                    unmatched.append(target)
                    continue
                aphus_code, group = hit

                n_saved = _save_matched_areas(db, target.complex_no, year, aphus_code, group)
                if not n_saved:
                    continue
                saved_rows += n_saved
                matched_complexes += 1
                matched_complex_nos.add(target.complex_no)
                claimed.add(aphus_code)

            for target in unmatched:
                hit = match_complex_group_secondary(
                    target.complex_name, target.total_household_count, grouped_by_name, claimed
                )
                if hit is None:
                    continue
                aphus_code, group = hit

                n_saved = _save_matched_areas(db, target.complex_no, year, aphus_code, group)
                if not n_saved:
                    continue
                saved_rows += n_saved
                matched_complexes += 1
                matched_complex_nos.add(target.complex_no)
                claimed.add(aphus_code)
                name_matched += 1

            # 1차·2차 저장 성공분 모두 인계 대상 (재수집 패스가 이어받는다)
            if claimed:
                claimed_by_dong[ld_code] = claimed

            done_ld_codes.add(ld_code)

            # 체크포인트 — 완료된 법정동 코드 집합 저장 (재개 시 이 집합을 건너뜀).
            if _checkpoint.should_save(idx + 1):
                db.commit()
                _checkpoint.save(
                    db, job.id,
                    {"done_ld_codes": sorted(done_ld_codes), "total": len(all_ld_codes)},
                )
                logger.info(
                    "[official_price] 중간 저장: 법정동 %d/%d 완료, 단지 %d개 매칭",
                    len(done_ld_codes), len(all_ld_codes), matched_complexes,
                )

        db.commit()

        # 체크포인트는 **본 루프 완주 시점**에 지운다 — 이후 단계(재수집)에서 죽어도
        # 다음 주기가 낡은 완료 마커를 이어받아 "거의 다 했다"고 착각하며 아무것도
        # 안 하는 사태를 막는다.
        #
        # 대가로 삭제~완료 사이에 강제종료되면 재실행이 전량 재수집이 되는 창이 생긴다.
        # 그래도 수용한다 — 월 1회 잡의 최대 ~1시간짜리 창이고(_REPASS_MAX_SECONDS 캡으로 바운드) 이미
        # 커밋된 데이터는 무손실이라 손해가 재크롤 시간뿐이다. 진짜 재개를 하려면 이번
        # 실행의 매칭 단지 ~2.5만 개를 체크포인트 blob 에 영속해야 해서 그 비용·신규
        # 실패 모드가 기대이익을 넘는다(세션 371 설계노트).
        _checkpoint.delete(db, job.id)

        # ── 매칭 소실 재수집 패스 ──
        # V-WORLD 는 같은 법정동을 연속 조회해도 총행수만 같고 행 구성이 달라진다
        # (중복+누락). 그래서 대형 단지가 한 번은 게이트를 통과하고 한 번은 탈락한다.
        # 두 번째 표본을 떠서 구제하는 것이 이 패스의 전부다 — 매칭 규칙 자체는 그대로.
        #
        # 전체를 try 로 감싼다 — 구제는 best-effort 라, 재수집 중 예외가 본 수집 성공을
        # 실패로 뒤집으면 안 된다(그 경우 outer except 로 빠져 job 이 failed 가 된다).
        rescued = 0
        repass_fetch_failed = 0
        try:
            regressed = _find_regressed_targets(
                db, targets, matched_complex_nos, processed_ld_codes, year
            )

            if len(regressed) > _REPASS_COLLAPSE_THRESHOLD:
                # 드리프트가 아니라 시스템 이상 — 재수집은 구제가 아니라 폭주가 된다.
                logger.error(
                    "[official_price] 매칭 소실 %d단지로 임계 %d 초과 — 페이지 드리프트가"
                    " 아니라 시스템 이상 의심, 재수집 생략",
                    len(regressed), _REPASS_COLLAPSE_THRESHOLD,
                )
                job.error_message = (
                    f"매칭 소실 {len(regressed)}단지로 임계 {_REPASS_COLLAPSE_THRESHOLD} 초과"
                    " — 시스템 이상 의심, 재수집 생략"
                )[:500]
                db.commit()
                _alert_official_price(
                    f"[내부즉시] 공동주택 공시가격 — 매칭 소실 {len(regressed)}단지로 임계"
                    f" {_REPASS_COLLAPSE_THRESHOLD} 초과. 페이지 드리프트가 아니라 시스템 이상"
                    " 의심(매칭 규칙·API 응답 구조 변경 등)이라 재수집을 생략했습니다."
                )
                regressed = []

            if regressed:
                by_dong: dict[str, list] = {}
                for target in regressed:
                    by_dong.setdefault(target.cortar_no, []).append(target)

                # 소실 단지가 많은 동부터 — 상시 초과 상황에서 특정 지역이 매달 뒤로
                # 밀려 영구히 구제받지 못하는 기아를 막는다(오름차순 절단의 함정).
                repass_dongs = sorted(by_dong, key=lambda c: (-len(by_dong[c]), c))
                if len(repass_dongs) > _REPASS_MAX_DONGS:
                    logger.warning(
                        "[official_price] 재수집 대상 법정동 %d개가 상한 %d개 초과 — 소실"
                        " 많은 순 %d개만 재조회 (초과 %d개는 잔여로 남김)",
                        len(repass_dongs), _REPASS_MAX_DONGS, _REPASS_MAX_DONGS,
                        len(repass_dongs) - _REPASS_MAX_DONGS,
                    )
                    repass_dongs = repass_dongs[:_REPASS_MAX_DONGS]

                logger.info(
                    "[official_price] 매칭 소실 %d단지 감지 — 법정동 %d개 재수집 시작",
                    len(regressed), len(repass_dongs),
                )
                repass_start = time.monotonic()
                for repass_idx, ld_code in enumerate(repass_dongs):
                    # 시간 캡은 **동 경계**에서만 본다 — 페이지 단위로 쪼개면 중간에 끊긴
                    # 부분 수집이 세대수 게이트를 통째로 어긋나게 한다. 초과분은 대형 동
                    # 1개(수 분)로 바운드되므로 단순한 이 방식으로 충분하다.
                    if time.monotonic() - repass_start > _REPASS_MAX_SECONDS:
                        logger.warning(
                            "[official_price] 재수집 벽시계 캡 %d초 초과 — 남은 법정동"
                            " %d개 중단 (미구제 단지는 잔여 보고에 합류)",
                            _REPASS_MAX_SECONDS, len(repass_dongs) - repass_idx,
                        )
                        break

                    rows = fetch_official_prices(to_vworld_cortar(ld_code), year)
                    if rows is None:
                        # ⚠ failed_ld_codes/리스트에 넣지 않는다 — 재수집 대상 동은 정의상
                        # 본 루프에서 조회 **성공**한 동이라, 여기 합산하면 "조회 실패 동
                        # 목록"이 오염되고 total_items(=collected+failed)도 부풀려진다.
                        # 재수집 실패는 별도로만 세어 완료 로그에 구분 출력한다.
                        repass_fetch_failed += 1
                        logger.warning("[official_price] 재수집 법정동 %s 조회 실패", ld_code)
                        continue

                    grouped_by_name = _index_groups_by_name(rows)
                    # 본루프가 이 동에서 이미 배정한 그룹을 이어받아 시작한다 —
                    # 빈 set 으로 시작하면 재수집의 2차가 그 그룹을 다시 집어 이중
                    # 배정이 된다(적대검증 MEDIUM-1). 복사본을 쓴다(원본 불변).
                    repass_claimed: set[str] = set(claimed_by_dong.get(ld_code, ()))
                    repass_unmatched: list = []
                    for target in by_dong[ld_code]:
                        hit = match_complex_group(
                            target.complex_name, target.total_household_count, grouped_by_name
                        )
                        if hit is None:
                            repass_unmatched.append(target)
                            continue
                        aphus_code, group = hit

                        n_saved = _save_matched_areas(
                            db, target.complex_no, year, aphus_code, group
                        )
                        if not n_saved:
                            continue
                        saved_rows += n_saved
                        matched_complexes += 1
                        matched_complex_nos.add(target.complex_no)
                        repass_claimed.add(aphus_code)
                        rescued += 1

                    for target in repass_unmatched:
                        hit = match_complex_group_secondary(
                            target.complex_name, target.total_household_count,
                            grouped_by_name, repass_claimed,
                        )
                        if hit is None:
                            continue
                        aphus_code, group = hit

                        n_saved = _save_matched_areas(
                            db, target.complex_no, year, aphus_code, group
                        )
                        if not n_saved:
                            continue
                        saved_rows += n_saved
                        matched_complexes += 1
                        matched_complex_nos.add(target.complex_no)
                        repass_claimed.add(aphus_code)
                        # 이 패스가 구제한 것이므로 rescued 도 함께 센다 — 기존 카운터
                        # 의미("재수집이 되찾은 단지 수") 유지.
                        rescued += 1
                        name_matched += 1
                db.commit()

                remaining_lost = [
                    t for t in regressed if t.complex_no not in matched_complex_nos
                ]
                if remaining_lost:
                    summary = ", ".join(
                        f"{t.complex_no}({t.complex_name})" for t in remaining_lost[:10]
                    )
                    logger.warning(
                        "[official_price] 재수집 후에도 미매칭 잔여 %d단지: %s",
                        len(remaining_lost), summary,
                    )
                    # status 는 completed 유지 — 전량 실패가 아니라 일부 소실이라 실패로
                    # 끊으면 정상 수집분까지 실패로 보인다. 잔여 사실만 남겨 추적 가능하게 한다.
                    job.error_message = (
                        f"재수집 후 미매칭 잔여 {len(remaining_lost)}단지: {summary}"
                    )[:500]
                    db.commit()
                    # completed 잡의 error_message 는 admin 화면에서 행을 펼쳐야만 보이고
                    # monitor 텔레그램은 failed 만 감시한다 — 월 1회 잡이라 이대로면 다음
                    # 달까지 아무도 모른다. 관찰 가능하게 텔레그램으로 승격(best-effort).
                    _alert_official_price(
                        f"[내부즉시] 공동주택 공시가격 — 재수집 후에도 미매칭 잔여"
                        f" {len(remaining_lost)}단지: {summary}"
                    )
        except Exception:
            # 구제 실패는 본 수집 결과를 되돌리지 않는다 — 로그만 남기고 완료 경로 계속.
            logger.exception("[official_price] 재수집 패스 실패 — 본 수집 결과는 유지")
            db.rollback()

        # ── 읍/면 리(里) 확장 패스 ──
        # 재수집 패스(위)는 "이번 실행에서 소실된" 단지를 다시 줍는다 — 애초에 본루프에서
        # 한 번은 잡혔던 것들이다. 이 패스는 성격이 다르다: 읍/면 코드로는 **애초에** 공시
        # 가격이 0건이다(공시가 리 단위 코드에 붙어 있어서, cortar_legacy.py 전국 공통
        # 한계). 그래서 본루프의 by_ld_code 순회 자체가 그 읍/면에 대해 시도조차 못한다
        # (동 자체가 매칭 0건으로 지나갔을 뿐 실패로 기록되지도 않는다).
        #
        # PR-E2(세션 373) — cortar_ri_map.py 의 정적 dict(사장님 결정: 수동 재생성,
        # code.go.kr 을 매 실행마다 부르지 않는다)로 "이 읍/면 밑에 어떤 리가 있는지"를
        # 이미 안다. 리 하나하나는 fetch_official_prices() 입장에서 법정동 코드 하나와
        # 완전히 동일하게 다뤄진다(실측: 리마다 별도 단지 집합·별도 세대수 매칭이라 부분
        # 실패를 걱정할 필요가 없다 — 리 하나 실패 = 그 리 소속 단지만 스킵).
        expanded = 0
        ri_fetch_failed = 0
        try:
            from crawler.cortar_ri_map import expand_to_ri_codes

            # 대상 = 이번 실행이 조회한 읍/면 코드 중 dict 가 아는 것. remaining 이 아니라
            # processed_ld_codes 를 쓴다 — 체크포인트로 스킵된 동(재개 실행)까지 매번
            # 재확장하면 이미 저장된 값을 매번 다시 덮어써 낭비다(멱등 upsert 라 안전하긴
            # 하나, 월 1회 잡의 시간 예산을 아끼는 게 낫다).
            #
            # ⚠ cortar_ri_map.py 의 dict 키는 **원본** cortar_no 다(생성 스크립트가
            # complexes.cortar_no 를 그대로 읽는다) — to_vworld_cortar() 로 번역한
            # 코드로 조회하면 안 맞는다. 리 코드를 조립한 **뒤**에 번역해야 한다 —
            # 화성 봉담읍(신 효행구 소속)처럼 "2026 개편 + 리 단위"가 겹친 읍/면은
            # 조립한 리 코드도 옛 코드로 번역해야 V-WORLD 가 받는다(모듈 docstring
            # 라이브 실증: 4159025322 는 8,068행, 번역 전 4159325022 는 미검증·매핑
            # 대상 접두사가 아니라 조용히 0건일 위험).
            ri_targets: dict[str, list[str]] = {}
            for ld_code in sorted(processed_ld_codes):
                ri_codes = expand_to_ri_codes(ld_code)
                if ri_codes:
                    ri_targets[ld_code] = ri_codes

            if ri_targets:
                total_ri = sum(len(v) for v in ri_targets.values())
                logger.info(
                    "[official_price] 읍/면 리 확장 시작: 읍/면 %d개 → 리 %d개",
                    len(ri_targets), total_ri,
                )
                # sorted() — processed_ld_codes 가 set 이라 dict 삽입 순서는 그걸 반영해
                # 결정적이지 않다. 실서비스 로직상 순서는 결과를 안 바꾸지만(리 하나하나가
                # 독립 단위), 테스트가 side_effect 리스트로 호출 순서를 고정하는 관례와
                # 맞추려면 여기서도 정렬이 필요하다(all_ld_codes = sorted(by_ld_code) 답습).
                for ld_code in sorted(ri_targets):
                    ri_codes = ri_targets[ld_code]
                    for ri_code in ri_codes:
                        rows = fetch_official_prices(to_vworld_cortar(ri_code), year)
                        if rows is None:
                            # 리 하나의 조회 실패는 그 리만 건너뛴다 — 읍/면 전체를
                            # 포기할 이유가 없다(리가 독립 단위이므로 위 docstring 답습).
                            ri_fetch_failed += 1
                            logger.warning("[official_price] 리 %s 조회 실패", ri_code)
                            continue

                        grouped_by_name = _index_groups_by_name(rows)
                        # 여기는 본루프 claimed 를 인계하지 않는다 — 이 패스의 대상
                        # 읍/면은 정의상 본루프에서 공시 0건이라(그래서 리로 확장한다)
                        # 본루프가 배정한 그룹 자체가 없다. 게다가 리 코드는 읍/면과
                        # 다른 조회 단위라 그룹 집합도 겹치지 않는다.
                        ri_claimed: set[str] = set()
                        ri_unmatched: list = []
                        for target in by_ld_code[ld_code]:
                            if target.complex_no in matched_complex_nos:
                                continue  # 이미 본루프·재수집에서 매칭된 단지는 재시도 안 함
                            hit = match_complex_group(
                                target.complex_name, target.total_household_count,
                                grouped_by_name,
                            )
                            if hit is None:
                                ri_unmatched.append(target)
                                continue
                            aphus_code, group = hit
                            n_saved = _save_matched_areas(
                                db, target.complex_no, year, aphus_code, group
                            )
                            if not n_saved:
                                continue
                            saved_rows += n_saved
                            matched_complexes += 1
                            matched_complex_nos.add(target.complex_no)
                            ri_claimed.add(aphus_code)
                            expanded += 1

                        for target in ri_unmatched:
                            hit = match_complex_group_secondary(
                                target.complex_name, target.total_household_count,
                                grouped_by_name, ri_claimed,
                            )
                            if hit is None:
                                continue
                            aphus_code, group = hit
                            n_saved = _save_matched_areas(
                                db, target.complex_no, year, aphus_code, group
                            )
                            if not n_saved:
                                continue
                            saved_rows += n_saved
                            matched_complexes += 1
                            matched_complex_nos.add(target.complex_no)
                            ri_claimed.add(aphus_code)
                            # 리 확장이 건진 것이므로 expanded 도 함께 — 기존 카운터
                            # 의미("확장 패스 신규 매칭 수") 유지.
                            expanded += 1
                            name_matched += 1
                db.commit()
                logger.info(
                    "[official_price] 읍/면 리 확장 완료: 단지 %d개 신규 매칭"
                    " (리 조회실패 %d개)",
                    expanded, ri_fetch_failed,
                )
        except Exception:
            # 확장 실패도 본 수집 결과를 되돌리지 않는다 — best-effort.
            logger.exception("[official_price] 읍/면 리 확장 패스 실패 — 본 수집 결과는 유지")
            db.rollback()

        # silent failure 가드 — 대상 단지는 있는데 한 건도 못 매칭했으면 '완료(0)'
        # 위장 대신 failed 로 알린다 (env_air.py 패턴 답습). 매칭 규칙·API 응답 구조
        # 변경이 조용히 전량 미매칭으로 나타나는 것을 잡는 유일한 그물.
        #
        # ⚠ 재수집 패스 **뒤에** 둔다 — 앞에 두면 드리프트로 전량 소실된 실행에서
        # 구제 기회 자체가 사라진다(가드가 return 으로 끊으므로). 매칭이 진짜로 깨졌다면
        # 재수집도 0건이라 여기서 똑같이 걸리므로 그물은 그대로 유효하다.
        #
        # ⚠ remaining 조건도 함께 본다 — 조회할 법정동이 0개인 실행(전량-done 체크포인트
        # 재개)은 "시도 0회"라 매칭 0 이 정상이다. 이걸 "전량 실패"와 구분하지 않으면
        # 정상 재개가 failed 로 오판된다(세션 370 리뷰어 2차 함정의 뿌리 — 지금은 그
        # 경로가 실질 불가능하지만, 재개 설계를 손댈 때 되살아나므로 선제 차단).
        if targets and remaining and matched_complexes == 0:
            # 문구는 remaining(이번 실행에서 실제 조회한 법정동)이 커버하는 단지 수 기준 —
            # remaining 자체는 법정동 코드 리스트라 len(remaining)을 그대로 쓰면 "단지 수"라는
            # 라벨과 단위가 어긋난다(법정동 수 ≠ 단지 수). targets(전체 로스터)를 쓰면
            # 체크포인트 부분 재개 시 "10,000개 전부 실패"처럼 과장된다(세션 371 백로그) —
            # 두 문제를 함께 해결하려면 remaining 소속 단지 수를 직접 세야 한다(세션 372 적대검증).
            attempted_complex_count = sum(len(by_ld_code[c]) for c in remaining)
            _fail_job(db, job, f"대상 단지 {attempted_complex_count}개 전부 매칭 실패 (수집 0건)")
            logger.error(
                "[official_price] silent failure 감지: 단지 %d개 전부 매칭 실패",
                attempted_complex_count,
            )
            return

        _complete_job(db, job, matched_complexes, failed_ld_codes)
        # ⚠ rescued 와 name_matched 는 **서로소가 아니다** — 재수집 패스에서 2차(이름)로
        # 건진 단지는 양쪽에 +1 된다(리 확장의 expanded 도 마찬가지). 세 수치를
        # matched_complexes 의 disjoint 분해로 읽으면 안 되고, 각각 "그 경로가 건진 수"로
        # 읽어야 한다.
        logger.info(
            "[official_price] 완료: 단지 %d개 매칭(재수집 구제 %d개, 이름 2차 매칭 %d개),"
            " 공시행 %d건 저장, 법정동 실패 %d개 %s, 재수집 조회실패 %d개",
            matched_complexes, rescued, name_matched, saved_rows, failed_ld_codes,
            failed_ld_codes_list[:20], repass_fetch_failed,
        )
    except Exception as exc:
        _fail_job(db, job, str(exc))
        logger.exception("[official_price] 수집 실패")
    finally:
        db.close()
