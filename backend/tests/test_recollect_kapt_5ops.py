"""K-apt 관리비 다칸 op 5종 재수집 스크립트(scripts/recollect_kapt_5ops.py) 회귀.

외부 API 0 — `kapt_api.fetch_cost_item` 을 전부 monkeypatch 한다.
DB 는 conftest 의 SQLite 픽스처(운영 DB 무관).
"""

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import text

from crawler import kapt_api
from crawler.kapt_api import COMMON_COST_OPS, INDIVIDUAL_COST_OPS, KaptApiError
from crawler.quota_db import _quota_key
from db.models import Complex, CrawlJob, KaptComplexMap, KaptManagementCost, RateLimitCounter
from scripts import recollect_kapt_5ops as rk

KST = ZoneInfo("Asia/Seoul")
NOON_KST = datetime(2026, 9, 25, 12, 0, tzinfo=KST)
OLD_AT = datetime(2026, 9, 20, 0, 0, tzinfo=timezone.utc)
NEW_AT = datetime(2026, 9, 25, 3, 0, tzinfo=timezone.utc)
FIXED_NOW = datetime(2026, 10, 1, 0, 0, tzinfo=timezone.utc)

OLD_FIVE = 10          # 옛 파서가 저장한 "첫 칸" 값
OTHER_COMMON = 100     # 나머지 공용 12 op
INDIVIDUAL = 1000      # 개별 5 op


def _breakdown(v2_individual: bool = False) -> dict[str, int]:
    """저장된 22키 breakdown — 5 op 는 옛 첫 칸 값, 나머지 공용 100, 개별 1000."""
    b = {op: (OLD_FIVE if op in rk.FIVE_OPS else OTHER_COMMON) for op in COMMON_COST_OPS}
    for op in INDIVIDUAL_COST_OPS:
        b[(op[:-2] + "V2") if v2_individual else op] = INDIVIDUAL
    return b


def _seed(db, complex_no: str, kapt_code: str | None = "A1", fetched_at=OLD_AT,
          v2: bool = False, household: int = 100, month: str = "202606") -> int:
    if db.get(Complex, complex_no) is None:
        db.add(Complex(complex_no=complex_no, complex_name=f"단지{complex_no}",
                       cortar_no="1111011800", real_estate_type_code="APT"))
    if kapt_code and db.get(KaptComplexMap, complex_no) is None:
        db.add(KaptComplexMap(complex_no=complex_no, kapt_code=kapt_code, kapt_household_count=household))
    b = _breakdown(v2)
    common = 5 * OLD_FIVE + 12 * OTHER_COMMON
    individual = 5 * INDIVIDUAL
    row = KaptManagementCost(
        complex_no=complex_no, cost_month=month, household_count=household, breakdown=b,
        common_cost=common, individual_cost=individual, total_cost=common + individual,
        cost_per_household=round((common + individual) / household), fetched_at=fetched_at,
    )
    db.add(row)
    db.commit()
    return row.id


def _fake_items(amount_per_field: int = 7, fail_on: dict | None = None, none_ops=(), calls=None):
    """fetch_cost_item 가짜 — op 의 금액 칸마다 amount_per_field 를 채운 item 을 돌려준다."""
    def fake(base_url, op, kapt_code, search_date):
        if calls is not None:
            calls.append((kapt_code, op))
        if fail_on and (kapt_code, op) in fail_on:
            raise fail_on[(kapt_code, op)]
        if op in none_ops:
            return None
        return {field: str(amount_per_field) for field in kapt_api._COST_AMOUNT_FIELDS[op]}
    return fake


@pytest.fixture(autouse=True)
def _fixed_clock(monkeypatch):
    monkeypatch.setattr(rk, "utcnow", lambda: FIXED_NOW)


def _run(db, **kw):
    kw.setdefault("now_fn", lambda: NOON_KST)
    return rk.run(db, **kw)


def _fields(op: str) -> int:
    return len(kapt_api._COST_AMOUNT_FIELDS[op])


# ── 대상 정의 ──

def test_five_ops_are_exactly_the_multi_field_common_ops():
    """FIVE_OPS 는 금액 칸이 2칸 이상인 공용 op 전부와 같아야 한다(칸 사전이 SSOT)."""
    derived = {op for op in COMMON_COST_OPS if len(kapt_api._COST_AMOUNT_FIELDS[op]) > 1}
    assert set(rk.FIVE_OPS) == derived
    assert len(rk.FIVE_OPS) == 5


# (a) 대상 선정 — fetched_at 기준
def test_targets_split_by_fetched_at_and_rerun_is_noop(db, monkeypatch):
    old_id = _seed(db, "1001", "A1", fetched_at=OLD_AT)
    new_id = _seed(db, "1002", "A2", fetched_at=NEW_AT)
    calls = []
    monkeypatch.setattr(kapt_api, "fetch_cost_item", _fake_items(calls=calls))

    assert [t.id for t in rk.select_targets(db)] == [old_id]
    stats = _run(db)
    assert stats.processed == 1 and stats.stop_reason == "done"
    assert {code for code, _ in calls} == {"A1"}  # 기준 뒤 행은 호출조차 안 한다
    db.expire_all()
    assert db.get(KaptManagementCost, new_id).breakdown == _breakdown()  # 손대지 않음

    # 재실행 — 고친 행은 fetched_at 이 기준 뒤라 대상에서 빠진다
    calls.clear()
    again = _run(db)
    assert again.processed == 0 and calls == []


# (b) 5키만 바뀌고 요약 재계산
def test_only_five_keys_change_and_summary_recomputed(db, monkeypatch):
    row_id = _seed(db, "1001", "A1", household=100)
    monkeypatch.setattr(kapt_api, "fetch_cost_item", _fake_items(amount_per_field=7))

    _run(db)
    db.expire_all()
    row = db.get(KaptManagementCost, row_id)
    before = _breakdown()
    for op in rk.FIVE_OPS:
        assert row.breakdown[op] == 7 * _fields(op)  # 칸 합(인건비 9칸 → 63)
    for op in before:
        if op not in rk.FIVE_OPS:
            assert row.breakdown[op] == before[op]
    five_sum = sum(7 * _fields(op) for op in rk.FIVE_OPS)  # 7 × (9+4+4+3+3) = 161
    assert row.common_cost == five_sum + 12 * OTHER_COMMON
    assert row.individual_cost == 5 * INDIVIDUAL
    assert row.total_cost == row.common_cost + row.individual_cost
    assert row.cost_per_household == round(row.total_cost / 100)
    assert row.fetched_at.replace(tzinfo=timezone.utc) == FIXED_NOW


def test_v2_individual_names_stay_individual_in_summary(db, monkeypatch):
    """개별 5키가 옛 이름(…V2)인 행도 개별 금액이 공용으로 넘어가지 않는다. 저장 키는 그대로."""
    row_id = _seed(db, "1001", "A1", v2=True)
    monkeypatch.setattr(kapt_api, "fetch_cost_item", _fake_items(amount_per_field=7))

    _run(db)
    db.expire_all()
    row = db.get(KaptManagementCost, row_id)
    assert row.individual_cost == 5 * INDIVIDUAL
    assert all(op[:-2] + "V2" in row.breakdown for op in INDIVIDUAL_COST_OPS)
    assert not any(op in row.breakdown for op in INDIVIDUAL_COST_OPS)


# (c) 5 op 중 하나라도 비어 오면 그 행은 갱신하지 않는다(다음 실행 대상에 남김)
def test_partial_blank_row_not_updated_and_counted(db, monkeypatch):
    """옛 규칙("비어 온 op 는 옛 값 유지 + 나머지 갱신")을 바꿨다 — 세션 417 최종 검사관 A.

    저장된 행은 22키 전부 아니면 전무라(실측) 한 번 공개됐던 자료의 일부 op 만 비어 오는 것은
    이상 신호다. 옛 규칙대로면 첫 칸 값(옛 파서)과 칸 합(새 파서)이 한 행에 섞이고 fetched_at 이
    기준 뒤로 넘어가 다시는 안 고쳐진다. 그래서 그 행은 손대지 않고 `partial_blank` 로 센다.
    뮤테이션: `if blank_ops:` 분기를 지우면 행이 갱신돼 FAIL.
    """
    row_id = _seed(db, "1001", "A1")
    good_id = _seed(db, "1002", "A2")
    blank_op = "getHsmpTaxdueInfoV3"
    base = _fake_items(amount_per_field=7)

    def fake(base_url, op, kapt_code, search_date):
        if kapt_code == "A1" and op == blank_op:
            return None
        return base(base_url, op, kapt_code, search_date)

    monkeypatch.setattr(kapt_api, "fetch_cost_item", fake)

    stats = _run(db)
    db.expire_all()
    row = db.get(KaptManagementCost, row_id)
    assert row.breakdown == _breakdown()  # 한 칸도 바뀌지 않았다
    assert row.fetched_at.replace(tzinfo=timezone.utc) == OLD_AT
    assert stats.partial_blank == 1 and stats.all_blank == 0
    assert stats.processed == 1 and stats.stop_reason == "done"
    assert db.get(KaptManagementCost, good_id).breakdown["getHsmpLaborCostInfoV3"] == 63
    assert [t.id for t in rk.select_targets(db)] == [row_id]  # 다음 실행 대상에 남는다


# (d) KaptApiError 행은 미갱신 + 계수, 다음 행은 계속
def test_api_error_row_untouched_and_counted(db, monkeypatch):
    bad_id = _seed(db, "1001", "A1")
    good_id = _seed(db, "1002", "A2")
    # 셋째 op 에서 실패 — 앞 두 op 는 이미 받았어도 그 행은 부분 갱신하지 않는다
    fail = {("A1", rk.FIVE_OPS[2]): KaptApiError("오류 04", code="04")}
    monkeypatch.setattr(kapt_api, "fetch_cost_item", _fake_items(fail_on=fail))

    stats = _run(db)
    db.expire_all()
    bad = db.get(KaptManagementCost, bad_id)
    assert bad.breakdown == _breakdown()
    assert bad.fetched_at.replace(tzinfo=timezone.utc) == OLD_AT
    assert stats.failed == 1 and stats.failed_ids == [bad_id]
    assert stats.processed == 1
    assert db.get(KaptManagementCost, good_id).breakdown["getHsmpLaborCostInfoV3"] == 63


def test_consecutive_failures_stop(db, monkeypatch):
    for i in range(12):
        _seed(db, f"{2000 + i}", f"K{i}")
    monkeypatch.setattr(kapt_api, "fetch_cost_item",
                        lambda *a: (_ for _ in ()).throw(KaptApiError("오류 04", code="04")))
    stats = _run(db)
    assert stats.stop_reason == "consecutive_failures"
    assert stats.failed == rk.MAX_CONSECUTIVE_FAILURES


# (e) 쿼터 즉시 종료
def test_quota_error_stops_immediately(db, monkeypatch):
    first_id = _seed(db, "1001", "A1")
    _seed(db, "1002", "A2")
    calls = []
    fail = {("A1", rk.FIVE_OPS[0]): KaptApiError("한도", code="22", is_quota=True)}
    monkeypatch.setattr(kapt_api, "fetch_cost_item", _fake_items(fail_on=fail, calls=calls))

    stats = _run(db)
    assert stats.stop_reason == "quota"
    assert calls == [("A1", rk.FIVE_OPS[0])]  # 둘째 행은 부르지 않는다
    assert stats.failed == 0 and stats.processed == 0
    db.expire_all()
    assert db.get(KaptManagementCost, first_id).breakdown == _breakdown()


# (f) 하루 상한 도달 종료
def test_daily_cap_stops_when_today_quota_reached(db, monkeypatch):
    for i in range(3):
        _seed(db, f"{3000 + i}", f"Q{i}")
    key = _quota_key("kapt")
    db.add(RateLimitCounter(key=key, count=0, expires_at=FIXED_NOW + timedelta(days=1)))
    db.commit()

    def counting_fake(base_url, op, kapt_code, search_date):
        # 실제 call_api 처럼 호출마다 오늘 카운터를 1 올린다
        db.execute(text("UPDATE rate_limit_counters SET count = count + 1 WHERE key = :k"), {"k": key})
        db.commit()
        return {f: "1" for f in kapt_api._COST_AMOUNT_FIELDS[op]}

    monkeypatch.setattr(kapt_api, "fetch_cost_item", counting_fake)
    stats = _run(db, daily_cap=10)  # 5콜 × 2행 = 10 까지만
    assert stats.stop_reason == "daily_cap"
    assert stats.processed == 2
    assert rk.today_quota(db) == 10


def test_daily_cap_already_reached_makes_zero_calls(db, monkeypatch):
    _seed(db, "1001", "A1")
    db.add(RateLimitCounter(key=_quota_key("kapt"), count=41, expires_at=FIXED_NOW + timedelta(days=1)))
    db.commit()
    calls = []
    monkeypatch.setattr(kapt_api, "fetch_cost_item", _fake_items(calls=calls))
    stats = _run(db, daily_cap=45)  # 41 + 5 > 45
    assert stats.stop_reason == "daily_cap" and calls == []


# 실행 가드
def test_refuses_while_kapt_costs_running(db, monkeypatch):
    _seed(db, "1001", "A1")
    db.add(CrawlJob(job_type="kapt_costs", status="running"))
    db.commit()
    calls = []
    monkeypatch.setattr(kapt_api, "fetch_cost_item", _fake_items(calls=calls))
    stats = _run(db, force=True)  # --force 도 이 가드는 못 넘는다
    assert stats.stop_reason == "refused_kapt_costs_running" and calls == []


# 시작 허용 = 09:00~23:59 KST (세션 417 최종 검사관 B — 옛 06:20~09:00 만 거부해 00:00~06:20 시작이 새고 있었다)
@pytest.mark.parametrize("hhmm,refused", [
    ((0, 0), True), ((3, 0), True), ((6, 19), True), ((6, 20), True), ((8, 59), True),
    ((9, 0), False), ((23, 59), False),
])
def test_start_window_boundaries(db, monkeypatch, hhmm, refused):
    _seed(db, "1001", "A1")
    calls = []
    monkeypatch.setattr(kapt_api, "fetch_cost_item", _fake_items(calls=calls))
    at = datetime(2026, 9, 25, *hhmm, tzinfo=KST)
    stats = _run(db, now_fn=lambda: at)
    assert (stats.stop_reason == "refused_window") is refused
    assert bool(calls) is (not refused)


def test_force_bypasses_window(db, monkeypatch):
    _seed(db, "1001", "A1")
    monkeypatch.setattr(kapt_api, "fetch_cost_item", _fake_items())
    stats = _run(db, force=True, now_fn=lambda: datetime(2026, 9, 25, 7, 0, tzinfo=KST))
    assert stats.processed == 1


def test_row_without_mapping_is_skipped_and_counted(db, monkeypatch):
    _seed(db, "1001", kapt_code=None)
    calls = []
    monkeypatch.setattr(kapt_api, "fetch_cost_item", _fake_items(calls=calls))
    stats = _run(db)
    assert stats.no_mapping == 1 and calls == []


def test_limit_caps_rows(db, monkeypatch):
    ids = [_seed(db, f"{4000 + i}", f"L{i}") for i in range(3)]
    monkeypatch.setattr(kapt_api, "fetch_cost_item", _fake_items())
    stats = _run(db, limit=2)
    assert stats.processed == 2
    assert [t.id for t in rk.select_targets(db)] == [ids[2]]


# dry-run 은 콜 0
def test_dry_run_makes_no_calls(db, monkeypatch, capsys):
    _seed(db, "1001", "A1")
    _seed(db, "1002", "A2", fetched_at=NEW_AT)

    def boom(*a):
        raise AssertionError("dry-run 이 API 를 불렀다")

    monkeypatch.setattr(kapt_api, "fetch_cost_item", boom)
    result = rk.dry_run(db, daily_cap=45_000)
    assert result["targets"] == 1 and result["calls"] == 5 and result["days"] == 1
    out = capsys.readouterr().out
    assert "대상 1행" in out and "id=" in out


# ① 5 op 전부 빔 — 갱신 안 함 + 계수, 연속 10행이면 종료
def test_all_blank_row_not_updated_and_counted(db, monkeypatch):
    blank_id = _seed(db, "1001", "A1")
    good_id = _seed(db, "1002", "A2")
    base = _fake_items()

    def fake(base_url, op, kapt_code, search_date):
        return None if kapt_code == "A1" else base(base_url, op, kapt_code, search_date)

    monkeypatch.setattr(kapt_api, "fetch_cost_item", fake)
    stats = _run(db)
    db.expire_all()
    blank = db.get(KaptManagementCost, blank_id)
    assert blank.breakdown == _breakdown()
    assert blank.fetched_at.replace(tzinfo=timezone.utc) == OLD_AT  # 다음 실행이 다시 시도
    assert stats.all_blank == 1 and stats.partial_blank == 0
    assert stats.processed == 1 and stats.stop_reason == "done"
    assert db.get(KaptManagementCost, good_id).breakdown["getHsmpLaborCostInfoV3"] == 63
    assert [t.id for t in rk.select_targets(db)] == [blank_id]


def test_consecutive_all_blank_stops(db, monkeypatch):
    for i in range(12):
        _seed(db, f"{5000 + i}", f"B{i}")
    calls = []
    monkeypatch.setattr(kapt_api, "fetch_cost_item",
                        _fake_items(calls=calls, none_ops=rk.FIVE_OPS))
    stats = _run(db)
    assert stats.stop_reason == "consecutive_all_blank"
    assert stats.all_blank == rk.MAX_CONSECUTIVE_ALL_BLANK
    assert len({code for code, _ in calls}) == rk.MAX_CONSECUTIVE_ALL_BLANK  # 11번째 행은 안 부른다


# ③ 23:59 에 시작해 돌던 중 자정을 넘기면 멈춘다(새 날짜 한도는 그날 06:20 정기 회차 몫)
@pytest.mark.parametrize("force", [False, True])
def test_stops_at_midnight_rollover(db, monkeypatch, force):
    """뮤테이션: `date_rollover` 검사를 지우면 셋째 행까지 처리돼 FAIL. `--force` 로도 안 풀린다."""
    for i in range(3):
        _seed(db, f"{6000 + i}", f"W{i}")
    monkeypatch.setattr(kapt_api, "fetch_cost_item", _fake_items())
    # 시작 1회 + 행마다 1회 — 둘째 행 직전에 날짜가 바뀐다
    clock = iter([datetime(2026, 9, 25, 23, 59, tzinfo=KST)] * 2
                 + [datetime(2026, 9, 26, 0, 0, tzinfo=KST)] * 5)
    stats = _run(db, force=force, now_fn=lambda: next(clock))
    assert stats.stop_reason == "date_rollover"
    assert stats.processed == 1


def test_run_calls_count_real_transient_retry(db, monkeypatch):
    """요약의 콜 수가 `_body_or_raise` 의 **실제** 일시 오류 재시도를 포함한다.

    `fetch_cost_item` 을 patch 하지 않고 그 아래 `KaptAPI.call_api` 만 갈아 끼워, 첫 호출은
    04 봉투 → 재시도 1회 뒤 정상이 되게 한다. 5 op 논리 호출 + 재시도 1 = 6콜.
    뮤테이션: `_calls_now` 에서 `retry_calls_made()` 를 빼면 5 로 FAIL(검사관 변이 M1).
    """
    _seed(db, "1001", "A1")
    envelope_04 = {"OpenAPI_ServiceResponse": {"cmmMsgHeader": {
        "errMsg": "HTTP_ERROR", "returnAuthMsg": "HTTP 에러", "returnReasonCode": "04"}}}
    seen = []

    def fake_call(cls, url, params):
        seen.append(url)
        if len(seen) == 1:
            return envelope_04
        op = url.rsplit("/", 1)[-1]
        item = {f: "7" for f in kapt_api._COST_AMOUNT_FIELDS[op]}
        return {"response": {"header": {"resultCode": "00"}, "body": {"item": item}}}

    monkeypatch.setattr(kapt_api.KaptAPI, "call_api", classmethod(fake_call))
    monkeypatch.setattr(kapt_api.time, "sleep", lambda s: None)

    stats = _run(db)
    assert stats.processed == 1, stats
    assert len(seen) == 6
    assert stats.calls == 6, f"재시도 콜이 요약에서 빠졌다: {stats.calls}"


# ④ 100행마다 kapt_costs running 재확인
def test_stops_when_kapt_costs_starts_mid_run(db, monkeypatch):
    for i in range(5):
        _seed(db, f"{7000 + i}", f"R{i}")
    monkeypatch.setattr(rk, "PROGRESS_EVERY", 2)
    base = _fake_items()

    def fake(base_url, op, kapt_code, search_date):
        if kapt_code == "R1" and op == rk.FIVE_OPS[-1]:
            db.add(CrawlJob(job_type="kapt_costs", status="running"))  # 둘째 행 도중 정기 회차 시작
            db.commit()
        return base(base_url, op, kapt_code, search_date)

    monkeypatch.setattr(kapt_api, "fetch_cost_item", fake)
    stats = _run(db)
    assert stats.stop_reason == "kapt_costs_started"
    assert stats.processed == 2
