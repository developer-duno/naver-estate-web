"""DB 순간 끊김 재시도 공용 함수(db/retry.py) 회귀 — 세션 459.

DB 없이 가짜 세션(롤백 횟수만 센다)과 일 함수로 재시도 규칙만 본다:
OperationalError·InterfaceError(끊긴 연결, 세션 460)만 롤백 → 5·15·45초 대기 → 같은 일 다시, 4번째도 실패면 그대로 던짐, 다른 예외는 즉시 던짐.
"""

import logging

import pytest
from sqlalchemy.exc import IntegrityError, InterfaceError, OperationalError

from db.retry import DB_RETRY_WAITS, retry_db


class FakeDb:
    def __init__(self):
        self.rollbacks = 0

    def rollback(self):
        self.rollbacks += 1


def _op_error(msg="canceling statement due to statement timeout\nCONTEXT: x"):
    return OperationalError("UPDATE x", {}, Exception(msg))


def _work(fail_n, exc_factory=_op_error, value="ok"):
    """처음 fail_n 번은 예외, 그 뒤엔 value 를 돌려주는 일. 부른 횟수는 calls[0]."""
    calls = [0]

    def work():
        calls[0] += 1
        if calls[0] <= fail_n:
            raise exc_factory()
        return value

    return work, calls


def test_대기_순서는_5_15_45초():
    assert DB_RETRY_WAITS == (5, 15, 45)


def test_끊김이_없으면_한_번에_돌려주고_기다리지_않는다():
    db, sleeps = FakeDb(), []
    work, calls = _work(0, value=7)
    assert retry_db(db, work, sleeps.append) == 7
    assert (calls[0], sleeps, db.rollbacks) == (1, [], 0)


def test_한_번_끊긴_뒤_성공하면_롤백_1번_5초_대기_뒤_값을_돌려준다(caplog):
    db, sleeps = FakeDb(), []
    work, calls = _work(1, value="saved")
    with caplog.at_level(logging.WARNING, logger="db.retry"):
        assert retry_db(db, work, sleeps.append, "동네 통계 저장") == "saved"
    assert (calls[0], sleeps, db.rollbacks) == (2, [5], 1)
    msg = caplog.records[0].getMessage()
    assert msg.startswith("동네 통계 저장 중 DB 가 잠깐 응답하지 않았어요")
    assert "재시도 1/3" in msg
    assert "canceling statement due to statement timeout" in msg and "CONTEXT" not in msg   # 원인은 첫 줄만


def test_4번_연속_끊기면_5_15_45초_기다린_뒤_그대로_던지고_롤백은_4번():
    db, sleeps = FakeDb(), []
    work, calls = _work(4)
    with pytest.raises(OperationalError):
        retry_db(db, work, sleeps.append)
    assert (calls[0], sleeps, db.rollbacks) == (4, [5, 15, 45], 4)


def test_3번_끊긴_뒤_4번째에_성공하면_돌려준다():
    db, sleeps = FakeDb(), []
    work, calls = _work(3, value=1)
    assert retry_db(db, work, sleeps.append) == 1
    assert (calls[0], sleeps, db.rollbacks) == (4, [5, 15, 45], 3)


def test_다른_예외는_대기_0_롤백_0으로_바로_던진다():
    db, sleeps = FakeDb(), []
    work, calls = _work(1, exc_factory=lambda: IntegrityError("INSERT", {}, Exception("dup")))
    with pytest.raises(IntegrityError):
        retry_db(db, work, sleeps.append)
    assert (calls[0], sleeps, db.rollbacks) == (1, [], 0)


def test_what_을_안_주면_기본_이름이_붙는다(caplog):
    db = FakeDb()
    work, _ = _work(1)
    with caplog.at_level(logging.WARNING, logger="db.retry"):
        retry_db(db, work, lambda s: None)
    assert caplog.records[0].getMessage().startswith("DB 작업 중 DB 가 잠깐 응답하지 않았어요")


def _if_error():
    return InterfaceError("SELECT 1", {}, Exception("connection already closed"))


def test_끊긴_연결_InterfaceError_도_한_번_끊긴_뒤_성공하면_값을_돌려준다():
    db, sleeps = FakeDb(), []
    work, calls = _work(1, exc_factory=_if_error, value="saved")
    assert retry_db(db, work, sleeps.append) == "saved"
    assert (calls[0], sleeps, db.rollbacks) == (2, [5], 1)


def test_끊긴_연결_InterfaceError_가_4번_연속이면_그대로_던진다():
    db, sleeps = FakeDb(), []
    work, calls = _work(4, exc_factory=_if_error)
    with pytest.raises(InterfaceError):
        retry_db(db, work, sleeps.append)
    assert (calls[0], sleeps, db.rollbacks) == (4, [5, 15, 45], 4)
