"""어린이집 API 단위 테스트 — 응답 파싱 + 근접 매칭"""

from unittest.mock import patch

from crawler.childcare_api import ChildcareAPI


class TestGetChildcareList:
    """get_childcare_list API 응답 파싱 테스트"""

    def test_정상_응답_파싱(self):
        """API 응답에서 좌표/정원이 올바르게 추출되는지"""
        mock_resp = {
            "response": {
                "header": {"resultCode": "00", "resultMsg": "NORMAL_CODE"},
                "body": {
                    "totalCount": 2,
                    "items": {
                        "item": [
                            {"crname": "행복어린이집", "la": "37.5", "lo": "127.0", "crcapat": "50", "crcnfnt": "30", "crtypename": "민간"},
                            {"crname": "사랑어린이집", "la": "37.6", "lo": "127.1", "crcapat": "80", "crcnfnt": "60", "crtypename": "국공립"},
                        ]
                    },
                    "pageNo": 1,
                    "numOfRows": 100,
                },
            }
        }
        with patch.object(ChildcareAPI, "call_api", return_value=mock_resp):
            result = ChildcareAPI.get_childcare_list("11680")
        assert len(result) == 2
        assert result[0]["name"] == "행복어린이집"
        assert result[0]["lat"] == 37.5
        assert result[0]["lng"] == 127.0
        assert result[0]["capacity"] == 50
        assert result[1]["type_name"] == "국공립"

    def test_빈_응답_처리(self):
        """어린이집 없는 시군구 → 빈 리스트"""
        mock_resp = {
            "response": {
                "header": {"resultCode": "00"},
                "body": {"totalCount": 0, "items": {}},
            }
        }
        with patch.object(ChildcareAPI, "call_api", return_value=mock_resp):
            result = ChildcareAPI.get_childcare_list("99999")
        assert result == []

    def test_API_실패_시_빈_리스트(self):
        """call_api None 반환 → 빈 리스트"""
        with patch.object(ChildcareAPI, "call_api", return_value=None):
            result = ChildcareAPI.get_childcare_list("11680")
        assert result == []

    def test_좌표_없는_항목_제외(self):
        """la/lo가 없는 어린이집은 결과에서 제외 (좌표 있는 1건만 반환)"""
        mock_resp = {
            "response": {
                "header": {"resultCode": "00"},
                "body": {
                    "totalCount": 1,
                    "items": {
                        "item": [
                            {"crname": "좌표있음", "la": "37.5", "lo": "127.0", "crcapat": "50"},
                            {"crname": "좌표없음", "la": "", "lo": "", "crcapat": "30"},
                        ]
                    },
                },
            }
        }
        with patch.object(ChildcareAPI, "call_api", return_value=mock_resp):
            result = ChildcareAPI.get_childcare_list("11680")
        assert len(result) == 1
        assert result[0]["name"] == "좌표있음"

    def test_단일_item_dict_처리(self):
        """item이 단일 dict(리스트 아님)인 경우 처리"""
        mock_resp = {
            "response": {
                "header": {"resultCode": "00"},
                "body": {
                    "totalCount": 1,
                    "items": {
                        "item": {"crname": "하나어린이집", "la": "37.5", "lo": "127.0", "crcapat": "20"}
                    },
                },
            }
        }
        with patch.object(ChildcareAPI, "call_api", return_value=mock_resp):
            result = ChildcareAPI.get_childcare_list("11680")
        assert len(result) == 1


class TestFindNearest:
    """find_nearest 근접 매칭 테스트"""

    def test_반경_내_어린이집_집계(self):
        """반경 1km 내 어린이집 올바르게 카운트"""
        facilities = [
            {"name": "가까운집", "lat": 37.501, "lng": 127.001, "capacity": 50},
            {"name": "먼집", "lat": 37.6, "lng": 127.1, "capacity": 80},
        ]
        result = ChildcareAPI.find_nearest(37.5, 127.0, facilities, radius_m=1000)
        assert result["count"] == 1
        assert result["nearest_name"] == "가까운집"
        assert result["nearest_capacity"] == 50
        assert result["nearest_dist"] is not None

    def test_반경_밖_결과(self):
        """반경 내 어린이집 없으면 count=0"""
        facilities = [
            {"name": "먼집", "lat": 38.0, "lng": 128.0, "capacity": 30},
        ]
        result = ChildcareAPI.find_nearest(37.5, 127.0, facilities, radius_m=1000)
        assert result["count"] == 0
        assert result["nearest_dist"] is None
        assert result["nearest_name"] == ""

    def test_빈_시설목록(self):
        """시설 목록이 비어있으면 count=0"""
        result = ChildcareAPI.find_nearest(37.5, 127.0, [], radius_m=1000)
        assert result["count"] == 0

    def test_가장_가까운_것_선택(self):
        """여러 어린이집 중 가장 가까운 것의 정보 반환"""
        facilities = [
            {"name": "중간", "lat": 37.503, "lng": 127.003, "capacity": 40},
            {"name": "가장가까운", "lat": 37.5001, "lng": 127.0001, "capacity": 60},
            {"name": "살짝먼", "lat": 37.505, "lng": 127.005, "capacity": 30},
        ]
        result = ChildcareAPI.find_nearest(37.5, 127.0, facilities, radius_m=2000)
        assert result["nearest_name"] == "가장가까운"
        assert result["nearest_capacity"] == 60
