"""crawl_complex_articles 의 단지 상세 보강 누락 버그 재현·회귀 테스트

배경: complexes 6만 단지 중 단지 상세(detail_crawled_at)가 채워진 것이 8.6%뿐.
매물 크롤된 단지 40,042개 중 34,597개가 단지 상세 비어 있음. 네이버 API는
정상 응답하는데 crawl_complex_articles 의 상세 보강 단계(service_discover.py
line 190-193)가 저장하지 못함 → 이 테스트로 버그를 재현·고정한다.
"""

from unittest.mock import patch

from db.models import Complex as ComplexModel
from services.upsert import upsert_complex_from_search

# ── 팩토리 함수 ──


def _make_complex_data(complex_no="88888"):
    """테스트용 단지 검색 데이터 (단지 상세 미보강 상태)"""
    return {
        "complexNo": complex_no,
        "complexName": "보강누락테스트아파트",
        "cortarNo": "1168010100",
        "realEstateTypeCode": "APT",
    }


def _make_articles_response():
    """네이버 매물 리스트 API 응답 (매물 2건, 페이지 1장)"""
    return {
        "articleList": [
            {"articleNo": "art-1", "tradeTypeName": "매매", "dealOrWarrantPrc": "120,000"},
            {"articleNo": "art-2", "tradeTypeName": "전세", "dealOrWarrantPrc": "60,000"},
        ],
        "isMoreData": False,
    }


def _make_detail_response():
    """네이버 단지 상세 API 정상 응답 (test_enricher.py 답습)"""
    return {
        "complexDetail": {
            "heatMethodTypeCode": "HT002",
            "heatFuelTypeCode": "HF001",
            "parkingPossibleCount": "500",
            "constructionCompanyName": "삼성물산",
            "floorAreaRatio": "249.5",
            "buildingCoverageRatio": "19.8",
            "address": "서울특별시 강남구 역삼동 123-45",
            "roadAddressPrefix": "서울특별시 강남구",
            "roadAddress": "테헤란로 123",
            "managementOfficeTelNo": "02-1234-5678",
        },
        "complexPyeongDetailList": [],
    }


# ── 테스트 ──


class TestCrawlComplexArticlesEnrich:
    """crawl_complex_articles 의 단지 상세 보강 단계 검증"""

    @patch("services.enricher.NaverEstateAPI")
    @patch("crawler.service_discover.NaverEstateAPI")
    def test_enrich_runs_after_article_crawl(self, mock_articles_api, mock_detail_api, db):
        """정상: 매물 크롤 후 단지 상세도 채워져야 한다 (버그 재현 핵심).

        수정 전에는 detail_crawled_at 이 None 으로 남아 실패(red)한다.
        """
        upsert_complex_from_search(db, _make_complex_data("88888"))
        db.commit()

        mock_articles_api.get_complex_articles.return_value = _make_articles_response()
        mock_detail_api.get_complex_detail.return_value = _make_detail_response()

        from crawler.service_discover import crawl_complex_articles
        crawl_complex_articles("88888")

        # crawl_complex_articles 는 자체 SessionLocal() 세션을 쓰므로
        # fixture db 의 세션 캐시를 비우고 DB 에서 다시 읽는다.
        db.expire_all()
        cpx = db.query(ComplexModel).filter(ComplexModel.complex_no == "88888").first()
        assert cpx.detail_crawled_at is not None, "매물 크롤 후 단지 상세가 보강되지 않음 (버그)"
        assert cpx.construction_company == "삼성물산"
        assert cpx.total_parking_count == 500

    @patch("services.enricher.NaverEstateAPI")
    @patch("crawler.service_discover.NaverEstateAPI")
    def test_enrich_failure_keeps_articles(self, mock_articles_api, mock_detail_api, db):
        """에러: 단지 상세 보강이 실패해도 매물 자체는 정상 저장돼야 한다."""
        upsert_complex_from_search(db, _make_complex_data("88889"))
        db.commit()

        mock_articles_api.get_complex_articles.return_value = _make_articles_response()
        # 단지 상세 API 가 예외 → 보강 실패
        mock_detail_api.get_complex_detail.side_effect = Exception("네트워크 타임아웃")

        from crawler.service_discover import crawl_complex_articles
        crawl_complex_articles("88889")

        db.expire_all()
        from db.models import Article as ArticleModel
        articles = db.query(ArticleModel).filter(ArticleModel.complex_no == "88889").all()
        assert len(articles) == 2, "단지 상세 보강 실패가 매물 저장까지 망가뜨림"

    @patch("services.enricher.NaverEstateAPI")
    @patch("crawler.service_discover.NaverEstateAPI")
    def test_enrich_skipped_when_already_done(self, mock_articles_api, mock_detail_api, db):
        """엣지: detail_crawled_at 이 이미 있으면 단지 상세 API 를 다시 부르지 않는다."""
        from utils import utcnow
        upsert_complex_from_search(db, _make_complex_data("88890"))
        db.query(ComplexModel).filter(ComplexModel.complex_no == "88890").update(
            {"detail_crawled_at": utcnow()}
        )
        db.commit()

        mock_articles_api.get_complex_articles.return_value = _make_articles_response()
        mock_detail_api.get_complex_detail.return_value = _make_detail_response()

        from crawler.service_discover import crawl_complex_articles
        crawl_complex_articles("88890")

        mock_detail_api.get_complex_detail.assert_not_called()
