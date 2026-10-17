"""scripts/cleanup_public_trade_rows.py 일회성 정리 스크립트 시험 (세션 469).

자동 정리(주간·소급)는 이번 24달 안만 지운다. 그 밖에 남는 것 두 가지를 한 번 지운다:
ⓐ 오피스텔(OPST·OBYG) 단지의 정부 실거래가 줄 전부 — 아파트 매매 창구라 애초에 붙으면 안 됐다
ⓑ 같은 시군구·같은 이름·다른 법정동 묶음(둘 이상이 정부 줄 보유) 소속 단지의 24달 밖 정부 줄 — 섞였던 옛 값
네이버 줄(area_no 채움)과 혼자인 단지의 옛 줄은 대상이 아니다. 기본은 세기만, --apply 때만 지운다.
"""

from datetime import date, timedelta

from db.models import Complex, ComplexPriceHistory
from utils import utcnow


def _months():
    from crawler.service_public import _recent_months
    return _recent_months(date.today(), 24)


def _seed(db):
    inside = _months()[-1]
    outside = "201001"
    old = utcnow() - timedelta(days=30)
    db.add_all([
        Complex(complex_no="3001", complex_name="오피1", cortar_no="4111313400",
                cortar_address="경기도 수원시 권선구 금곡동", real_estate_type_code="OPST"),
        Complex(complex_no="1775", complex_name="거산", cortar_no="4111313400",
                cortar_address="경기도 수원시 권선구 금곡동", real_estate_type_code="APT"),
        Complex(complex_no="2666", complex_name="거산", cortar_no="4111312800",
                cortar_address="경기도 수원시 권선구 고색동", real_estate_type_code="APT"),
        Complex(complex_no="5005", complex_name="혼자", cortar_no="4111312800",
                cortar_address="경기도 수원시 권선구 고색동", real_estate_type_code="APT"),
    ])

    def row(no, month, avg, area_no=""):
        return ComplexPriceHistory(complex_no=no, trade_type="A1", area_no=area_no, base_month=month,
                                   price_avg=avg, recorded_at=old)

    db.add_all([
        row("3001", inside, 1), row("3001", outside, 2),          # 오피스텔 정부 줄 → 대상 2
        row("3001", inside, 3, area_no="84A"),                     # 오피스텔 네이버 줄 → 대상 아님
        row("1775", inside, 4), row("1775", outside, 5),           # 섞인 묶음: 창 밖 5 만 대상
        row("2666", inside, 6), row("2666", outside, 7),           # 섞인 묶음: 창 밖 7 만 대상
        row("5005", outside, 8),                                   # 혼자인 단지 → 대상 아님
    ])
    db.commit()


def _avgs(db):
    db.expire_all()
    return sorted(r.price_avg for r in db.query(ComplexPriceHistory).all())


def _avgs_of(db, ids):
    return sorted(r.price_avg for r in db.query(ComplexPriceHistory).filter(ComplexPriceHistory.id.in_(ids)))


def test_대상은_오피스텔_전부와_섞인_묶음의_창_밖_줄뿐(db):
    from scripts.cleanup_public_trade_rows import find_targets

    _seed(db)
    targets = find_targets(db, _months())
    assert _avgs_of(db, targets["opst"]) == [1, 2]
    assert _avgs_of(db, targets["mixed_old"]) == [5, 7]


def test_apply_없이_실행하면_지우지_않는다(db, capsys):
    from scripts.cleanup_public_trade_rows import main

    _seed(db)
    assert main([]) == 0
    assert _avgs(db) == [1, 2, 3, 4, 5, 6, 7, 8]
    assert "오피스텔 2 · 섞인 묶음 창 밖 2" in capsys.readouterr().out


def test_apply_면_대상만_지운다(db):
    from scripts.cleanup_public_trade_rows import main

    _seed(db)
    assert main(["--apply"]) == 0
    assert _avgs(db) == [3, 4, 6, 8]


def _seed_groups(db, rows):
    """(단지 번호, 이름, 10자리 코드, 정부 줄 가짐) 목록 → 단지 + 창 밖 정부 줄."""
    old = utcnow() - timedelta(days=30)
    for no, name, code, has_gov in rows:
        db.add(Complex(complex_no=no, complex_name=name, cortar_no=code,
                       cortar_address="경기도 수원시 권선구 금곡동", real_estate_type_code="APT"))
        if has_gov:
            db.add(ComplexPriceHistory(complex_no=no, trade_type="A1", area_no="", base_month="201001",
                                       price_avg=1, recorded_at=old))
    db.commit()


def test_같은_법정동_묶음은_대상_아님(db):
    """이름이 같아도 법정동 코드가 하나뿐이면 '섞인 묶음'이 아니다."""
    from scripts.cleanup_public_trade_rows import find_targets

    _seed_groups(db, [("6001", "같음", "4111313400", True), ("6002", "같음", "4111313400", True)])
    assert find_targets(db, _months())["mixed_old"] == []


def test_정부_줄을_가진_단지가_1곳뿐인_다른_동_묶음은_대상_아님(db):
    """다른 동 묶음이어도 정부 줄을 가진 단지가 하나뿐이면 섞였을 수 없다."""
    from scripts.cleanup_public_trade_rows import find_targets

    _seed_groups(db, [("7001", "홀로", "4111313400", True), ("7002", "홀로", "4111312800", False)])
    assert find_targets(db, _months())["mixed_old"] == []
