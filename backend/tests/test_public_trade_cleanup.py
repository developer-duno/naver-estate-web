"""주간 collect_public_trade_data 의 법정동 짝짓기·옛 줄 정리 시험 (세션 469).

- 같은 시군구의 같은 이름 단지(수원 권선구 금곡동·고색동 '거산')는 법정동으로 갈라 저장한다.
- 오피스텔은 후보가 아니고, 해제(취소) 거래는 가격에서 뺀다.
- 한 시군구의 달을 모두 받고 1줄 이상 저장했으면, 그 시군구 단지들의 옛 정부 줄 중
  이번 달 목록 안·회차 시작 전에 쓰인 것을 지운다. 네이버 줄·달 목록 밖 줄은 남긴다.
- 호출이 실패한 시군구·한 줄도 못 붙인 시군구는 지우지 않는다.

외부 창구(get_all_apt_trades)만 가짜로 바꾸고, DB 는 conftest SQLite 를 그대로 쓴다.
"""

import logging
from datetime import timedelta
from unittest.mock import patch

from db.models import Complex, ComplexPriceHistory
from utils import utcnow

MONTHS = ["202607", "202608", "202609"]
OLD = timedelta(days=10)


def _add_complexes(db):
    db.add_all([
        Complex(complex_no="1775", complex_name="거산", cortar_no="4111313400",
                cortar_address="경기도 수원시 권선구 금곡동", real_estate_type_code="APT"),
        Complex(complex_no="2666", complex_name="거산", cortar_no="4111312800",
                cortar_address="경기도 수원시 권선구 고색동", real_estate_type_code="APT"),
        Complex(complex_no="3001", complex_name="거산", cortar_no="4111313400",
                cortar_address="경기도 수원시 권선구 금곡동", real_estate_type_code="OPST"),
        Complex(complex_no="9001", complex_name="거산", cortar_no="1168010100",
                cortar_address="서울시 강남구 역삼동", real_estate_type_code="APT"),
    ])
    db.commit()


def _gov(complex_no, month, avg, *, area_no="", recorded_at=None):
    return ComplexPriceHistory(
        complex_no=complex_no, trade_type="A1", area_no=area_no, base_month=month,
        price_avg=avg, recorded_at=recorded_at or (utcnow() - OLD),
    )


def _trade(umd, apt, amount, cancelled=False):
    return {"umdNm": umd, "aptNm": apt, "dealAmount": amount, "cdealType": "O" if cancelled else " "}


def _run(side_effect):
    from crawler.public_data_api import PublicDataAPI
    PublicDataAPI.reset()
    from crawler.service_public import collect_public_trade_data
    with patch.dict("os.environ", {"PUBLIC_DATA_API_KEY": "test-key"}), \
         patch("crawler.service_public._recent_months", return_value=list(MONTHS)), \
         patch("crawler.public_data_api.PublicDataAPI.get_all_apt_trades", side_effect=side_effect):
        collect_public_trade_data(batch_size=10, scheduler_job_id="collect_public_trades")


def _suwon_only(trades):
    """수원 권선구(41113)에만 거래를 주고 다른 시군구는 거래 없는 달."""
    def _fake(sigungu_cd, deal_ymd):
        return list(trades) if sigungu_cd == "41113" else []
    return _fake


def _rows(db, complex_no):
    db.expire_all()
    return (
        db.query(ComplexPriceHistory)
        .filter(ComplexPriceHistory.complex_no == complex_no)
        .order_by(ComplexPriceHistory.base_month, ComplexPriceHistory.price_avg)
        .all()
    )


def test_주간은_법정동으로_갈라_저장한다(db):
    _add_complexes(db)
    _run(_suwon_only([_trade("금곡동", "거산", "50,000")]))

    assert [r.base_month for r in _rows(db, "1775")] == MONTHS
    assert _rows(db, "2666") == []
    assert _rows(db, "3001") == []  # 같은 동·같은 이름 오피스텔엔 안 붙는다


def test_주간은_이번에_짝이_안_된_옛_줄을_지운다(db):
    _add_complexes(db)
    db.add_all([
        _gov("2666", "202608", 1),                       # 창 안 → 삭제
        _gov("2666", "202609", 2, area_no=None),         # 창 안(NULL) → 삭제
        _gov("3001", "202607", 3),                       # 오피스텔 창 안 → 삭제
        _gov("2666", "201001", 4),                       # 창 밖 → 유지
        _gov("1775", "202608", 5, area_no="84A"),        # 네이버 줄 → 유지
        _gov("9001", "202608", 6),                       # 다른 시군구(이번에 저장 0) → 유지
    ])
    db.commit()

    _run(_suwon_only([_trade("금곡동", "거산", "50,000")]))

    assert [r.price_avg for r in _rows(db, "2666")] == [4]
    assert _rows(db, "3001") == []
    assert [r.area_no for r in _rows(db, "1775")].count("84A") == 1
    assert len([r for r in _rows(db, "1775") if r.area_no == ""]) == 3
    assert [r.price_avg for r in _rows(db, "9001")] == [6]


def test_호출_실패한_시군구는_옛_줄을_지우지_않는다(db):
    _add_complexes(db)
    db.add_all([_gov("2666", "202607", 1), _gov("3001", "202609", 2)])
    db.commit()

    def _fake(sigungu_cd, deal_ymd):
        if sigungu_cd != "41113":
            return []
        if deal_ymd == MONTHS[1]:
            return None  # 두 번째 달 호출 실패
        return [_trade("금곡동", "거산", "50,000")]

    _run(_fake)

    assert [r.price_avg for r in _rows(db, "2666")] == [1]
    assert [r.price_avg for r in _rows(db, "3001")] == [2]
    assert [r.base_month for r in _rows(db, "1775")] == [MONTHS[0]]  # 저장은 첫 달 분만


def test_회차_시작_뒤에_쓰인_줄은_남긴다(db):
    _add_complexes(db)
    trades = [_trade("금곡동", "거산", "50,000")]
    written = []

    def _fake(sigungu_cd, deal_ymd):
        # 같은 회차 도중 다른 잡(예: 03:30 소급)이 2666 줄을 막 쓴 상황
        if not written:
            from db.database import SessionLocal
            s = SessionLocal()
            try:
                s.add(_gov("2666", MONTHS[0], 7, recorded_at=utcnow()))
                s.commit()
            finally:
                s.close()
            written.append(True)
        return list(trades) if sigungu_cd == "41113" else []

    _run(_fake)

    assert [r.price_avg for r in _rows(db, "2666")] == [7]


def test_이번에_한_줄도_못_붙인_시군구는_정리하지_않는다(db, caplog):
    _add_complexes(db)
    db.add_all([_gov("2666", "202607", 1), _gov("1775", "202608", 2)])
    db.commit()

    caplog.set_level(logging.WARNING, logger="crawler.service_public")
    _run(_suwon_only([_trade("금곡동", "전혀다른이름", "50,000")]))

    assert [r.price_avg for r in _rows(db, "2666")] == [1]
    assert [r.price_avg for r in _rows(db, "1775")] == [2]
    warned = [r for r in caplog.records if "41113" in r.getMessage() and "정리하지 않음" in r.getMessage()]
    assert len(warned) == 1
    assert warned[0].levelno == logging.WARNING  # 거래가 왔고 후보도 있는데 0줄 = 이상 신호


def test_주간은_해제_거래를_뺀다(db):
    _add_complexes(db)
    _run(_suwon_only([
        _trade("금곡동", "거산", "50,000"),
        _trade("금곡동", "거산", "90,000", cancelled=True),
    ]))

    rows = _rows(db, "1775")
    assert len(rows) == 3
    assert {(r.price_avg, r.price_upper, r.price_lower) for r in rows} == {(50000, 50000, 50000)}


# ── 보완 1 (검사관 A·C 지적) ─────────────────────────────────────────────


def test_주간은_거래가_없는_달의_옛_줄은_남긴다(db):
    """정상 응답인데 거래 0건인 달은 '짝이 안 됐다'는 증거가 아니다 — 그 달의 옛 줄은 보존."""
    _add_complexes(db)
    db.add_all([_gov("2666", MONTHS[0], 1), _gov("2666", MONTHS[1], 2)])
    db.commit()

    def _fake(sigungu_cd, deal_ymd):
        if sigungu_cd == "41113" and deal_ymd == MONTHS[0]:
            return [_trade("금곡동", "거산", "50,000")]
        return []

    _run(_fake)

    assert [r.price_avg for r in _rows(db, "2666")] == [2]  # 거래 온 첫 달만 지워짐


def test_법정동이나_유형을_모르는_단지의_옛_줄은_남긴다(db):
    """주소가 비었거나 유형이 비어 짝이 될 수 없는 단지는 정리 범위 밖."""
    _add_complexes(db)
    db.add_all([
        Complex(complex_no="4001", complex_name="거산", cortar_no="4111313400",
                cortar_address=None, real_estate_type_code="APT"),
        Complex(complex_no="4002", complex_name="다른", cortar_no="4111313400",
                cortar_address="경기도 수원시 권선구 금곡동", real_estate_type_code=None),
    ])
    db.add_all([_gov("4001", MONTHS[0], 1), _gov("4002", MONTHS[1], 2)])
    db.commit()

    _run(_suwon_only([_trade("금곡동", "거산", "50,000")]))

    assert [r.price_avg for r in _rows(db, "4001")] == [1]
    assert [r.price_avg for r in _rows(db, "4002")] == [2]
    assert len(_rows(db, "1775")) == 3


def test_지울_줄이_보유의_절반을_넘으면_시군구_정리를_건너뛴다(db, caplog):
    """차단기 — 지울 줄 4 > 보유 7 의 절반이면 하나도 안 지우고 경고 한 줄."""
    _add_complexes(db)
    db.add_all([_gov("2666", m, i) for i, m in enumerate(MONTHS, start=1)] + [_gov("3001", MONTHS[0], 9)])
    db.commit()

    caplog.set_level(logging.WARNING, logger="crawler.service_public")
    _run(_suwon_only([_trade("금곡동", "거산", "50,000")]))

    assert [r.price_avg for r in _rows(db, "2666")] == [1, 2, 3]
    assert [r.price_avg for r in _rows(db, "3001")] == [9]
    skipped = [r for r in caplog.records if "정리 건너뜀" in r.getMessage() and "41113" in r.getMessage()]
    assert len(skipped) == 1 and skipped[0].levelno == logging.WARNING


def test_거래가_없거나_후보가_없는_시군구는_경고가_아니라_안내(db, caplog):
    """'붙인 줄이 없어 정리하지 않음' 은 거래 0 이거나 아파트 후보 0 이면 INFO."""
    _add_complexes(db)
    db.add(Complex(complex_no="2700", complex_name="오피", cortar_no="1171010100",
                   cortar_address="서울시 송파구 잠실동", real_estate_type_code="OPST"))
    db.commit()

    def _fake(sigungu_cd, deal_ymd):
        if sigungu_cd == "11710":  # 거래는 오지만 후보는 오피스텔뿐
            return [_trade("잠실동", "오피", "30,000")]
        return []  # 41113·11680 은 거래 0

    caplog.set_level(logging.INFO, logger="crawler.service_public")
    _run(_fake)

    recs = [r for r in caplog.records if "정리하지 않음" in r.getMessage()]
    assert {r.args[0] for r in recs} == {"41113", "11680", "11710"}
    assert all(r.levelno == logging.INFO for r in recs)


def test_두번째_시군구에서_예외가_나면_첫_시군구_저장과_정리도_함께_되돌린다(db):
    """체크포인트 경계 — 5개마다 commit 이라 첫 시군구 정리·저장은 아직 확정 전이고,
    두 번째 시군구 예외의 rollback 으로 함께 되돌아간다(현재 동작 고정 — 반쪽 반영 없음)."""
    _add_complexes(db)
    db.add(Complex(complex_no="9002", complex_name="다른", cortar_no="1168010100",
                   cortar_address="서울시 강남구 역삼동", real_estate_type_code="APT"))
    db.add_all([_gov("2666", MONTHS[0], 1), _gov("9002", MONTHS[0], 2)])
    db.commit()

    first: list[str] = []

    def _fake(sigungu_cd, deal_ymd):
        if not first:
            first.append(sigungu_cd)
        if sigungu_cd != first[0]:
            raise RuntimeError("두 번째 시군구에서 터짐")
        return [_trade("금곡동", "거산", "50,000"), _trade("역삼동", "거산", "60,000")]

    _run(_fake)

    from db.models import CrawlJob
    db.expire_all()
    assert db.query(CrawlJob).filter(CrawlJob.job_type == "public_trade_data").one().status == "failed"
    assert [r.price_avg for r in _rows(db, "2666")] == [1]   # 정리 되돌림
    assert [r.price_avg for r in _rows(db, "9002")] == [2]
    assert _rows(db, "1775") == [] and _rows(db, "9001") == []  # 저장도 되돌림
