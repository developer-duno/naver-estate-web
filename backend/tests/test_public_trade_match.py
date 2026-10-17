"""crawler/public_trade_match.py 시군구 단위 실거래가 짝짓기 시험 (세션 469).

배경: 국토부 실거래가에는 단지 번호·법정동 코드가 없어 이름으로만 짝을 지었는데,
같은 시군구에 같은 이름 단지가 여럿이면(예: 수원 권선구 금곡동·고색동의 '거산') 서로의
거래가 섞여 들어갔다. 이제 응답의 법정동 이름(umdNm 첫 낱말)과 우리 주소 마지막 낱말을
같이 대조하고, 오피스텔은 후보에서 빼며, 해제(취소)된 거래는 가격에서 뺀다.
"""

from crawler.public_trade_match import ComplexRef, SigunguMatcher


def _ref(no, name, dong, type_code="APT"):
    """시험용 단지 — 이름은 이미 정규화된 꼴로 넣는다."""
    return ComplexRef(complex_no=no, norm_name=name, dong=dong, type_code=type_code)


def _trade(umd, apt, amount, cancelled=False):
    return {
        "umdNm": umd,
        "aptNm": apt,
        "dealAmount": amount,
        "cdealType": "O" if cancelled else " ",
    }


def test_같은_이름_다른_법정동은_각자_동으로_간다():
    m = SigunguMatcher([_ref("1775", "거산", "금곡동"), _ref("2666", "거산", "고색동")])
    assert m.match("금곡동", "거산") == "1775"
    assert m.match("고색동", "거산") == "2666"
    assert m.match("권선동", "거산") is None


def test_읍면_법정동은_첫_낱말로_맞춘다():
    m = SigunguMatcher([_ref("101582", "광일", "와부읍")])
    assert m.match("와부읍 도곡리", "광일") == "101582"


def test_법정동_정보가_비면_짝_없음():
    m = SigunguMatcher([_ref("1", "거산", ""), _ref("2", "거산", "고색동")])
    assert m.match("금곡동", "거산") is None
    assert m.match("", "거산") is None
    assert m.match(None, None) is None


def test_오피스텔은_후보가_아니다():
    m = SigunguMatcher([_ref("A", "a", "금곡동", "APT"), _ref("O", "a", "금곡동", "OPST")])
    assert m.match("금곡동", "a") == "A"
    only_opst = SigunguMatcher([_ref("O", "a", "금곡동", "OPST"), _ref("B", "a", "금곡동", "OBYG")])
    assert only_opst.match("금곡동", "a") is None


def test_같은_동_같은_이름은_유형_우선순위():
    m1 = SigunguMatcher([_ref("J", "a", "금곡동", "JGC"), _ref("A", "a", "금곡동", "APT")])
    assert m1.match("금곡동", "a") == "A"
    m2 = SigunguMatcher([_ref("B", "a", "금곡동", "ABYG"), _ref("J", "a", "금곡동", "JGC")])
    assert m2.match("금곡동", "a") == "J"


def test_같은_동_같은_유형_둘이면_안_붙인다():
    m = SigunguMatcher([_ref("A1", "a", "금곡동"), _ref("A2", "a", "금곡동")])
    assert m.match("금곡동", "a") is None


def test_끝_단지를_뗀_이름으로도_맞춘다():
    m = SigunguMatcher([_ref("C", "청백3단지", "금곡동")])
    assert m.match("금곡동", "청백3") == "C"


def test_N단지_흡수는_형제가_없을_때만():
    alone = SigunguMatcher([_ref("O", "올림픽선수기자촌", "방이동")])
    assert alone.match("방이동", "올림픽선수기자촌1단지") == "O"

    # 형제 "경희궁의아침2단지"는 다른 동이어도 같은 시군구면 흡수를 막는다
    with_sibling = SigunguMatcher([
        _ref("K", "경희궁의아침", "내수동"),
        _ref("K2", "경희궁의아침2단지", "평동"),
    ])
    assert with_sibling.match("내수동", "경희궁의아침3단지") is None

    # 정확히 같은 "경희궁의아침3단지"가 있으면 그쪽으로
    with_exact = SigunguMatcher([
        _ref("K", "경희궁의아침", "내수동"),
        _ref("K3", "경희궁의아침3단지", "내수동"),
    ])
    assert with_exact.match("내수동", "경희궁의아침3단지") == "K3"


def test_정확_일치가_흡수보다_먼저다():
    m = SigunguMatcher([_ref("A", "a", "금곡동"), _ref("A1", "a1단지", "금곡동")])
    assert m.match("금곡동", "a1단지") == "A1"


def test_aggregate_는_해제와_가격0을_빼고_단지별로_모은다():
    m = SigunguMatcher([_ref("1775", "거산", "금곡동"), _ref("2666", "거산", "고색동")])
    trades = [
        _trade("금곡동", "거산", "50,000"),
        _trade("금곡동", "거산", "52,000"),
        _trade("금곡동", "거산", "99,999", cancelled=True),
        _trade("고색동", "거산", "30,000"),
        _trade("고색동", "거산", "0"),
    ]
    assert m.aggregate(trades) == {"1775": [50000, 52000], "2666": [30000]}


def test_aggregate_는_여러_국토부_이름을_한_단지로_합친다():
    m = SigunguMatcher([_ref("O", "올림픽선수기자촌", "방이동")])
    trades = [
        _trade("방이동", "올림픽선수기자촌1단지", "150,000"),
        _trade("방이동", "올림픽선수기자촌2단지", "160,000"),
    ]
    assert m.aggregate(trades) == {"O": [150000, 160000]}


def test_from_db_는_시군구_단지만_읽는다(db):
    from db.models import Complex

    db.add_all([
        Complex(complex_no="1775", complex_name="거산", cortar_no="4111313400",
                cortar_address="경기도 수원시 권선구 금곡동", real_estate_type_code="APT"),
        Complex(complex_no="2666", complex_name="거산", cortar_no="4111312800",
                cortar_address="경기도 수원시 권선구 고색동", real_estate_type_code="APT"),
        Complex(complex_no="9001", complex_name="거산", cortar_no="1168010100",
                cortar_address="서울시 강남구 역삼동", real_estate_type_code="APT"),
    ])
    db.commit()

    from crawler.public_trade_match import SigunguMatcher as M

    m = M.from_db(db, "41113")
    assert sorted(m.complex_nos) == ["1775", "2666"]
    assert m.match("금곡동", "거산") == "1775"


def test_정확_일치가_모호하면_끝_단지_단계로_넘어가지_않는다():
    """같은 동 APT 'a' 둘 + 'a단지' 하나, 국토부 'a' → None — 모호함을 느슨한 규칙으로 풀지 않는다."""
    m = SigunguMatcher([_ref("A1", "a", "금곡동"), _ref("A2", "a", "금곡동"), _ref("AD", "a단지", "금곡동")])
    assert m.match("금곡동", "a") is None
