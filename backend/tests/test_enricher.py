"""services/enricher.py 단위 테스트

enrich_complex_detail 검증 — 단지 상세 정보 보강.
"""

from unittest.mock import patch

from db.models import Complex as ComplexModel
from db.models import ComplexPyeongDetail
from services.upsert import upsert_complex_from_search

# ── 팩토리 함수 ──


def _make_complex_data():
    """테스트용 단지 검색 데이터"""
    return {
        "complexNo": "99999",
        "complexName": "보강테스트아파트",
        "cortarNo": "1168010100",
        "realEstateTypeCode": "APT",
    }


def _make_detail_response(**overrides):
    """네이버 단지 상세 API 응답 형식 데이터"""
    resp = {
        "complexDetail": {
            "heatMethodTypeCode": "HT002",
            "heatMethodTypeName": "개별난방",
            "heatFuelTypeCode": "HF001",
            "parkingPossibleCount": "500",
            "constructionCompanyName": "삼성물산",
            "floorAreaRatio": "249.5",
            "buildingCoverageRatio": "19.8",
            "address": "서울특별시 강남구 역삼동 123-45",
            "roadAddressPrefix": "서울특별시 강남구",
            "roadAddress": "테헤란로 123",
            "parkingCountByHousehold": "1.5",
            "managementOfficeTelNo": "02-1234-5678",
        },
        "complexPyeongDetailList": [
            {
                "pyeongNo": 1001,
                "pyeongName": "59A",
                "supplyArea": "84.99",
                "supplyAreaDouble": 84.99,
                "exclusiveArea": "59.99",
                "exclusiveRate": "70.58",
                "householdCountByPyeong": "200",
                "entranceType": "계단식",
                "roomCnt": "3",
                "bathroomCnt": "2",
                "averageMaintenanceCost": {"averageTotalPrice": "250000"},
                "supplyPyeong": "25",
                "exclusivePyeong": "18",
                "grandPlanList": [{"imageSrc": "/test/floorplan.jpg"}],
                "maintenanceCostList": [
                    {"totalPrice": "280000", "basisYearMonth": "202603"},
                ],
            },
        ],
    }
    resp.update(overrides)
    return resp


# ── 테스트 ──


class TestEnrichComplexDetail:
    """enrich_complex_detail 검증"""

    @patch("services.enricher.NaverEstateAPI")
    def test_normal_enrich(self, mock_api, db):
        """정상: API 응답으로 단지 상세 보강"""
        # 단지 생성
        upsert_complex_from_search(db, _make_complex_data())

        mock_api.get_complex_detail.return_value = _make_detail_response()

        from services.enricher import enrich_complex_detail
        assert enrich_complex_detail(db, "99999") is True

        cpx = db.query(ComplexModel).filter(ComplexModel.complex_no == "99999").first()
        assert cpx.heat_method_type == "개별난방 (도시가스)"
        assert cpx.construction_company == "삼성물산"
        assert cpx.total_parking_count == 500
        assert cpx.road_address == "서울특별시 강남구 테헤란로 123"
        assert cpx.detail_crawled_at is not None

        # 면적 정보 확인
        pyeong = db.query(ComplexPyeongDetail).filter(
            ComplexPyeongDetail.complex_no == "99999",
            ComplexPyeongDetail.pyeong_no == 1001,
        ).first()
        assert pyeong is not None
        assert pyeong.pyeong_name == "59A"
        assert pyeong.room_count == 3
        assert pyeong.bathroom_count == 2
        assert pyeong.floor_plan_url == "https://landthumb-phinf.pstatic.net/test/floorplan.jpg"

    @patch("services.enricher.NaverEstateAPI")
    def test_api_failure_no_crash(self, mock_api, db):
        """에러: API 예외 시 크래시 없이 조용히 반환"""
        upsert_complex_from_search(db, _make_complex_data())

        mock_api.get_complex_detail.side_effect = Exception("네트워크 타임아웃")

        from services.enricher import enrich_complex_detail
        # API 예외 시 False 반환 (예외는 던지지 않음)
        assert enrich_complex_detail(db, "99999") is False

        # detail_crawled_at이 업데이트되지 않음
        cpx = db.query(ComplexModel).filter(ComplexModel.complex_no == "99999").first()
        assert cpx.detail_crawled_at is None

    @patch("services.enricher.NaverEstateAPI")
    def test_empty_response(self, mock_api, db):
        """에러: API가 빈 dict 반환 시 무시"""
        upsert_complex_from_search(db, _make_complex_data())

        mock_api.get_complex_detail.return_value = {}

        from services.enricher import enrich_complex_detail
        # 빈 응답 시 False 반환
        assert enrich_complex_detail(db, "99999") is False

        cpx = db.query(ComplexModel).filter(ComplexModel.complex_no == "99999").first()
        assert cpx.detail_crawled_at is None

    @patch("services.enricher.NaverEstateAPI")
    def test_legacy_field_names(self, mock_api, db):
        """엣지: batlRatio/btlRatio 레거시 필드명도 처리"""
        upsert_complex_from_search(db, _make_complex_data())

        resp = _make_detail_response()
        detail = resp["complexDetail"]
        # 현재 필드 제거, 레거시 필드 설정
        del detail["floorAreaRatio"]
        del detail["buildingCoverageRatio"]
        detail["batlRatio"] = "250.0"
        detail["btlRatio"] = "20.0"
        mock_api.get_complex_detail.return_value = resp

        from services.enricher import enrich_complex_detail
        enrich_complex_detail(db, "99999")

        cpx = db.query(ComplexModel).filter(ComplexModel.complex_no == "99999").first()
        assert cpx.floor_area_ratio == "250.0"
        assert cpx.building_coverage_ratio == "20.0"

    @patch("services.enricher.NaverEstateAPI")
    def test_pyeong_update_existing(self, mock_api, db):
        """엣지: 이미 존재하는 pyeong 정보 업데이트"""
        upsert_complex_from_search(db, _make_complex_data())

        # 첫 번째 보강
        mock_api.get_complex_detail.return_value = _make_detail_response()
        from services.enricher import enrich_complex_detail
        enrich_complex_detail(db, "99999")

        # 두 번째 보강 (관리비 변경)
        resp2 = _make_detail_response()
        resp2["complexPyeongDetailList"][0]["averageMaintenanceCost"]["averageTotalPrice"] = "300000"
        mock_api.get_complex_detail.return_value = resp2
        enrich_complex_detail(db, "99999")

        pyeong = db.query(ComplexPyeongDetail).filter(
            ComplexPyeongDetail.complex_no == "99999",
            ComplexPyeongDetail.pyeong_no == 1001,
        ).first()
        assert pyeong.avg_maintenance_cost == 300000

        # 중복 레코드 없음
        count = db.query(ComplexPyeongDetail).filter(
            ComplexPyeongDetail.complex_no == "99999"
        ).count()
        assert count == 1

    @patch("services.enricher.NaverEstateAPI")
    def test_multi_pyeong_partial_existing(self, mock_api, db):
        """N+1 prefetch: 여러 평형 중 일부만 기존일 때 prefetch dict 가 정확히 매칭.

        루프 전 1회 prefetch 로 바꾼 뒤에도, 기존 행은 업데이트하고
        새 행은 INSERT 하며 평형별로 섞여도 정확히 분기되는지 검증.
        """
        upsert_complex_from_search(db, _make_complex_data())
        from services.enricher import enrich_complex_detail

        # 1차: 평형 1001 하나만 보강
        mock_api.get_complex_detail.return_value = _make_detail_response()
        enrich_complex_detail(db, "99999")

        # 2차: 기존 1001(관리비 변경) + 신규 2002 함께
        resp2 = _make_detail_response()
        resp2["complexPyeongDetailList"][0]["averageMaintenanceCost"]["averageTotalPrice"] = "310000"
        resp2["complexPyeongDetailList"].append({
            "pyeongNo": 2002,
            "pyeongName": "84B",
            "roomCnt": "4",
            "bathroomCnt": "2",
            "averageMaintenanceCost": {"averageTotalPrice": "400000"},
        })
        mock_api.get_complex_detail.return_value = resp2
        enrich_complex_detail(db, "99999")

        # 기존 행 업데이트됨
        p1 = db.query(ComplexPyeongDetail).filter(
            ComplexPyeongDetail.complex_no == "99999",
            ComplexPyeongDetail.pyeong_no == 1001,
        ).first()
        assert p1.avg_maintenance_cost == 310000
        # 신규 행 INSERT 됨
        p2 = db.query(ComplexPyeongDetail).filter(
            ComplexPyeongDetail.complex_no == "99999",
            ComplexPyeongDetail.pyeong_no == 2002,
        ).first()
        assert p2 is not None
        assert p2.room_count == 4
        # 총 2행 (중복 없음)
        count = db.query(ComplexPyeongDetail).filter(
            ComplexPyeongDetail.complex_no == "99999"
        ).count()
        assert count == 2

    @patch("services.enricher.NaverEstateAPI")
    def test_duplicate_pyeong_no_in_one_response(self, mock_api, db):
        """엣지: 같은 응답에 동일 pyeong_no 가 중복으로 와도 단일 행만 생성.

        prefetch dict 를 루프 안에서 갱신(existing_map[pyeong_no]=new_row)하므로
        같은 응답의 두 번째 동일 pyeong_no 는 add 가 아닌 update 로 처리되어
        UniqueConstraint 위반/중복 INSERT 가 발생하지 않아야 한다.
        """
        upsert_complex_from_search(db, _make_complex_data())
        from services.enricher import enrich_complex_detail

        resp = _make_detail_response()
        dup = dict(resp["complexPyeongDetailList"][0])
        dup["averageMaintenanceCost"] = {"averageTotalPrice": "999999"}
        resp["complexPyeongDetailList"].append(dup)  # 같은 pyeongNo=1001 중복
        mock_api.get_complex_detail.return_value = resp

        enrich_complex_detail(db, "99999")

        count = db.query(ComplexPyeongDetail).filter(
            ComplexPyeongDetail.complex_no == "99999",
            ComplexPyeongDetail.pyeong_no == 1001,
        ).count()
        assert count == 1
