"""services/upsert.py 단위 테스트

upsert_complex_from_search, upsert_article, delete_missing_articles 검증.
"""

from unittest.mock import MagicMock

from db.models import Article as ArticleModel
from db.models import ArticlePriceHistory
from db.models import Complex as ComplexModel
from services.upsert import (
    delete_missing_articles,
    upsert_article,
    upsert_complex_from_search,
)

# ── 팩토리 함수 ──


def _make_search_data(**overrides):
    """네이버 검색 API 응답 형식 단지 데이터 생성"""
    data = {
        "complexNo": "12345",
        "complexName": "테스트아파트",
        "cortarNo": "1168010100",
        "realEstateTypeCode": "APT",
        "realEstateTypeName": "아파트",
        "latitude": "37.5000",
        "longitude": "127.0500",
        "totalHouseholdCount": "1000",
        "highFloor": "25",
        "lowFloor": "3",
        "useApproveYmd": "20100301",
        "totalDongCount": "10",
        "minSupplyArea": "59.99",
        "maxSupplyArea": "114.85",
        "cortarAddress": "서울특별시 강남구 역삼동",
    }
    data.update(overrides)
    return data


def _make_article(**overrides):
    """RealEstateArticle 대용 mock 객체 생성"""
    art = MagicMock()
    defaults = {
        "article_no": "2400001234",
        "complex_no": "12345",
        "trade_type_name": "매매",
        "building_name": "101동",
        "floor_info": "10/25",
        "deal_or_warrant_prc": "15억",
        "rent_prc": "",
        "area1_m2": 84.99,
        "area2_m2": 59.99,
        "direction": "남향",
        "article_feature_desc": "로얄층 남향",
        "tags": ["급매"],
        "realtor_name": "테스트공인중개사",
        "article_confirm_ymd": "2026.04.01",
        "latitude": 37.5,
        "longitude": 127.05,
        "complex_name": "테스트아파트",
        "article_name": "테스트매물",
        "realtor_id": "R001",
        "realtor_phone": "010-1234-5678",
        "is_verified": True,
        "article_real_estate_type_name": "아파트",
        "is_presale": False,
        "numeric_price": 150000,
        "numeric_rent_price": None,
        "price_per_pyeong": 82645,
        "maintenance_cost": "30",
        "detail_description": None,
        "room_count": None,
        "bathroom_count": None,
        "move_in_date": None,
        "parking_count": None,
        "photo_urls": None,
        "representative_img_url": None,
        "realtor_phone_display": None,
        "realtor_address": None,
        "heating_type": None,
        "total_floor_count": None,
        "jibun_address": None,
        "use_approve_ymd": None,
        "acquisition_tax": None,
        "broker_fee": None,
    }
    defaults.update(overrides)
    for k, v in defaults.items():
        setattr(art, k, v)
    return art


# ── upsert_complex_from_search 테스트 ──


class TestUpsertComplexFromSearch:
    """검색 결과 단지 upsert 검증"""

    def test_normal_insert(self, db):
        """정상: 새 단지 insert → dict 반환"""
        data = _make_search_data()
        result = upsert_complex_from_search(db, data, sido="서울특별시", sigungu="강남구")

        assert result is not None
        assert result["complex_no"] == "12345"
        assert result["complex_name"] == "테스트아파트"
        assert result["sido"] == "서울특별시"

        # DB에 저장 확인
        row = db.query(ComplexModel).filter(ComplexModel.complex_no == "12345").first()
        assert row is not None
        assert row.complex_name == "테스트아파트"

    def test_empty_complex_no_returns_none(self, db):
        """에러: complexNo 없으면 None 반환"""
        data = _make_search_data(complexNo="")
        result = upsert_complex_from_search(db, data)
        assert result is None

    def test_update_existing(self, db):
        """엣지: 동일 complex_no로 두 번 upsert → 이름 업데이트"""
        data1 = _make_search_data(complexName="원래이름")
        upsert_complex_from_search(db, data1)

        data2 = _make_search_data(complexName="변경이름")
        upsert_complex_from_search(db, data2)

        row = db.query(ComplexModel).filter(ComplexModel.complex_no == "12345").first()
        assert row.complex_name == "변경이름"

    def test_address_parsing_without_sido(self, db):
        """엣지: sido 미제공 시 cortarAddress에서 파싱"""
        data = _make_search_data(cortarAddress="서울시 강남구 역삼동")
        result = upsert_complex_from_search(db, data)

        # "서울시" → "서울특별시" 정규화
        assert result["sido"] == "서울특별시"
        assert result["sigungu"] == "강남구"

    def test_invalid_lat_lng(self, db):
        """엣지: 위경도가 비정상 문자열이면 None"""
        data = _make_search_data(latitude="abc", longitude="def")
        upsert_complex_from_search(db, data)

        row = db.query(ComplexModel).filter(ComplexModel.complex_no == "12345").first()
        assert row.latitude is None
        assert row.longitude is None


# ── upsert_article 테스트 ──


class TestUpsertArticle:
    """매물 upsert 검증"""

    def test_normal_insert(self, db):
        """정상: 새 매물 insert"""
        # 단지 먼저 생성
        upsert_complex_from_search(db, _make_search_data())

        art = _make_article()
        upsert_article(db, art)

        row = db.query(ArticleModel).filter(ArticleModel.article_no == "2400001234").first()
        assert row is not None
        assert row.numeric_price == 150000
        assert row.is_active is True

    def test_price_tracking(self, db):
        """정상: 가격 변동 감지 시 ArticlePriceHistory 기록"""
        upsert_complex_from_search(db, _make_search_data())

        # 첫 번째 매물 insert
        art1 = _make_article(numeric_price=150000)
        upsert_article(db, art1, track_price=True)

        # 가격 변경
        art2 = _make_article(numeric_price=140000)
        upsert_article(db, art2, track_price=True)

        # 가격 이력 확인
        history = db.query(ArticlePriceHistory).filter(
            ArticlePriceHistory.article_no == "2400001234"
        ).all()
        assert len(history) == 1
        assert history[0].price == 140000

    def test_no_price_history_when_same_price(self, db):
        """엣지: 가격 동일하면 이력 미생성"""
        upsert_complex_from_search(db, _make_search_data())

        art = _make_article(numeric_price=150000)
        upsert_article(db, art, track_price=True)
        upsert_article(db, art, track_price=True)

        history = db.query(ArticlePriceHistory).all()
        assert len(history) == 0


# ── delete_missing_articles 테스트 ──


class TestDeleteMissingArticles:
    """크롤링에서 사라진 매물 삭제 검증"""

    def test_normal_delete(self, db):
        """정상: 보이지 않은 매물 삭제"""
        upsert_complex_from_search(db, _make_search_data())

        # 매물 2개 생성
        upsert_article(db, _make_article(article_no="A001"))
        upsert_article(db, _make_article(article_no="A002"))

        # A001만 보임 → A002 삭제
        delete_missing_articles(db, "12345", {"A001"})

        remaining = db.query(ArticleModel).all()
        assert len(remaining) == 1
        assert remaining[0].article_no == "A001"

    def test_empty_seen_set_no_delete(self, db):
        """엣지: seen_article_nos 비어있으면 삭제 안 함"""
        upsert_complex_from_search(db, _make_search_data())
        upsert_article(db, _make_article(article_no="A001"))

        delete_missing_articles(db, "12345", set())

        count = db.query(ArticleModel).count()
        assert count == 1

    def test_all_seen_no_delete(self, db):
        """엣지: 모든 매물이 보이면 삭제 없음"""
        upsert_complex_from_search(db, _make_search_data())
        upsert_article(db, _make_article(article_no="A001"))
        upsert_article(db, _make_article(article_no="A002"))

        delete_missing_articles(db, "12345", {"A001", "A002"})

        count = db.query(ArticleModel).count()
        assert count == 2
