"""직렬화 함수 테스트 — complex_to_dict, article_to_dict, build_filter_dict
실행: python -m pytest tests/test_serializers.py -v
"""
from datetime import datetime

from db.models import Article, Complex
from routers.serializers import article_to_dict, build_filter_dict, complex_to_dict


def _make_complex(**kw):
    defaults = dict(complex_no="C001", complex_name="테스트아파트", sido="서울", sigungu="강남", heat_method_type="개별난방")
    defaults.update(kw)
    return Complex(**defaults)


def _make_article(**kw):
    defaults = dict(article_no="A001", complex_no="C001", trade_type_name="매매", is_active=True, area2_m2=84.0, numeric_price=50000)
    defaults.update(kw)
    return Article(**defaults)


def test_complex_to_dict_has_all_fields():
    """complex_to_dict가 모든 필드를 반환"""
    c = _make_complex(last_crawled_at=datetime(2025, 1, 1))
    d = complex_to_dict(c)
    assert d["complex_no"] == "C001"
    assert d["complex_name"] == "테스트아파트"
    assert d["sido"] == "서울"
    assert d["last_crawled_at"] == "2025-01-01T00:00:00"


def test_complex_to_dict_null_dates():
    """날짜가 None이면 None 반환"""
    c = _make_complex()
    d = complex_to_dict(c)
    assert d["last_crawled_at"] is None
    assert d["detail_crawled_at"] is None


def test_complex_to_dict_has_pool():
    """has_pool 필드 포함"""
    c = _make_complex(has_pool=True)
    d = complex_to_dict(c)
    assert d["has_pool"] is True


def test_article_to_dict_pyeong_calculation():
    """면적 변환: 84m2 / 3.3058 = ~25.4평"""
    a = _make_article(area2_m2=84.0)
    d = article_to_dict(a)
    assert d["area2_pyeong"] is not None
    assert abs(d["area2_pyeong"] - 25.4) < 0.1


def test_article_to_dict_null_area():
    """area2_m2가 None이면 area2_pyeong도 None"""
    a = _make_article(area2_m2=None)
    d = article_to_dict(a)
    assert d["area2_pyeong"] is None


def test_article_to_dict_with_complex():
    """complex_obj로 빈 필드 보완"""
    c = _make_complex(heat_method_type="중앙난방", use_approve_ymd="20200101")
    a = _make_article(heating_type=None, use_approve_ymd=None)
    d = article_to_dict(a, complex_obj=c)
    assert d["heating_type"] == "중앙난방"
    assert d["use_approve_ymd"] == "20200101"


def test_article_to_dict_without_complex():
    """complex_obj 없이 호출해도 에러 없음"""
    a = _make_article()
    d = article_to_dict(a, complex_obj=None)
    assert d["heating_type"] is None
    assert d["total_household_count"] is None


def test_build_filter_dict_all_none():
    """모든 파라미터가 None이면 None 반환"""
    assert build_filter_dict() is None


def test_build_filter_dict_trade_types():
    """trade_types 콤마 분리"""
    result = build_filter_dict(trade_types="매매,전세")
    assert result["trade_types"] == ["매매", "전세"]


def test_build_filter_dict_tags():
    """tags 콤마 분리"""
    result = build_filter_dict(tags="역세권,학군")
    assert result["tags"] == ["역세권", "학군"]


def test_build_filter_dict_estate_type_all():
    """estate_type이 'all'이면 필터에서 제외"""
    result = build_filter_dict(estate_type="all", min_price=1000)
    assert "estate_type" not in result


def test_build_filter_dict_numeric():
    """숫자 필터 정상 전달"""
    result = build_filter_dict(min_price=5000, max_price=10000)
    assert result["min_price"] == 5000
    assert result["max_price"] == 10000


def test_build_filter_dict_verified_only():
    """verified_only 불리언 전달"""
    result = build_filter_dict(verified_only=True)
    assert result["verified_only"] is True


def test_build_filter_dict_min_rooms_zero():
    """min_rooms=0은 필터에 포함되지 않음 (0개 이상 = 전체)"""
    result = build_filter_dict(min_rooms=0)
    assert result is None


def test_build_filter_dict_min_rooms_positive():
    """min_rooms=2는 필터에 포함됨"""
    result = build_filter_dict(min_rooms=2)
    assert result is not None
    assert result["min_rooms"] == 2


def test_build_filter_dict_min_baths_positive():
    """min_baths=1은 필터에 포함됨"""
    result = build_filter_dict(min_baths=1)
    assert result is not None
    assert result["min_baths"] == 1


def test_build_filter_dict_max_building_age_zero():
    """max_building_age=0은 필터에 포함되지 않음"""
    result = build_filter_dict(max_building_age=0)
    assert result is None

def test_article_to_dict_all_keys():
    a = _make_article()
    d = article_to_dict(a)
    for key in ['article_no', 'complex_no', 'trade_type_name', 'area2_m2', 'numeric_price']:
        assert key in d
