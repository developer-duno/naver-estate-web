"""scripts/backfill_complex_list.py 정해진 단지 목록 소급 스크립트 시험 (세션 469).

섞인 묶음 단지는 옛 줄을 지우지 않고 60달 소급으로 다시 쓴다(사장님 결정 10-17). 이틀에 나눠 돌리므로
호출 상한에서 멈추고, 진행 파일의 끝난 단지는 다시 돌릴 때 건너뛰어야 한다.
창구 요청(get_apt_trades)만 가짜로 바꾸고 backfill_price_history 는 진짜로 돈다(DB = conftest SQLite).
"""

import json
from datetime import datetime, timezone
from unittest.mock import patch

from db.models import Complex

_EMPTY = {"response": {"header": {"resultCode": "00"}, "body": {"totalCount": 0, "items": {}}}}


def _seed(db):
    # 시군구가 서로 달라 캐시를 나눠 쓰지 않는다 — 단지마다 달 수만큼 요청
    db.add_all([
        Complex(complex_no="C1", complex_name="가단지", cortar_no="1100000000",
                total_household_count=900, real_estate_type_code="APT"),
        Complex(complex_no="C2", complex_name="나단지", cortar_no="2600000000",
                total_household_count=800, real_estate_type_code="APT"),
        Complex(complex_no="C3", complex_name="다단지", cortar_no="4100000000",
                total_household_count=700, real_estate_type_code="APT"),
    ])
    db.commit()


def _run(args, side_effect=None):
    from crawler.public_data_api import PublicDataAPI
    PublicDataAPI.reset()
    from scripts.backfill_complex_list import run
    with patch("crawler.public_data_api.PublicDataAPI.get_apt_trades",
               side_effect=side_effect or (lambda *a, **k: _EMPTY)) as mock_get:
        result = run(**args)
    return result, mock_get


def test_호출_상한에_닿으면_그_단지_전에서_멈추고_끝난_단지만_적는다(db, tmp_path):
    _seed(db)
    state = tmp_path / "state.json"
    result, mock_get = _run(dict(complex_nos=["C3", "C1", "C2"], months=2, max_calls=3,
                                 min_remaining=0, state=str(state)))

    # 세대수 큰 순 C1(2회) → C2 첫 요청(3회째) → 둘째 요청에서 상한 → 멈춤
    assert mock_get.call_count == 3
    assert result == {"done": 1, "total": 3, "calls": 3, "failed": 0, "reason": "max_calls"}
    assert json.loads(state.read_text(encoding="utf-8")) == {"done": ["C1"]}


def test_진행_파일에_끝난_단지는_건너뛴다(db, tmp_path):
    _seed(db)
    state = tmp_path / "state.json"
    state.write_text(json.dumps({"done": ["C1"]}), encoding="utf-8")
    result, mock_get = _run(dict(complex_nos=["C1", "C2", "C3"], months=2, max_calls=100,
                                 min_remaining=0, state=str(state)))

    asked = {c.args[0] for c in mock_get.call_args_list}
    assert "11000" not in asked and asked == {"26000", "41000"}
    assert result == {"done": 3, "total": 3, "calls": 4, "failed": 0, "reason": "done"}
    assert json.loads(state.read_text(encoding="utf-8")) == {"done": ["C1", "C2", "C3"]}


def test_창구_남은_횟수가_문턱_아래면_요청_전에_멈춘다(db, tmp_path):
    from crawler.public_data_api import PublicDataAPI

    _seed(db)
    PublicDataAPI.reset()
    PublicDataAPI._rate_limit = {"remaining": 1_000, "limit": 10_000, "at": datetime.now(timezone.utc)}
    from scripts.backfill_complex_list import run
    with patch("crawler.public_data_api.PublicDataAPI.get_apt_trades", return_value=_EMPTY) as mock_get:
        result = run(complex_nos=["C1"], months=2, max_calls=100, min_remaining=1_500,
                     state=str(tmp_path / "s.json"))
    PublicDataAPI.reset()

    assert mock_get.call_count == 0
    assert result["reason"] == "min_remaining" and result["done"] == 0


def test_끝나면_창구_요청_함수를_원래대로_되돌린다(db, tmp_path):
    from crawler.public_data_api import PublicDataAPI
    from scripts.backfill_complex_list import run

    run(complex_nos=[], months=2, max_calls=10, min_remaining=0, state=str(tmp_path / "s.json"))
    assert isinstance(PublicDataAPI.__dict__["get_apt_trades"], classmethod)


def test_창구가_하루_한도_초과라고_하면_멈춘다(db, tmp_path):
    from crawler.public_data_api import PublicDataAPI

    _seed(db)

    def _quota(*a, **k):
        PublicDataAPI._set_failure_kind("quota")
        return None

    result, mock_get = _run(dict(complex_nos=["C1", "C2"], months=2, max_calls=100,
                                 min_remaining=0, state=str(tmp_path / "s.json")), side_effect=_quota)

    assert mock_get.call_count == 1  # C1 첫 요청에서 한도 → C2 는 시도하지 않는다
    assert result["reason"] == "quota" and result["done"] == 0 and result["failed"] == 0
