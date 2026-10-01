"""관리비 미공개 단지 재확인 줄이기 (V068 `cost_blank_checked_at`, 세션 426).

옛 수집기는 후보월이 전부 미공개인 단지를 기록 없이 넘겨, 같은 단지를 매 회차(하루 2번)
대기열 맨 앞에서 다시 훑었다. 이제 미공개를 확인하면 회차 시작 시각을 찍고, 7일 안·같은 달
(UTC)이면 건너뛴다. 수집 성공이면 지우고, 호출 실패면 건드리지 않는다. 기록은 관리비 커밋 뒤
별도 트랜잭션으로 반영하고, 전량 빈 응답 실패 회차에서는 반영하지 않는다.

"지금"은 `service_kapt.utcnow` 를 고정해 실제 흐른 시간에 기대지 않는다. 고정일은 일부러
실제 달과 먼 2027-03 으로 둔다 — 후보월을 "지금" 대신 실제 오늘로 계산하는 회귀가 잡히게.
외부 API 는 전부 가짜 — 실제 data.go.kr 호출 0.
"""

import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy import DateTime

from crawler import service_kapt
from crawler.kapt_api import KaptApiError
from crawler.service_kapt import (
    _clear_conflicting_mappings,
    _recently_blank,
    candidate_cost_months,
    collect_kapt_costs,
)
from db.models import Complex, CrawlJob, KaptComplexMap, KaptManagementCost

_V068 = (
    Path(__file__).resolve().parent.parent
    / "db" / "migrations" / "V068__kapt_complex_map_cost_blank_checked_at.sql"
)

BASE = datetime(2027, 3, 1, 3, 0, tzinfo=timezone.utc)
KST = timezone(timedelta(hours=9))


# ── 도우미 ──────────────────────────────────────────────────────────────


def _seed(db, complex_no="1001", kapt_code="A1001", checked_at=None, matched_at=None):
    db.add(Complex(
        complex_no=complex_no, complex_name=f"단지{complex_no}",
        cortar_no="1111011800", real_estate_type_code="APT",
        total_household_count=120,
    ))
    extra = {"matched_at": matched_at} if matched_at is not None else {}
    db.add(KaptComplexMap(
        complex_no=complex_no, kapt_code=kapt_code, kapt_name=f"단지{complex_no}",
        kapt_household_count=120, cost_blank_checked_at=checked_at, **extra,
    ))
    db.commit()


def _freeze(monkeypatch, when: datetime):
    monkeypatch.setattr(service_kapt, "utcnow", lambda: when)


def _fake_api(monkeypatch, published: dict[str, dict] | None = None):
    """kapt_code → {공용 금액 dict}. 없는 단지는 미공개(빈 dict). 호출 기록을 돌려준다."""
    published = published or {}
    calls: list[tuple[str, str]] = []

    def common(code, month):
        calls.append((code, month))
        return dict(published.get(code, {}))

    monkeypatch.setattr(service_kapt, "fetch_common_cost", common)
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})
    return calls


def _checked_at(db, complex_no="1001"):
    db.expire_all()
    value = db.get(KaptComplexMap, complex_no).cost_blank_checked_at
    if value is not None and value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value


def _job(db):
    db.expire_all()
    return (
        db.query(CrawlJob).filter(CrawlJob.job_type == "kapt_costs")
        .order_by(CrawlJob.id.desc()).first()
    )


# ── 수집기 ──────────────────────────────────────────────────────────────


def test_blank_is_stamped_and_skipped_three_days_later(db, monkeypatch):
    """(a) 미공개 → 회차 시작 시각으로 찍힘 · 같은 달 3일 뒤 회차에선 그 단지 호출 0."""
    _seed(db)
    calls = _fake_api(monkeypatch)

    _freeze(monkeypatch, BASE)
    first = collect_kapt_costs(batch_size=10)
    assert first["empty"] == 1
    assert len(calls) == 3, "첫 회차는 후보월 3개를 다 확인해야 한다"
    assert _checked_at(db) == BASE

    calls.clear()
    _freeze(monkeypatch, BASE + timedelta(days=3))
    second = collect_kapt_costs(batch_size=10)
    assert calls == [], "같은 달 7일 안에 미공개로 확인한 단지는 다시 부르지 않는다"
    assert second["empty"] == 0
    assert second["skipped_recent_blank"] == 1
    assert _checked_at(db) == BASE, "건너뛴 회차는 기록을 바꾸지 않는다"


def test_blank_rechecked_after_eight_days(db, monkeypatch):
    """(b) 8일 뒤 회차 → 다시 확인(호출됨) + 기록이 새 회차 시각으로."""
    _seed(db, checked_at=BASE)
    calls = _fake_api(monkeypatch)

    later = BASE + timedelta(days=8)
    _freeze(monkeypatch, later)
    result = collect_kapt_costs(batch_size=10)

    assert len(calls) == 3
    assert result["empty"] == 1
    assert result["skipped_recent_blank"] == 0
    assert _checked_at(db) == later


def test_blank_rechecked_when_month_changes_within_seven_days(db, monkeypatch):
    """(c) 2월 26일 확인 → 3월 1일 회차: 7일 안이어도 달이 바뀌어 후보월이 바뀌므로 다시 확인.

    호출된 달이 "고정한 지금"(2027-03)의 후보월과 같아야 한다 — 후보월을 실제 오늘로
    계산하면(인자 삭제 회귀) 여기서 달라진다.
    """
    feb_26 = datetime(2027, 2, 26, 3, 0, tzinfo=timezone.utc)
    _seed(db, checked_at=feb_26)
    calls = _fake_api(monkeypatch)

    _freeze(monkeypatch, BASE)
    result = collect_kapt_costs(batch_size=10)

    assert len(calls) == 3, "달이 바뀌면 7일 안이어도 다시 확인해야 한다"
    assert {m for _, m in calls} == set(candidate_cost_months(BASE.date()))
    assert result["skipped_recent_blank"] == 0
    assert _checked_at(db) == BASE


def test_collect_success_clears_blank_stamp(db, monkeypatch):
    """(d) 수집 성공 → 칸이 None 으로 지워진다(8일 전 기록이라 재확인 대상)."""
    _seed(db, checked_at=BASE - timedelta(days=8))
    _fake_api(monkeypatch, published={"A1001": {"aV3": 1000}})

    _freeze(monkeypatch, BASE)
    result = collect_kapt_costs(batch_size=10)

    assert result["collected"] == 1
    assert db.query(KaptManagementCost).count() == 1
    assert _checked_at(db) is None


def test_call_failure_leaves_blank_stamp_untouched(db, monkeypatch):
    """(e) 호출 실패(KaptApiError) → 칸은 그대로(미공개가 아니라 모르는 상태)."""
    old = BASE - timedelta(days=10)
    _seed(db, checked_at=old)

    def boom(code, month):
        raise KaptApiError("호출 실패", code=None, op="x")

    monkeypatch.setattr(service_kapt, "fetch_common_cost", boom)
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})

    _freeze(monkeypatch, BASE)
    result = collect_kapt_costs(batch_size=10)

    assert result.get("failed") == 1
    assert result["skipped_recent_blank"] == 0, "실패 반환에도 건너뛴 수가 실린다"
    assert _checked_at(db) == old


def test_skipped_count_in_result_alongside_collection(db, monkeypatch):
    """(f) 건너뛴 단지가 반환 dict `skipped_recent_blank` 에 세어진다 — 다른 단지 수집과 함께."""
    # 둘 다 3월 안(같은 달)·7일 안 확인 → 건너뜀. 셋째는 기록 없음 → 수집.
    _seed(db, complex_no="1001", kapt_code="A1001", checked_at=BASE + timedelta(days=2))
    _seed(db, complex_no="1002", kapt_code="A1002", checked_at=BASE + timedelta(days=3))
    _seed(db, complex_no="1003", kapt_code="A1003")
    calls = _fake_api(monkeypatch, published={"A1003": {"aV3": 500}})

    _freeze(monkeypatch, BASE + timedelta(days=5))
    result = collect_kapt_costs(batch_size=10)

    assert result["collected"] == 1
    assert result["skipped_recent_blank"] == 2
    assert {code for code, _ in calls} == {"A1003"}


def test_all_empty_failure_does_not_persist_blank_marks(db, monkeypatch):
    """(S1) 전량 빈 응답 + 카나리 표본 없음 → all_empty failed, 미공개 기록은 DB 에 **없다**.

    기록이 남으면 다음 회차 대기열이 비어 completed(0,0) 가 직전 실패를 "복구" 로 풀고
    장애가 최대 7일 숨는다. 다음 회차(API 회복)는 그 단지들을 다시 확인해 수집해야 한다.
    """
    nos = [str(2000 + i) for i in range(service_kapt._ALL_EMPTY_MIN_TARGETS)]
    for no in nos:
        _seed(db, complex_no=no, kapt_code=f"A{no}")
    _fake_api(monkeypatch)  # 전부 빈 응답

    _freeze(monkeypatch, BASE)
    first = collect_kapt_costs(batch_size=50)
    assert first["error"] == "all_empty"
    assert all(_checked_at(db, no) is None for no in nos), "실패 회차의 미공개는 기록하지 않는다"

    calls = _fake_api(monkeypatch, published={f"A{no}": {"aV3": 100} for no in nos})
    _freeze(monkeypatch, BASE + timedelta(hours=6))
    second = collect_kapt_costs(batch_size=50)
    assert second["skipped_recent_blank"] == 0
    assert second["collected"] == len(nos)
    assert {code for code, _ in calls} == {f"A{no}" for no in nos}


def test_pair_change_clears_blank_mark(db):
    """(S2) 짝(kapt_code)이 바뀌면 옛 짝의 미공개 기록이 지워진다 — 새 짝이 7일 건너뛰어지지 않게."""
    _seed(db, kapt_code="OLD", checked_at=BASE)

    _clear_conflicting_mappings(db, "1001", "NEW")
    db.commit()

    assert _checked_at(db) is None


def test_same_pair_recheck_keeps_blank_mark(db):
    """같은 짝 재확인은 기록을 지우지 않는다(매달 매칭이 미공개 기록을 날리면 안 된다)."""
    _seed(db, kapt_code="SAME", checked_at=BASE)

    _clear_conflicting_mappings(db, "1001", "SAME")
    db.commit()

    assert _checked_at(db) == BASE


def test_future_stamp_is_not_skipped(db, monkeypatch):
    """(S3) 미래 시각으로 찍힌 기록(시계 어긋남)은 건너뛰지 않고 다시 확인한다."""
    _seed(db, checked_at=BASE + timedelta(days=2))
    calls = _fake_api(monkeypatch)

    _freeze(monkeypatch, BASE)
    result = collect_kapt_costs(batch_size=10)

    assert len(calls) == 3
    assert result["skipped_recent_blank"] == 0
    assert _checked_at(db) == BASE


def test_persist_failure_keeps_costs_and_completed_job(db, monkeypatch):
    """(8f) 기록 반영이 터져도 관리비 행은 저장돼 있고 잡은 completed — 기록은 잃어도 손해가 없다."""
    _seed(db, complex_no="1001", kapt_code="A1001")
    _seed(db, complex_no="1002", kapt_code="A1002")
    _fake_api(monkeypatch, published={"A1001": {"aV3": 700}})

    def explode(*args, **kwargs):
        raise RuntimeError("행 잠금 시간 초과(가짜)")

    monkeypatch.setattr(service_kapt, "_persist_blank_marks", explode)
    _freeze(monkeypatch, BASE)
    result = collect_kapt_costs(batch_size=10)

    assert result["collected"] == 1
    assert "error" not in result
    assert db.query(KaptManagementCost).count() == 1
    assert _job(db).status == "completed"
    assert _checked_at(db, "1002") is None, "반영이 실패했으니 기록은 없다(다음 회차에 다시 확인)"


def test_persist_blank_marks_chunks_and_ignores_missing_rows(db, monkeypatch):
    """기록 반영은 청크로 나눠 UPDATE 하고, 이미 지워진 단지 번호는 0행 갱신으로 지나간다."""
    _seed(db, complex_no="1001", kapt_code="A1001")
    _seed(db, complex_no="1002", kapt_code="A1002", checked_at=BASE - timedelta(days=1))
    monkeypatch.setattr(service_kapt, "_BLANK_MARK_CHUNK", 1)

    service_kapt._persist_blank_marks(db, ["1001", "9999"], ["1002", "8888"], BASE)

    assert _checked_at(db, "1001") == BASE
    assert _checked_at(db, "1002") is None


# ── 회차가 어떻게 끝났나에 따른 반영 여부 (세션 426 재검사) ─────────────


def _seed_all_blank(db, n=None):
    """후보월이 전부 빈 응답인 단지 n곳(기본 = 카나리 문턱) — 번호 목록을 돌려준다."""
    n = n or service_kapt._ALL_EMPTY_MIN_TARGETS
    nos = [str(3000 + i) for i in range(n)]
    for no in nos:
        _seed(db, complex_no=no, kapt_code=f"A{no}")
    return nos


def test_all_empty_canary_error_goes_to_outer_except_without_marks(db, monkeypatch):
    """(T2) 전량 빈 응답 + 카나리가 KaptApiError → 바깥 except 경로 → 미공개 기록 **없음**.

    관리비 커밋 뒤 깃발이 켜진 상태에서 예외로 빠지므로, except 첫 줄이 깃발을 꺼야 한다.
    """
    nos = _seed_all_blank(db)
    _fake_api(monkeypatch)

    def canary_boom(db_, months, include_older_month=False):
        raise KaptApiError("카나리 호출 실패", code=None, op="x")

    monkeypatch.setattr(service_kapt, "_probe_api_alive", canary_boom)
    _freeze(monkeypatch, BASE)
    result = collect_kapt_costs(batch_size=50)

    assert "카나리 호출 실패" in result["error"]
    assert _job(db).status == "failed"
    assert all(_checked_at(db, no) is None for no in nos)


def test_all_empty_with_alive_canary_completes_and_marks_all(db, monkeypatch):
    """(T3) 전량 미공개 10곳 이상 + 카나리 살아있음 → completed + 10곳 전부 기록 반영.

    정상 완료(맨 끝 반환)가 아닌 "카나리 살아있음" 반환 경로에서도 기록이 반영돼야 한다.
    """
    nos = _seed_all_blank(db)
    _fake_api(monkeypatch)
    monkeypatch.setattr(
        service_kapt, "_probe_api_alive",
        lambda db_, months, include_older_month=False: (True, 3),
    )
    _freeze(monkeypatch, BASE)
    result = collect_kapt_costs(batch_size=50)

    assert result.get("canary") == "alive"
    assert _job(db).status == "completed"
    assert [_checked_at(db, no) for no in nos] == [BASE] * len(nos)


def _seed_blanks_then_failures(db, monkeypatch):
    """미공개 3곳 → 호출 실패 5곳(연속 실패 문턱) 순서로 대기열을 만든다."""
    blanks = ["4001", "4002", "4003"]
    fails = [str(4100 + i) for i in range(service_kapt._CONSECUTIVE_FAILURE_LIMIT)]
    t0 = BASE - timedelta(days=30)
    for i, no in enumerate(blanks + fails):
        code = f"B{no}" if no in blanks else f"F{no}"
        _seed(db, complex_no=no, kapt_code=code, matched_at=t0 + timedelta(minutes=i))

    def common(code, month):
        if code.startswith("F"):
            raise KaptApiError("호출 실패", code=None, op="x")
        return {}

    monkeypatch.setattr(service_kapt, "fetch_common_cost", common)
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})
    return blanks


def test_api_down_with_blank_canary_does_not_mark(db, monkeypatch):
    """(T4) 연속 실패 → 카나리 표본(저장행 단지)까지 전부 빈 응답 → api_down, 앞서 본 미공개 기록 없음."""
    blanks = _seed_blanks_then_failures(db, monkeypatch)
    monkeypatch.setattr(
        service_kapt, "_recheck_api_after_failures", lambda db_, months: (False, 3, None),
    )
    _freeze(monkeypatch, BASE)
    result = collect_kapt_costs(batch_size=50)

    assert result["error"] == "api_down"
    assert result["empty"] == len(blanks)
    assert all(_checked_at(db, no) is None for no in blanks)


def test_api_down_with_failing_canary_still_marks(db, monkeypatch):
    """(T4 반대) 카나리 호출 자체가 KaptApiError 로 죽은 api_down → 앞서 본 미공개(실제 200 응답)는 기록."""
    blanks = _seed_blanks_then_failures(db, monkeypatch)
    monkeypatch.setattr(
        service_kapt, "_recheck_api_after_failures",
        lambda db_, months: (False, 3, KaptApiError("카나리 실패", code="04", op="x")),
    )
    _freeze(monkeypatch, BASE)
    result = collect_kapt_costs(batch_size=50)

    assert result["error"] == "api_down"
    assert [_checked_at(db, no) for no in blanks] == [BASE] * len(blanks)


def test_spinning_threshold_matches_canary_threshold():
    """관리비 카드 헛바퀴 문턱 == 카나리 문턱 — 한쪽만 바꾸면 작은 회차 거짓 경보가 되살아난다."""
    from routers.admin.freshness_meta import FRESHNESS_ITEMS

    card = next(item for item in FRESHNESS_ITEMS if item["key"] == "kapt_costs")
    assert card["spinning_min_total"] == service_kapt._ALL_EMPTY_MIN_TARGETS


# ── 판정 함수 단위 ──────────────────────────────────────────────────────


def test_recently_blank_converts_non_utc_aware_value():
    """(8a) PostgreSQL 은 세션 시간대(예: KST)로 aware 값을 돌려줄 수 있다 — UTC 로 바꾼 뒤 연·월을 본다.

    KST 2027-04-01 05:00 = UTC 03-31 20:00 → UTC 기준 같은 달(3월)·3시간 전이라 건너뛴다.
    UTC 로 안 바꾸면 4월로 보여 "달이 바뀜" 으로 오판한다.
    """
    now = datetime(2027, 3, 31, 23, 0, tzinfo=timezone.utc)
    checked_kst = datetime(2027, 4, 1, 5, 0, tzinfo=KST)
    assert _recently_blank(checked_kst, now) is True


def test_recently_blank_boundaries():
    """None·7일 경계·미래 값·naive(SQLite) 값."""
    assert _recently_blank(None, BASE) is False
    assert _recently_blank(BASE + timedelta(days=6, hours=23), BASE + timedelta(days=13, hours=22)) is True
    assert _recently_blank(BASE, BASE + timedelta(days=7)) is False
    assert _recently_blank(BASE + timedelta(minutes=1), BASE) is False
    assert _recently_blank(BASE.replace(tzinfo=None), BASE + timedelta(days=1)) is True


# ── 마이그레이션 · ORM ─────────────────────────────────────────────────


def _executable_sql(sql: str) -> str:
    """`--` 줄 주석과 `COMMENT ON ... ;` 문을 빼고 실행문만 남긴다(V058 시험 패턴)."""
    lines, in_comment_on = [], False
    for line in sql.splitlines():
        stripped = line.strip()
        if in_comment_on:
            if stripped.endswith("';"):
                in_comment_on = False
            continue
        if stripped.startswith("--"):
            continue
        if stripped.startswith("COMMENT ON"):
            if not stripped.endswith("';"):
                in_comment_on = True
            continue
        lines.append(line)
    return "\n".join(lines)


@pytest.fixture(scope="module")
def v068_sql() -> str:
    assert _V068.exists(), f"V068 마이그레이션 파일 부재: {_V068}"
    return _V068.read_text(encoding="utf-8")


def test_v068_sql_adds_column_and_notifies(v068_sql):
    """(g-1) 실행문에 멱등 TIMESTAMPTZ 칸 추가 + PostgREST 스키마 갱신이 있다. 롤백·런북은 주석에만."""
    executable = _executable_sql(v068_sql)
    assert re.search(
        r"ADD COLUMN IF NOT EXISTS cost_blank_checked_at TIMESTAMPTZ", executable
    )
    assert "NOTIFY pgrst, 'reload schema';" in executable
    assert "DROP COLUMN" not in executable, "롤백문이 실행문에 섞이면 안 된다"
    assert "UPDATE" not in executable, "런북 UPDATE 가 실행문에 섞이면 안 된다"
    assert "DROP COLUMN IF EXISTS cost_blank_checked_at" in v068_sql
    assert "SET cost_blank_checked_at = NULL" in v068_sql
    assert "운영 선행 적용 필수" in v068_sql


def test_orm_has_timezone_aware_nullable_column():
    """(g-2) ORM 칸이 timezone-aware DateTime · nullable — SQL 의 TIMESTAMPTZ 와 맞는다."""
    col = KaptComplexMap.__table__.c["cost_blank_checked_at"]
    assert isinstance(col.type, DateTime)
    assert col.type.timezone is True
    assert col.nullable is True
