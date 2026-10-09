"""관리비 단지 연결하기(kapt_match)가 기본정보 호출 동안 DB 트랜잭션을 쥐지 않는지 (세션 456).

수리 전: 대상 목록이 ORM `Complex` 객체라 그 조회가 트랜잭션을 열고, 그 상태로 pass 2 의
`fetch_apt_basis_info`(K-apt HTTP)를 계속 불렀다. 200건마다 커밋해도 `cpx` 가 만료돼 다음 단지에서
속성을 읽는 순간 SELECT 가 다시 나가 complexes 잠금을 다시 잡았다 — 사실상 회차 내내(약 6시간)
complexes 구조 변경을 막았다(관리비 받기 쪽 같은 사고 = test_kapt_short_tx.py).

수집기가 여는 세션을 가로채, 가짜 기본정보 호출 안에서 `in_transaction()` 을 본다.
외부 API 는 전부 가짜 — 실제 data.go.kr 호출 0.
"""

from datetime import timedelta

import pytest
from sqlalchemy.exc import OperationalError

from crawler import service_kapt
from crawler.kapt_api import KaptApiError
from crawler.plain_words import explain_error
from crawler.service_kapt import match_kapt_complexes
from db.models import Complex, CrawlJob, KaptComplexMap
from utils import utcnow


def _seed_complex(db, complex_no, bjd):
    """단지마다 법정동을 따로 줘 후보가 서로 섞이지 않게 한다(역방향 경합 0)."""
    db.add(Complex(
        complex_no=complex_no, complex_name="경희궁의아침", cortar_no=bjd,
        real_estate_type_code="APT", total_household_count=120,
    ))
    db.commit()


def _kapt(code, bjd):
    return {"kaptCode": code, "kaptName": "경희궁의아침", "bjdCode": bjd}


def _seed_three(db, monkeypatch, prefix):
    """세 단지 + 각자의 K-apt 후보. 반환 = {kapt_code: complex_no}."""
    pairs = {}
    rows = []
    for i in range(3):
        no, code, bjd = f"{prefix}{i}", f"K{prefix}{i}", f"11110118{i:02d}"
        _seed_complex(db, no, bjd)
        rows.append(_kapt(code, bjd))
        pairs[code] = no
    monkeypatch.setattr(service_kapt, "_fetch_all_kapt", lambda *a, **k: (rows, True))
    return pairs


def _spy_sessions(monkeypatch) -> list:
    """수집기가 만드는 세션을 모아 둔다 — 회차 세션 = 첫 번째(대기 확인 세션보다 먼저 연다)."""
    original = service_kapt.SessionLocal
    sessions: list = []

    def _spy():
        session = original()
        sessions.append(session)
        return session

    monkeypatch.setattr(service_kapt, "SessionLocal", _spy)
    return sessions


def test_no_open_transaction_during_basis_calls(db, monkeypatch):
    """ⓐ 모든 기본정보 호출에서 트랜잭션이 닫혀 있다 — 저장·세대수 탈락·호출 실패 갈래 뒤에도.

    갈래는 호출 순서로 정한다(대상 조회 순서와 무관하게 "앞 단지가 그 갈래였다" 가 성립):
    0 = 저장 · 1 = 세대수 탈락 · 2 = 호출 실패 · 3·4 = 저장.
    탈락·실패 갈래는 DB 를 안 쓰지만 단지 속성은 읽는다 — ORM 객체였다면 그 읽기가 만료된
    객체를 다시 불러 트랜잭션을 열고, 커밋 없이 다음 단지 호출로 넘어간다.
    """
    rows = []
    for i in range(5):
        bjd = f"11110119{i:02d}"
        _seed_complex(db, f"81{i}", bjd)
        rows.append(_kapt(f"KA{i}", bjd))
    monkeypatch.setattr(service_kapt, "_fetch_all_kapt", lambda *a, **k: (rows, True))
    sessions = _spy_sessions(monkeypatch)
    seen: list[tuple[str, bool]] = []

    def fake_basis(code):
        position = len(seen)
        seen.append((code, sessions[0].in_transaction()))
        if position == 1:
            return {"codeHallNm": "계단식", "kaptdaCnt": 500.0}  # 우리 120 vs 500 — 세대수 탈락
        if position == 2:
            raise KaptApiError("서비스 점검", code="99", op="getAphusBassInfoV5")
        return {"codeHallNm": "계단식", "kaptdaCnt": 120.0}

    monkeypatch.setattr(service_kapt, "fetch_apt_basis_info", fake_basis)

    result = match_kapt_complexes()

    assert len(seen) == 5, f"다섯 단지 모두 불려야 한다: {seen}"
    assert [in_tx for _, in_tx in seen] == [False] * 5, f"호출 중 트랜잭션이 열려 있다: {seen}"
    assert (result["matched"], result["skipped"], result["basis_failed"]) == (3, 1, 1)
    saved = {r.kapt_code for r in db.query(KaptComplexMap).all()}
    assert saved == {seen[0][0], seen[3][0], seen[4][0]}


def test_db_error_on_one_complex_rolls_back_only_that_complex(db, monkeypatch):
    """ⓑ 둘째 단지 저장에서 DB 오류 → 그 단지만 되돌리고 첫째·셋째는 저장, 잡은 completed + 사유.

    오류는 upsert 를 **실행한 뒤** 낸다 — 되돌리기가 없으면 둘째의 행이 셋째 커밋에 실려 저장된다.
    세 단지 모두 옛 연결(40일 전)을 갖고 있다 — 저장에 실패한 단지의 옛 연결은 회차 끝 정리에서
    지워지면 안 된다(재확인을 못 한 것이지 규칙에서 떨어진 게 아니다).
    """
    pairs = _seed_three(db, monkeypatch, "82")
    old = utcnow() - timedelta(days=40)
    for code, no in pairs.items():
        db.add(KaptComplexMap(
            complex_no=no, kapt_code=code, kapt_name="옛연결", match_score=0.9, matched_at=old,
        ))
    db.commit()
    monkeypatch.setattr(
        service_kapt, "fetch_apt_basis_info",
        lambda code: {"codeHallNm": "계단식", "kaptdaCnt": 120.0},
    )
    real_upsert = service_kapt._do_upsert
    order: list[str] = []

    def flaky_upsert(session, model, values, pk):
        real_upsert(session, model, values, pk)
        order.append(values["complex_no"])
        if len(order) == 2:
            raise OperationalError("INSERT", {}, Exception("가짜 연결 끊김"))

    monkeypatch.setattr(service_kapt, "_do_upsert", flaky_upsert)

    result = match_kapt_complexes()

    assert len(order) == 3, f"둘째 오류 뒤 셋째로 이어 가야 한다: {order}"
    broken = order[1]
    db.expire_all()
    names = {r.complex_no: r.kapt_name for r in db.query(KaptComplexMap).all()}
    assert set(names) == set(pairs.values()), f"저장 실패 단지의 옛 연결이 정리로 지워졌다: {names}"
    assert names[broken] == "옛연결", f"둘째({broken})의 되돌린 저장이 커밋됐다: {names}"
    assert {no for no, name in names.items() if name == "경희궁의아침"} == set(order) - {broken}
    assert (result["matched"], result["save_failed"], result["purged"]) == (2, 1, 0)
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "kapt_match").one()
    assert job.status == "completed"
    assert (job.processed_items, job.total_items) == (2, 3)
    assert "1건 저장 실패" in (job.error_message or "")


@pytest.mark.parametrize("fail_at", [(2, 3), (1, 2, 3)], ids=["fail2_match1", "all_fail"])
def test_save_failures_outnumbering_matches_fail_the_job(db, monkeypatch, fail_at):
    """ⓓ 저장 실패가 연결보다 많으면 잡은 failed(알림이 간다) + 정리 건너뜀 + 사유는 저장 실패.

    장면 = 회차 도중 DB 가 멈춤(실사고 29·34분). completed 로 끝나면 감시기가 실패로 세지 않아
    알림이 안 간다. 전부 실패한 회차도 "전부 매칭 실패" 가 아니라 저장 실패로 적힌다.
    재확인 안 된 옛 연결(후보 없는 단지)이 하나 있다 — 정리를 건너뛰었으면 남아 있어야 한다.
    사유 문장은 알림에도 원문 그대로 나가야 한다("처음 보는 문제" 로 바뀌면 숫자가 사라진다).
    """
    _seed_three(db, monkeypatch, "84")
    _seed_complex(db, "8499", "2611010100")
    db.add(KaptComplexMap(
        complex_no="8499", kapt_code="KOLD", kapt_name="옛오매칭", match_score=0.7,
        matched_at=utcnow() - timedelta(days=40),
    ))
    db.commit()
    monkeypatch.setattr(
        service_kapt, "fetch_apt_basis_info",
        lambda code: {"codeHallNm": "계단식", "kaptdaCnt": 120.0},
    )
    real_upsert = service_kapt._do_upsert
    calls: list[str] = []

    def flaky_upsert(session, model, values, pk):
        real_upsert(session, model, values, pk)
        calls.append(values["complex_no"])
        if len(calls) in fail_at:
            raise OperationalError("INSERT", {}, Exception("가짜 연결 끊김"))

    monkeypatch.setattr(service_kapt, "_do_upsert", flaky_upsert)

    result = match_kapt_complexes()

    failed_n, matched_n = len(fail_at), 3 - len(fail_at)
    assert result["error"] == "save_mostly_failed"
    assert (result["matched"], result["save_failed"], result["basis_failed"]) == (matched_n, failed_n, 0)
    db.expire_all()
    assert db.query(KaptComplexMap).filter(KaptComplexMap.complex_no == "8499").count() == 1, (
        "실패가 더 많은 회차에서 정리가 돌았다"
    )
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "kapt_match").one()
    assert job.status == "failed"
    expected = (
        f"단지 {failed_n}건 저장 실패 — 그 단지들은 기존 연결을 그대로 두었어요(다음 달 다시 시도)"
        f" · 연결 {matched_n}건"
    )
    assert job.error_message == expected
    assert explain_error(expected) == expected, explain_error(expected)


def test_equal_basis_and_save_failures_named_basis(db, monkeypatch):
    """ⓔ 기본정보 실패 1 = 저장 실패 1 > 연결 1 → failed, 이름은 basis_mostly_failed(같으면 기본정보 쪽)."""
    _seed_three(db, monkeypatch, "85")
    basis_calls: list[str] = []

    def fake_basis(code):
        basis_calls.append(code)
        if len(basis_calls) == 1:
            raise KaptApiError("서비스 점검", code="99", op="getAphusBassInfoV5")
        return {"codeHallNm": "계단식", "kaptdaCnt": 120.0}

    monkeypatch.setattr(service_kapt, "fetch_apt_basis_info", fake_basis)
    real_upsert = service_kapt._do_upsert
    calls: list[str] = []

    def flaky_upsert(session, model, values, pk):
        real_upsert(session, model, values, pk)
        calls.append(values["complex_no"])
        if len(calls) == 1:
            raise OperationalError("INSERT", {}, Exception("가짜 연결 끊김"))

    monkeypatch.setattr(service_kapt, "_do_upsert", flaky_upsert)

    result = match_kapt_complexes()

    assert (result["matched"], result["basis_failed"], result["save_failed"]) == (1, 1, 1)
    assert result["error"] == "basis_mostly_failed"
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "kapt_match").one()
    assert job.status == "failed"


def test_no_match_result_has_save_failed_key(db, monkeypatch):
    """ⓕ 매칭 0건(후보 없음) 회차의 반환에도 save_failed 키가 있다(0)."""
    _seed_complex(db, "8601", "1111011800")
    monkeypatch.setattr(
        service_kapt, "_fetch_all_kapt", lambda *a, **k: ([_kapt("KX", "2611010100")], True)
    )
    monkeypatch.setattr(service_kapt, "fetch_apt_basis_info", lambda code: None)

    result = match_kapt_complexes()

    assert result == {"matched": 0, "skipped": 1, "save_failed": 0, "error": "no_match"}


def test_normal_run_results_unchanged(db, monkeypatch):
    """ⓒ 평소 회차의 결과(건수·정리·잡 status·사유)가 수리 전과 같다.

    세 단지 저장 + 재확인 안 된 옛 연결 2건 정리. 수리 전 코드도 이 입력에서 같은 값을 낸다
    (matched 3 · skipped 2 · purged 2 · completed · processed 3 / total 3 · 사유 없음).
    `save_failed` 키만 이번 수리로 새로 생겼다.

    옛 연결 2건 = ① 이번 목록에 후보가 없는 단지(pass 1 탈락) ② 후보는 있어 기본정보까지 받았는데
    세대수 게이트에서 떨어진 단지(pass 2 탈락). ②는 "재확인 못 함"이 아니라 "규칙에서 떨어짐" 이라
    정리 보호 대상이 아니다 — 보호 범위를 pass 2 까지 간 단지 전부로 넓히면 여기서 걸린다.
    """
    pairs = _seed_three(db, monkeypatch, "83")
    old = utcnow() - timedelta(days=40)
    _seed_complex(db, "8399", "2611010100")  # ① 이번 목록에 후보가 없는 단지의 옛 연결
    db.add(KaptComplexMap(
        complex_no="8399", kapt_code="KOLD", kapt_name="옛오매칭", match_score=0.7, matched_at=old,
    ))
    _seed_complex(db, "8398", "1111011898")  # ② 기본정보 세대수 500 vs 우리 120 → 탈락
    db.add(KaptComplexMap(
        complex_no="8398", kapt_code="KGATE", kapt_name="옛세대수불일치", match_score=0.9,
        matched_at=old,
    ))
    db.commit()
    # _seed_three 가 가짜로 바꿔 둔 목록에 ② 의 후보 한 줄을 더한다.
    rows = service_kapt._fetch_all_kapt()[0] + [_kapt("KGATE", "1111011898")]
    monkeypatch.setattr(service_kapt, "_fetch_all_kapt", lambda *a, **k: (rows, True))
    monkeypatch.setattr(
        service_kapt, "fetch_apt_basis_info",
        lambda code: {"codeHallNm": "계단식", "kaptdaCnt": 500.0 if code == "KGATE" else 120.0},
    )

    result = match_kapt_complexes()

    assert result == {
        "matched": 3, "skipped": 2, "purged": 2, "basis_failed": 0, "save_failed": 0,
        "list_complete": True,
    }
    db.expire_all()
    rows = {r.complex_no: (r.kapt_code, r.corridor_type, r.kapt_household_count)
            for r in db.query(KaptComplexMap).all()}
    assert rows == {no: (code, "계단식", 120) for code, no in pairs.items()}
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "kapt_match").one()
    assert job.status == "completed"
    assert (job.processed_items, job.total_items) == (3, 3)
    assert job.error_message is None
