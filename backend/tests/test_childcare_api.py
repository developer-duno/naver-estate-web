"""어린이집 API 단위 테스트 — XML 파싱 + 근접 매칭 + 행정코드 매핑"""

from unittest.mock import patch

from crawler.childcare_api import ChildcareAPI, resolve_sigungu_code


# XML 응답 헬퍼
def _xml_response(items_xml: str, total: int = 0) -> str:
    """테스트용 XML 응답 문자열 생성"""
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        "<response><header><resultCode>00</resultCode></header>"
        f"<body><totalCount>{total}</totalCount>"
        f"<items>{items_xml}</items></body></response>"
    )


class TestGetChildcareList:
    """get_childcare_list API 응답 파싱 테스트"""

    def test_정상_응답_파싱(self):
        """XML 응답에서 좌표/정원이 올바르게 추출되는지"""
        xml = _xml_response(
            "<item>"
            "<crname>행복어린이집</crname><la>37.5</la><lo>127.0</lo>"
            "<crcapat>50</crcapat><crcnfnt>30</crcnfnt><crtypename>민간</crtypename>"
            "</item>"
            "<item>"
            "<crname>사랑어린이집</crname><la>37.6</la><lo>127.1</lo>"
            "<crcapat>80</crcapat><crcnfnt>60</crcnfnt><crtypename>국공립</crtypename>"
            "</item>",
            total=2,
        )
        with patch.object(ChildcareAPI, "_call_api", return_value=ChildcareAPI._parse_xml(xml)):
            result = ChildcareAPI.get_childcare_list("11680")
        assert len(result) == 2
        assert result[0]["name"] == "행복어린이집"
        assert result[0]["lat"] == 37.5
        assert result[0]["lng"] == 127.0
        assert result[0]["capacity"] == 50
        assert result[1]["type_name"] == "국공립"

    def test_빈_응답_처리(self):
        """어린이집 없는 시군구 → 빈 리스트"""
        with patch.object(ChildcareAPI, "_call_api", return_value=[]):
            result = ChildcareAPI.get_childcare_list("99999")
        assert result == []

    def test_API_실패_시_빈_리스트(self):
        """_call_api None 반환 → 빈 리스트"""
        with patch.object(ChildcareAPI, "_call_api", return_value=None):
            result = ChildcareAPI.get_childcare_list("11680")
        assert result == []

    def test_좌표_없는_항목_제외(self):
        """la/lo가 없는 어린이집은 결과에서 제외"""
        xml = _xml_response(
            "<item><crname>좌표있음</crname><la>37.5</la><lo>127.0</lo><crcapat>50</crcapat></item>"
            "<item><crname>좌표없음</crname><la></la><lo></lo><crcapat>30</crcapat></item>",
            total=2,
        )
        with patch.object(ChildcareAPI, "_call_api", return_value=ChildcareAPI._parse_xml(xml)):
            result = ChildcareAPI.get_childcare_list("11680")
        assert len(result) == 1
        assert result[0]["name"] == "좌표있음"

    def test_단일_item_처리(self):
        """item이 1개인 경우 처리"""
        xml = _xml_response(
            "<item><crname>하나어린이집</crname><la>37.5</la><lo>127.0</lo><crcapat>20</crcapat></item>",
            total=1,
        )
        with patch.object(ChildcareAPI, "_call_api", return_value=ChildcareAPI._parse_xml(xml)):
            result = ChildcareAPI.get_childcare_list("11680")
        assert len(result) == 1

    def test_XML_파싱_실패_시_빈_리스트(self):
        """잘못된 XML → 빈 리스트"""
        result = ChildcareAPI._parse_xml("잘못된 XML")
        assert result == []


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


class TestResolveSigunguCode:
    """행정표준코드 매핑 테스트"""

    def test_서울_강남구(self):
        assert resolve_sigungu_code("서울", "강남구") == "11680"

    def test_부산_해운대구(self):
        assert resolve_sigungu_code("부산", "해운대구") == "26350"

    def test_경기_수원시(self):
        assert resolve_sigungu_code("경기", "수원시") == "41110"

    def test_복합_gu_폴백(self):
        assert resolve_sigungu_code("경기", "수원시 영통구") == "41110"

    def test_미매핑_구(self):
        assert resolve_sigungu_code("서울", "존재안하는구") is None

    def test_미매핑_시도(self):
        assert resolve_sigungu_code("미지의시도", "강남구") is None

    def test_gu_없음(self):
        assert resolve_sigungu_code("서울", None) is None

    def test_제주시(self):
        assert resolve_sigungu_code("제주", "제주시") == "50110"

    def test_세종시(self):
        assert resolve_sigungu_code("세종", "세종시") == "36110"
