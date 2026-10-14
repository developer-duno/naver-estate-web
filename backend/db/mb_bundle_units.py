"""미분양 '단지 전체' 세대수 — 묶음 값 전환 표식 뒤에만 켜진다 (B22, 세션 465)

미분양 레포가 `apartments.unsold`·`unsold_rate` 를 같은 `complex_key` 묶음 값으로 바꾸면
행의 `units` 와 짝이 안 맞는다("4세대 · 미분양 231"). 묶음 세대수는 units 합이 아니라
미분양 VIEW `apartments_flat` 의 `units`(묶음당 1행, `"complexKey"` 칸)가 정본이다.

- 전환 표식 = `collector_runs` 에 kosis-unsold 성공 + `KOSIS_BUNDLE_APPLIED` 행 1개.
  참·거짓 모두 10분 뒤 다시 확인 — 미분양이 전환을 되돌리면 그 행 글자가
  `KOSIS_BUNDLE_REVERTED` 로 바뀌므로(LIKE 에 안 맞음) 10분 안에 꺼진다.
- 합치는 날 순서는 "VIEW 새 정의 먼저 → 몇 분 뒤 표식"이라, 표식 전엔 VIEW 를 읽지 않는다.
- 묶음 값을 받는 줄에만 붙인다 — 그 줄 id 가 VIEW `"memberIds"` 안에 있고(비면 건너뜀),
  그 줄 `unsold` 가 VIEW `unsold`(묶음 미분양)와 같을 때. (오) 오피스텔·임대·보류·청약홈 줄은
  묶음 미분양을 안 받으므로 행 세대수 그대로 보인다(미분양 VIEW 정의 20261013000000 :157-158·:382-383).
- PostgreSQL 일 때만 읽는다(SQLite·표식 없음·조회 실패 → 빈 사전).
- VIEW 는 CTE·DISTINCT ON 이라 WHERE 가 안으로 안 밀려 매번 전체를 계산할 가능성이 크다(미분양 회신) →
  요청마다 묻지 않고, 표식이 참일 때 VIEW 를 통째로 한 번 읽어 10분 기억한다(표식 재확인과 같은
  주기). 요청 처리는 메모리에서 꺼내기만(DB 조회 0). 재확인 중엔 직전 결과를 그대로 쓴다.
- 화면이 죽으면 안 되므로 예외는 밖으로 던지지 않는다. 조회가 실패하면 10분 동안 꺼 두고
  경고도 그 10분에 1줄만 — 권한·칸 이름이 틀어져도 요청마다 실패 쿼리가 반복되지 않게.
  SAVEPOINT 로 감싸 실패해도 같은 요청의 뒤 조회가 "트랜잭션 중단" 으로 막히지 않는다.
- 2u 는 두 표를 읽기만 한다(공유 표 쓰기 0).
"""

import logging
import time

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

_REFRESH_SEC = 600

# applied: 마지막 확인 결과 / bundles: 묶음 키 → (units, unsold, 구성원 id 집합)
# checked_at: 마지막 확인 시각(time.monotonic), None = 아직 안 봄
_state: dict = {"applied": False, "bundles": {}, "checked_at": None}

_MARKER_SQL = text(
    "SELECT 1 FROM collector_runs "
    "WHERE collector = 'kosis-unsold' AND status = 'success' "
    "AND error_message LIKE '%KOSIS_BUNDLE_APPLIED%' LIMIT 1"
)

_BUNDLES_SQL = text('SELECT "complexKey", units, unsold, "memberIds" FROM apartments_flat')


def _reset_cache() -> None:
    """시험용 — 캐시를 처음 상태로."""
    _state["applied"] = False
    _state["bundles"] = {}
    _state["checked_at"] = None


def _is_postgres(db: Session) -> bool:
    """운영(PostgreSQL)에서만 켠다 — 시험은 monkeypatch 로 이 분기를 연다."""
    return (db.bind.dialect.name if db.bind else "postgresql") == "postgresql"


def _member_ids(value) -> set[str]:
    """VIEW `"memberIds"`(PostgreSQL text[] → list) → id 집합. 글자 꼴 `{a,b}` 도 받는다."""
    if value is None:
        return set()
    if isinstance(value, (list, tuple)):
        return {str(v) for v in value if v is not None}
    parts = str(value).strip().strip("{}[]").split(",")
    return {p.strip().strip('"') for p in parts if p.strip().strip('"')}


def _read_bundles(db: Session) -> dict[str, tuple]:
    with db.begin_nested():
        rows = db.execute(_BUNDLES_SQL).all()
    bundles: dict[str, tuple] = {}
    dup = 0
    for key, units, unsold, members in rows:
        if key is None:
            continue
        if str(key) in bundles:
            dup += 1  # 원래 묶음당 1행 — 겹치면 첫 행만
            continue
        bundles[str(key)] = (units, unsold, _member_ids(members))
    if dup:
        logger.warning("미분양 VIEW 에 같은 묶음 키가 여러 행(%d행) — 첫 행만 씁니다", dup)
    return bundles


def _current_bundles(db: Session) -> dict[str, tuple]:
    """표식이 참이면 묶음 사전, 아니면 빈 사전 (10분 캐시 — 표식과 VIEW 를 같이 갱신)."""
    now = time.monotonic()
    checked_at = _state["checked_at"]
    if checked_at is not None and now - checked_at < _REFRESH_SEC:
        return _state["bundles"] if _state["applied"] else {}
    # 확인하는 동안 다른 요청은 직전 결과를 그대로 본다(깜빡임 없음)
    _state["checked_at"] = now
    try:
        with db.begin_nested():
            applied = db.execute(_MARKER_SQL).first() is not None
        bundles = _read_bundles(db) if applied else {}
    except Exception as e:  # noqa: BLE001 — 화면을 죽이지 않는다
        # 차단기: 10분 동안 꺼 둔다(다음 확인까지 표식·VIEW 조회 0, 경고도 이 1줄)
        _state["applied"], _state["bundles"] = False, {}
        logger.warning("미분양 묶음 세대수 조회 실패 — 10분 동안 행 세대수로 보입니다: %s", e)
        return {}
    _state["applied"], _state["bundles"] = applied, bundles
    return bundles


def get_bundle_units(db: Session, apartments) -> dict[str, int]:
    """apartment id → 단지 전체 세대수. 묶음 값을 받는 줄만 담는다. 꺼져 있거나 실패하면 빈 사전."""
    if not _is_postgres(db):
        return {}
    apartments = [a for a in apartments if a is not None and a.complex_key]
    if not apartments:
        return {}
    bundles = _current_bundles(db)
    result: dict[str, int] = {}
    for a in apartments:
        found = bundles.get(str(a.complex_key))
        if found is None:
            continue
        units, unsold, members = found
        if units is None:
            continue
        if members and str(a.id) not in members:
            continue  # (오) 등 묶음에서 빠진 줄
        if a.unsold is None or unsold is None or a.unsold != unsold:
            continue  # 묶음 미분양을 안 받은 줄(보류·청약홈 등)
        result[str(a.id)] = int(units)
    return result
