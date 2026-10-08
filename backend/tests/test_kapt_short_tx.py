"""관리비 회차가 K-apt 호출·대기 동안 DB 트랜잭션을 쥐지 않는지 (세션 456).

세션 454 실사고(2026-10-08): 21:00 관리비 회차 연결이 `idle in transaction` 5,437초 —
시작 조회부터 루프 끝 첫 commit 까지 회차 전체가 트랜잭션 하나였다. 관리비 행은 complexes 를
참조(FK)하므로 그동안 complexes 구조 변경(V071 `ALTER TABLE complexes`)이 잠금 대기로 취소됐다.

수집기가 여는 세션을 가로채, 가짜 K-apt 호출·가짜 sleep 안에서 `in_transaction()` 을 본다.
외부 API 는 전부 가짜 — 실제 data.go.kr 호출 0.
"""

from sqlalchemy.exc import OperationalError

from crawler import service_kapt
from crawler.kapt_api import KaptApiError
from crawler.service_kapt import candidate_cost_months, collect_kapt_costs
from db.models import Complex, CrawlJob, KaptComplexMap, KaptManagementCost


def _seed(db, complex_no, kapt_code):
    db.add(Complex(
        complex_no=complex_no, complex_name="시험단지" + complex_no,
        cortar_no="1111011800", real_estate_type_code="APT", total_household_count=120,
    ))
    db.add(KaptComplexMap(
        complex_no=complex_no, kapt_code=kapt_code,
        kapt_name="시험단지" + complex_no, kapt_household_count=120,
    ))
    db.commit()


def _spy_sessions(monkeypatch) -> list:
    """수집기가 만드는 세션을 모아 둔다 — 회차 세션 = 첫 번째."""
    original = service_kapt.SessionLocal
    sessions: list = []

    def _spy():
        session = original()
        sessions.append(session)
        return session

    monkeypatch.setattr(service_kapt, "SessionLocal", _spy)
    return sessions


def test_no_open_transaction_during_kapt_calls(db, monkeypatch):
    """ⓐ 첫 단지 호출 때(시작 조회 뒤)도, 둘째 단지 호출 때(앞 단지 저장 뒤)도 트랜잭션이 닫혀 있다."""
    _seed(db, "7101", "TA")
    _seed(db, "7102", "TB")
    sessions = _spy_sessions(monkeypatch)
    seen: list[tuple[str, bool]] = []

    def fake_fetch(kapt_code, month):
        seen.append((kapt_code, sessions[0].in_transaction()))
        return {"getHsmpGuardCostInfoV3": 1_000}

    monkeypatch.setattr(service_kapt, "_fetch_costs_for_month", fake_fetch)

    result = collect_kapt_costs(batch_size=10)

    assert result["collected"] == 2
    assert len(seen) == 2, f"단지마다 한 번씩 불려야 한다: {seen}"
    assert [in_tx for _, in_tx in seen] == [False, False], f"호출 중 트랜잭션이 열려 있다: {seen}"
    assert {r.complex_no for r in db.query(KaptManagementCost).all()} == {"7101", "7102"}


def test_no_open_transaction_after_blank_and_failed_complexes(db, monkeypatch):
    """ⓐ' 미공개 갈래·호출 실패 갈래를 지난 뒤의 단지 호출에서도 트랜잭션이 닫혀 있다.

    처리 순서대로 첫째 단지 = 미공개(빈 응답), 둘째 = 호출 실패, 셋째 = 수집 — 갈래를 처리 순서로
    정해 대기열 정렬과 무관하게 "앞 단지가 미공개·실패였다" 가 성립하게 한다.
    """
    for no, code in (("7401", "TP"), ("7402", "TQ"), ("7403", "TR")):
        _seed(db, no, code)
    sessions = _spy_sessions(monkeypatch)
    order: list[str] = []
    seen: list[tuple[str, bool]] = []

    def fake_fetch(kapt_code, month):
        seen.append((kapt_code, sessions[0].in_transaction()))
        if kapt_code not in order:
            order.append(kapt_code)
        position = order.index(kapt_code)
        if position == 0:
            return {}  # 미공개 — 후보월마다 불린다
        if position == 1:
            raise KaptApiError("서비스 점검", code="99", op="getHsmpGuardCostInfoV3")
        return {"getHsmpGuardCostInfoV3": 1_000}

    monkeypatch.setattr(service_kapt, "_fetch_costs_for_month", fake_fetch)

    result = collect_kapt_costs(batch_size=10)

    assert (result["empty"], result["failed"], result["collected"]) == (1, 1, 1)
    assert len(order) == 3, f"세 단지 모두 불려야 한다: {order}"
    assert len(seen) == len(candidate_cost_months()) + 2, f"호출 수가 다르다: {seen}"
    assert [in_tx for _, in_tx in seen] == [False] * len(seen), f"호출 중 트랜잭션이 열려 있다: {seen}"
    assert {r.complex_no for r in db.query(KaptManagementCost).all()} == {
        {"TP": "7401", "TQ": "7402", "TR": "7403"}[order[2]]
    }


def test_no_open_transaction_during_canary_probe_and_wait(db, monkeypatch):
    """ⓑ 연속 실패 카나리 — 표본 조회 뒤 HTTP 와 30초 대기 동안 트랜잭션이 닫혀 있다."""
    months = candidate_cost_months()
    for i in range(5):
        _seed(db, "72%02d" % i, "TF%d" % i)
    _seed(db, "7299", "TS")  # 카나리 표본 — months[0] 보유라 대기열 밖
    db.add(KaptManagementCost(
        complex_no="7299", cost_month=months[0], total_cost=100,
        common_cost=100, individual_cost=0, household_count=120,
    ))
    db.commit()
    sessions = _spy_sessions(monkeypatch)

    def fail_fetch(kapt_code, month):
        raise KaptApiError("응답 없음", code=None, op="getHsmpGuardCostInfoV3")

    monkeypatch.setattr(service_kapt, "_fetch_costs_for_month", fail_fetch)
    probe_states: list[bool] = []
    answers = iter([None, {"getHsmpGuardCostInfoV3": 1}])  # 첫 확인 무응답 → 30초 뒤 살아있음

    def fake_probe(code, month):
        probe_states.append(sessions[0].in_transaction())
        return next(answers)

    monkeypatch.setattr(service_kapt, "fetch_common_cost_probe", fake_probe)
    sleep_states: list[tuple[int, bool]] = []

    class _T:
        monotonic = staticmethod(service_kapt.time.monotonic)

        @staticmethod
        def sleep(seconds):
            sleep_states.append((seconds, sessions[0].in_transaction()))

    monkeypatch.setattr(service_kapt, "time", _T)

    result = collect_kapt_costs(batch_size=10)

    assert result["error"] == "partial_outage"  # 기존 동작 그대로: 살아있음인데 수집 0
    assert sleep_states == [(30, False)], f"대기 중 트랜잭션이 열려 있다: {sleep_states}"
    assert probe_states == [False, False], f"카나리 호출 중 트랜잭션이 열려 있다: {probe_states}"


def test_db_error_on_one_complex_rolls_back_only_that_complex(db, monkeypatch):
    """ⓒ 3단지 중 둘째 저장에서 DB 오류 → 둘째만 되돌리고 첫째·셋째는 저장, 잡은 completed + 사유.

    오류는 upsert 를 **실행한 뒤** 낸다 — 되돌리기가 없으면 둘째의 행이 셋째 커밋에 실려 저장된다.
    """
    for no, code in (("7301", "TX"), ("7302", "TY"), ("7303", "TZ")):
        _seed(db, no, code)
    monkeypatch.setattr(
        service_kapt, "_fetch_costs_for_month",
        lambda kapt_code, month: {"getHsmpGuardCostInfoV3": 1_000},
    )
    real_upsert = service_kapt._do_upsert
    order: list[str] = []

    def flaky_upsert(session, model, values, pk):
        real_upsert(session, model, values, pk)
        order.append(values["complex_no"])
        if len(order) == 2:
            raise OperationalError("INSERT", {}, Exception("가짜 연결 끊김"))

    monkeypatch.setattr(service_kapt, "_do_upsert", flaky_upsert)

    result = collect_kapt_costs(batch_size=10)

    assert len(order) == 3, f"둘째 오류 뒤 셋째로 이어 가야 한다: {order}"
    broken = order[1]
    saved = {r.complex_no for r in db.query(KaptManagementCost).all()}
    assert saved == set(order) - {broken}, f"둘째({broken})가 저장됐거나 다른 단지가 빠졌다: {saved}"
    assert result["collected"] == 2 and result["failed"] == 1
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "kapt_costs").one()
    assert job.status == "completed"
    assert "1단지 호출 실패" in (job.error_message or "")
