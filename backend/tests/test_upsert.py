"""services/upsert.py 단위 테스트

upsert_complex_from_search, upsert_article, delete_missing_articles 검증.
"""

from unittest.mock import MagicMock

from db.models import Article as ArticleModel
from db.models import ArticlePriceHistory
from db.models import Complex as ComplexModel
from services.upsert import (
    build_detail_update_dict,
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
        # #9 매물 가치 필드
        "price_change_state": None,
        "article_status": None,
        "same_addr_cnt": None,
        "same_addr_min_prc": None,
        "same_addr_max_prc": None,
        "verification_type_code": None,
        "is_direct_trade": False,
        "cp_name": None,
        "site_image_count": None,
        "same_addr_premium_min": None,
        "same_addr_premium_max": None,
        "premium_prc": None,
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


class TestArticleValueFields:
    """#9 매물 가치 필드 — from_dict 매핑 + upsert 저장 검증"""

    def test_from_dict_maps_value_fields(self):
        """정상: 네이버 리스트 API 키가 가치 필드 속성으로 매핑된다"""
        from shared.domain.article import RealEstateArticle

        art = RealEstateArticle.from_dict({
            "articleNo": "A1",
            "tradeTypeName": "매매",
            "priceChangeState": "INCREASE",
            "articleStatus": "R0",
            "sameAddrCnt": 3,
            "sameAddrMinPrc": "13억 5,000",
            "sameAddrMaxPrc": "14억",
            "verificationTypeCode": "S_VR",
            "isDirectTrade": True,
            "cpName": "매경부동산",
            "siteImageCount": "12",
            "sameAddrPremiumMin": "-1000",
            "sameAddrPremiumMax": "0",
            "premiumPrc": "-1,000",
        })
        assert art.price_change_state == "INCREASE"
        assert art.article_status == "R0"
        assert art.same_addr_cnt == 3  # 정수 변환
        assert art.same_addr_min_prc == "13억 5,000"  # 문자열 보존
        assert art.verification_type_code == "S_VR"
        assert art.is_direct_trade is True
        assert art.cp_name == "매경부동산"
        assert art.site_image_count == 12  # 문자열 "12" → 정수
        assert art.same_addr_premium_min == "-1000"  # 음수 문자열 보존
        assert art.premium_prc == "-1,000"

    def test_from_dict_value_fields_default_when_absent(self):
        """엣지: 가치 키가 없으면 안전한 기본값(None / False)"""
        from shared.domain.article import RealEstateArticle

        art = RealEstateArticle.from_dict({"articleNo": "A2", "tradeTypeName": "전세"})
        assert art.price_change_state is None
        assert art.same_addr_cnt is None
        assert art.site_image_count is None
        assert art.is_direct_trade is False  # 불리언 기본값
        assert art.same_addr_premium_min is None

    def test_upsert_persists_value_fields(self, db):
        """정상: 가치 필드가 DB upsert 로 저장된다"""
        upsert_complex_from_search(db, _make_search_data())
        upsert_article(db, _make_article(
            article_no="A001",
            price_change_state="DECREASE",
            same_addr_cnt=2,
            same_addr_min_prc="10억",
            is_direct_trade=True,
            site_image_count=8,
            same_addr_premium_min="-500",
        ))
        saved = db.query(ArticleModel).filter_by(article_no="A001").one()
        assert saved.price_change_state == "DECREASE"
        assert saved.same_addr_cnt == 2
        assert saved.same_addr_min_prc == "10억"
        assert saved.is_direct_trade is True
        assert saved.site_image_count == 8
        assert saved.same_addr_premium_min == "-500"


class TestArticleDetail4Fields:
    """#10 매물 상세 4필드 — update_from_detail 파싱 + build_detail_update_dict 변환 검증"""

    @staticmethod
    def _make_domain():
        """detail 파싱 대상 RealEstateArticle 인스턴스"""
        from shared.domain.article import RealEstateArticle

        return RealEstateArticle(article_no="A1", trade_type_name="매매")

    def test_update_from_detail_parses_4fields(self):
        """정상: 상세 API articleDetail 4키가 속성으로 매핑된다"""
        art = self._make_domain()
        art.update_from_detail({"articleDetail": {
            "walkingTimeToNearSubway": 2,
            "isaleRightTypeName": "일반분양",
            "articleStatusCode": "R0",
            "tradeCompleteYN": "N",
        }})
        assert art.walking_time_to_subway == 2
        assert art.isale_right_type_name == "일반분양"
        assert art.detail_status_code == "R0"
        assert art.trade_complete is False  # "N" → False

    def test_update_from_detail_trade_complete_yes(self):
        """정상: tradeCompleteYN='Y' 면 trade_complete True"""
        art = self._make_domain()
        art.update_from_detail({"articleDetail": {"tradeCompleteYN": "Y"}})
        assert art.trade_complete is True

    def test_update_from_detail_general_article_no_isale(self):
        """엣지: 일반 매물은 isaleRightTypeName 키가 없어 None"""
        art = self._make_domain()
        art.update_from_detail({"articleDetail": {"articleStatusCode": "R0"}})
        assert art.isale_right_type_name is None
        assert art.trade_complete is False  # 키 부재 → False

    def test_update_from_detail_walking_time_zero(self):
        """엣지: 도보시간 0분도 정수 0으로 저장된다 (데이터 보존)"""
        art = self._make_domain()
        art.update_from_detail({"articleDetail": {"walkingTimeToNearSubway": 0}})
        assert art.walking_time_to_subway == 0

    def test_build_detail_update_dict_includes_4fields(self):
        """정상: build_detail_update_dict 결과에 4키가 값과 함께 포함된다"""
        art = self._make_domain()
        art.update_from_detail({"articleDetail": {
            "walkingTimeToNearSubway": 5,
            "isaleRightTypeName": "조합원분양",
            "articleStatusCode": "R1",
            "tradeCompleteYN": "Y",
        }})
        update = build_detail_update_dict(art)
        assert update["walking_time_to_subway"] == 5
        assert update["isale_right_type_name"] == "조합원분양"
        assert update["detail_status_code"] == "R1"
        assert update["trade_complete"] is True

    def test_build_detail_update_dict_defaults(self):
        """엣지: detail 미파싱 도메인도 4키가 안전한 기본값으로 존재한다"""
        art = self._make_domain()
        update = build_detail_update_dict(art)
        assert update["walking_time_to_subway"] is None
        assert update["isale_right_type_name"] is None
        assert update["detail_status_code"] is None
        assert update["trade_complete"] is False


class TestArticleDetailKeyDrift:
    """네이버 articleDetail 키 드리프트 회귀 가드 (세션 401)

    배경: 네이버가 상세 응답 키를 바꿨는데(heatingTypeName→aptHeatMethodTypeName,
    useApproveYmd→aptUseApproveYmd, jibunAddress→exposureAddress) 파서가 옛 키를 읽어
    세 컬럼이 **전 행 NULL** 이 됐다(prod 실측 285,321/285,321). 그 결과
    routers/live/crawl.py:135-138 의 조기 반환 조건
    `detail_crawled AND (heating_type OR jibun_address OR use_approve_ymd)` 가
    한 번도 성립하지 못해 매물 상세를 열 때마다 네이버를 실시간 재호출했다.

    라이브 실측 근거(article_no=2644366360, 2026-09-13):
      aptHeatMethodTypeName=개별난방 / aptUseApproveYmd=19911217 /
      exposureAddress=대전시 유성구 구암동 (옛 키 3종은 전부 부재)
    """

    @staticmethod
    def _make_domain():
        from shared.domain.article import RealEstateArticle

        return RealEstateArticle(article_no="A1", trade_type_name="매매")

    def test_new_keys_are_parsed(self):
        """정상: 현행 네이버 키 3종이 속성으로 매핑된다"""
        art = self._make_domain()
        art.update_from_detail({"articleDetail": {
            "aptHeatMethodTypeName": "개별난방",
            "aptUseApproveYmd": "19911217",
            "exposureAddress": "대전시 유성구 구암동",
        }})
        assert art.heating_type == "개별난방"
        assert art.use_approve_ymd == "19911217"
        assert art.jibun_address == "대전시 유성구 구암동"

    def test_old_keys_no_longer_honored(self):
        """회귀: 옛 키만 오면 채워지지 않는다 (드리프트를 되돌리면 이 테스트가 잡는다)"""
        art = self._make_domain()
        art.update_from_detail({"articleDetail": {
            "heatingTypeName": "중앙난방",
            "useApproveYmd": "20200101",
            "jibunAddress": "서울시 강남구",
        }})
        assert art.heating_type is None
        assert art.use_approve_ymd is None
        assert art.jibun_address is None

    def test_absent_keys_do_not_overwrite_existing(self):
        """가드 전용 케이스: 키가 없는 응답이 **도메인 객체**의 기존 값을 지우지 않는다.

        ⚠ 이 테스트가 덮는 범위는 "같은 도메인 객체를 재파싱할 때"까지다.
        DB 덮어쓰기는 이 가드로 막지 못한다 — 운영 경로는 매 회차 빈 객체를 새로 만들고
        build_detail_update_dict 가 세 필드를 무조건 UPDATE 에 싣기 때문(세션 401 감사 지적).
        키 매핑 회귀는 test_old_keys_no_longer_honored 담당(역할 분리).
        """
        art = self._make_domain()
        art.heating_type = "개별난방"
        art.jibun_address = "대전시 유성구 구암동"
        art.use_approve_ymd = "19911217"
        art.total_floor_count = 15

        art.update_from_detail({"articleDetail": {"roomCount": 3}})

        assert art.heating_type == "개별난방"
        assert art.jibun_address == "대전시 유성구 구암동"
        assert art.use_approve_ymd == "19911217"
        # totalFloorCount 가드 — 이 단언이 없으면 가드를 제거해도 어느 테스트도 못 잡는다
        # (세션 401 적대검증 M8: 가드 제거 뮤테이션 검출 0건이던 빈틈).
        assert art.total_floor_count == 15

    def test_empty_string_does_not_overwrite_existing(self):
        """빈 문자열 방어: 네이버가 ""를 보내도 기존 값을 ""로 덮지 않는다.

        네이버는 이 페이로드에서 없는 값을 null 이 아니라 **빈 문자열**로 주는 습관이 있다
        (세션 401 실측: 매물 5/5 의 articleSubName·detailAddress 가 ""). ""가 저장되면
        FE InfoRow(`if (!value) return null`)가 행을 통째로 지우고, `??` 는 ""를 폴백
        대상으로 보지 않아 complex_address 폴백까지 막힌다 — None 보다 나쁜 값이다.
        그래서 `is not None` 이 아니라 falsy 가드를 쓴다.
        """
        art = self._make_domain()
        art.heating_type = "개별난방"
        art.jibun_address = "대전시 유성구 구암동"
        art.use_approve_ymd = "19911217"

        art.update_from_detail({"articleDetail": {
            "aptHeatMethodTypeName": "",
            "exposureAddress": "",
            "aptUseApproveYmd": "",
        }})

        assert art.heating_type == "개별난방"
        assert art.jibun_address == "대전시 유성구 구암동"
        assert art.use_approve_ymd == "19911217"

    def test_build_detail_update_dict_carries_new_keys(self):
        """정상: 파싱 결과가 DB 업데이트 dict 까지 전달된다"""
        art = self._make_domain()
        art.update_from_detail({"articleDetail": {
            "aptHeatMethodTypeName": "지역난방",
            "aptUseApproveYmd": "20051130",
            "exposureAddress": "부산시 해운대구 우동",
        }})
        update = build_detail_update_dict(art)
        assert update["heating_type"] == "지역난방"
        assert update["use_approve_ymd"] == "20051130"
        assert update["jibun_address"] == "부산시 해운대구 우동"

    def test_early_return_gate_is_satisfiable(self):
        """통합: 파싱 후 crawl.py 조기 반환 조건이 실제로 성립한다.

        `has_detail = heating_type or jibun_address or use_approve_ymd` (OR) 이므로
        셋 중 하나만 채워져도 네이버 재호출 없이 DB 값으로 응답한다.
        드리프트 상태에서는 이 값이 영원히 falsy 였다.
        """
        art = self._make_domain()
        art.update_from_detail({"articleDetail": {
            "aptHeatMethodTypeName": "개별난방",
            "aptUseApproveYmd": "19911217",
            "exposureAddress": "대전시 유성구 구암동",
        }})
        update = build_detail_update_dict(art)
        has_detail = (
            update["heating_type"] or update["jibun_address"] or update["use_approve_ymd"]
        )
        assert has_detail, "조기 반환 게이트가 성립해야 네이버 재호출이 멈춘다"
