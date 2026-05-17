"""crawl_complex_details_batch + get_complexes_for_detail_enrich 검증

단지 상세 유형별 backfill — detail_crawled_at IS NULL 단지를
매물유형별로 골라 enrich_complex_detail 호출.
"""

from unittest.mock import patch

from db.complex_queries import get_complexes_for_detail_enrich
from db.models import Complex as ComplexModel
from services.upsert import upsert_complex_from_search
from utils import utcnow

# ── 팩토리 함수 ──


def _make_complex_data(complex_no, type_code="APT"):
    """테스트용 단지 검색 데이터"""
    return {
        "complexNo": complex_no,
        "complexName": f"단지{complex_no}",
        "cortarNo": "1168010100",
        "realEstateTypeCode": type_code,
    }


def _make_detail_response():
    """네이버 단지 상세 API 정상 응답 (test_enricher.py 답습)"""
    return {
        "complexDetail": {
            "constructionCompanyName": "삼성물산",
            "floorAreaRatio": "249.5",
            "parkingPossibleCount": "500",
        },
        "complexPyeongDetailList": [],
    }


# ── get_complexes_for_detail_enrich 쿼리 테스트 ──


class TestGetComplexesForDetailEnrich:
    """유형별 backfill 대상 조회 쿼리 검증"""

    def test_filters_by_type_and_null_detail(self, db):
        """정상: 유형 일치 + detail_crawled_at NULL 단지만 반환"""
        upsert_complex_from_search(db, _make_complex_data("c1", "APT"))
        upsert_complex_from_search(db, _make_complex_data("c2", "OPST"))
        # c3: APT 이지만 이미 단지상세 수집됨 → 제외 대상
        upsert_complex_from_search(db, _make_complex_data("c3", "APT"))
        db.query(ComplexModel).filter(ComplexModel.complex_no == "c3").update(
            {"detail_crawled_at": utcnow()}
        )
        db.commit()

        result = get_complexes_for_detail_enrich(db, "APT")
        assert result == ["c1"]  # c2(OPST 유형), c3(이미 수집) 제외

    def test_limit_respected(self, db):
        """엣지: limit 만큼만 반환"""
        for i in range(5):
            upsert_complex_from_search(db, _make_complex_data(f"c{i}", "APT"))
        db.commit()

        result = get_complexes_for_detail_enrich(db, "APT", limit=3)
        assert len(result) == 3


# ── crawl_complex_details_batch 배치 테스트 ──


class TestCrawlComplexDetailsBatch:
    """유형별 단지 상세 backfill 배치 검증"""

    @patch("crawler.service_discover._throttle_detail")
    @patch("services.enricher.NaverEstateAPI")
    def test_enriches_target_type(self, mock_api, _mock_throttle, db):
        """정상: 지정 유형의 미수집 단지가 단지 상세 보강된다"""
        upsert_complex_from_search(db, _make_complex_data("c1", "APT"))
        db.commit()
        mock_api.get_complex_detail.return_value = _make_detail_response()

        from crawler.service_discover import crawl_complex_details_batch
        crawl_complex_details_batch("APT", batch_size=10)

        db.expire_all()
        cpx = db.query(ComplexModel).filter(ComplexModel.complex_no == "c1").first()
        assert cpx.detail_crawled_at is not None
        assert cpx.construction_company == "삼성물산"

    @patch("crawler.service_discover._throttle_detail")
    @patch("services.enricher.NaverEstateAPI")
    def test_type_filter_isolates(self, mock_api, _mock_throttle, db):
        """정상: 다른 유형 단지는 건드리지 않는다"""
        upsert_complex_from_search(db, _make_complex_data("apt1", "APT"))
        upsert_complex_from_search(db, _make_complex_data("opst1", "OPST"))
        db.commit()
        mock_api.get_complex_detail.return_value = _make_detail_response()

        from crawler.service_discover import crawl_complex_details_batch
        crawl_complex_details_batch("OPST", batch_size=10)

        db.expire_all()
        apt = db.query(ComplexModel).filter(ComplexModel.complex_no == "apt1").first()
        opst = db.query(ComplexModel).filter(ComplexModel.complex_no == "opst1").first()
        assert apt.detail_crawled_at is None  # APT 는 OPST 배치에서 제외
        assert opst.detail_crawled_at is not None

    @patch("crawler.service_discover._throttle_detail")
    @patch("services.enricher.NaverEstateAPI")
    def test_individual_failure_no_crash(self, mock_api, _mock_throttle, db):
        """에러: 단지 상세 API 예외 시 크래시 없이 배치 완료"""
        upsert_complex_from_search(db, _make_complex_data("c1", "APT"))
        db.commit()
        mock_api.get_complex_detail.side_effect = Exception("네트워크 타임아웃")

        from crawler.service_discover import crawl_complex_details_batch
        # 예외가 배치 전체를 죽이지 않아야 한다
        crawl_complex_details_batch("APT", batch_size=10)

        db.expire_all()
        cpx = db.query(ComplexModel).filter(ComplexModel.complex_no == "c1").first()
        assert cpx.detail_crawled_at is None  # 실패 → 미수집 유지 (다음 배치 재시도)
