"""어린이집 API 단위 테스트 — cpmsapi030 파싱 + errcode + find_nearest + 행정코드 매핑"""

from unittest.mock import patch

import pytest

from crawler.childcare_api import (
    CHILDCARE_LIST_URL,
    ChildcareAPI,
    ChildcareAPIError,
    _extract_errcode,
    resolve_sigungu_code,
)


def _xml_response(items_xml: str) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f"<response>{items_xml}</response>"
    )


class TestGetChildcareList:
    """cpmsapi030 응답 파싱 테스트 (arcode만 보내는 목록 모드)"""

    def test_정상_응답_파싱(self):
        """030 응답에서 좌표/상세 필드가 올바르게 추출되는지"""
        xml = _xml_response(
            "<item>"
            "<crname>행복어린이집</crname><la>37.5</la><lo>127.0</lo>"
            "<crcapat>50</crcapat><crchcnt>45</crchcnt>"
            "<crtypename>민간</crtypename>"
            "<crstatusname>정상</crstatusname>"
            "<em_cnt_a2>5</em_cnt_a2>"
            "</item>"
            "<item>"
            "<crname>사랑어린이집</crname><la>37.6</la><lo>127.1</lo>"
            "<crcapat>80</crcapat><crchcnt>75</crchcnt>"
            "<crtypename>국공립</crtypename>"
            "<crstatusname>정상</crstatusname>"
            "<EM_CNT_A2>8</EM_CNT_A2>"
            "</item>"
        )
        with patch.object(
            ChildcareAPI, "_call_api", return_value=ChildcareAPI._parse_xml(xml)
        ) as mock_call:
            result = ChildcareAPI.get_childcare_list("11680")

        assert len(result) == 2
        assert result[0]["name"] == "행복어린이집"
        assert result[0]["lat"] == 37.5
        assert result[0]["lng"] == 127.0
        assert result[0]["capacity"] == 50
        assert result[0]["current"] == 45
        assert result[0]["teachers"] == 5
        assert result[1]["type_name"] == "국공립"
        assert result[1]["teachers"] == 8  # 대문자 EM_CNT_A2 폴백

        # 핵심: params는 arcode만, stcode 키 없음 (세션 40 수정 검증)
        call_params = mock_call.call_args[0][0]
        assert call_params == {"arcode": "11680"}
        assert "stcode" not in call_params

    def test_빈_응답_처리(self):
        with patch.object(ChildcareAPI, "_call_api", return_value=[]):
            result = ChildcareAPI.get_childcare_list("99999")
        assert result == []

    def test_좌표_없는_항목_제외(self):
        """la/lo가 없는 어린이집은 결과에서 제외"""
        xml = _xml_response(
            "<item><crname>좌표있음</crname><la>37.5</la><lo>127.0</lo><crcapat>50</crcapat></item>"
            "<item><crname>좌표없음</crname><la></la><lo></lo><crcapat>30</crcapat></item>"
        )
        with patch.object(
            ChildcareAPI, "_call_api", return_value=ChildcareAPI._parse_xml(xml)
        ):
            result = ChildcareAPI.get_childcare_list("11680")
        assert len(result) == 1
        assert result[0]["name"] == "좌표있음"

    def test_폐지_시설_제외(self):
        """crstatusname='폐지'는 결과에서 제외"""
        xml = _xml_response(
            "<item><crname>정상집</crname><la>37.5</la><lo>127.0</lo><crstatusname>정상</crstatusname></item>"
            "<item><crname>폐지집</crname><la>37.6</la><lo>127.1</lo><crstatusname>폐지</crstatusname></item>"
        )
        with patch.object(
            ChildcareAPI, "_call_api", return_value=ChildcareAPI._parse_xml(xml)
        ):
            result = ChildcareAPI.get_childcare_list("11680")
        assert len(result) == 1
        assert result[0]["name"] == "정상집"

    def test_XML_파싱_실패_시_빈_리스트(self):
        assert ChildcareAPI._parse_xml("잘못된 XML") == []


class TestErrcodeHandling:
    """_extract_errcode + _call_api errcode 분기"""

    def test_extract_errcode_INFO_200(self):
        body = "<response><errcode>INFO-200</errcode><errmsg>검색결과 없음</errmsg></response>"
        assert _extract_errcode(body) == "INFO-200"

    def test_extract_errcode_없음(self):
        body = "<response><item><stcode>123</stcode></item></response>"
        assert _extract_errcode(body) is None

    def test_INFO_200_즉시_빈_리스트(self, monkeypatch):
        """INFO-200은 재시도 없이 빈 리스트 — fall-through 버그 수정 검증"""
        import crawler.childcare_api as mod
        monkeypatch.setenv("CHILDCARE_DETAIL_API_KEY", "TEST")

        class FakeResp:
            status_code = 200
            text = "<response><errcode>INFO-200</errcode></response>"

        class FakeSession:
            def get(self, *a, **kw):
                return FakeResp()

        monkeypatch.setattr(ChildcareAPI, "_get_session", classmethod(lambda cls: FakeSession()))
        monkeypatch.setattr(mod, "MIN_REQUEST_INTERVAL", 0)
        result = ChildcareAPI._call_api({"arcode": "11680"})
        assert result == []

    def test_INFO_300_쿼터_초과_예외(self, monkeypatch):
        """INFO-300은 ChildcareAPIError 전파"""
        import crawler.childcare_api as mod
        monkeypatch.setenv("CHILDCARE_DETAIL_API_KEY", "TEST")

        class FakeResp:
            status_code = 200
            text = "<response><errcode>INFO-300</errcode></response>"

        class FakeSession:
            def get(self, *a, **kw):
                return FakeResp()

        monkeypatch.setattr(ChildcareAPI, "_get_session", classmethod(lambda cls: FakeSession()))
        monkeypatch.setattr(mod, "MIN_REQUEST_INTERVAL", 0)
        with pytest.raises(ChildcareAPIError):
            ChildcareAPI._call_api({"arcode": "11680"})

    def test_INFO_100_인증키_무효_예외(self, monkeypatch):
        """INFO-100(유효하지 않은 인증키)도 치명적 에러로 전파"""
        import crawler.childcare_api as mod
        monkeypatch.setenv("CHILDCARE_DETAIL_API_KEY", "TEST")

        class FakeResp:
            status_code = 200
            text = "<response><errcode>INFO-100</errcode></response>"

        class FakeSession:
            def get(self, *a, **kw):
                return FakeResp()

        monkeypatch.setattr(ChildcareAPI, "_get_session", classmethod(lambda cls: FakeSession()))
        monkeypatch.setattr(mod, "MIN_REQUEST_INTERVAL", 0)
        with pytest.raises(ChildcareAPIError):
            ChildcareAPI._call_api({"arcode": "11680"})

    def test_call_api_CHILDCARE_LIST_URL_상수_사용(self):
        """엔드포인트 URL이 cpmsapi030인지 확인"""
        assert "cpmsapi030" in CHILDCARE_LIST_URL


class TestFindNearest:
    """find_nearest 근접 매칭 (세션 39 이전 로직 유지)"""

    def test_반경_내_어린이집_집계(self):
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
        facilities = [{"name": "먼집", "lat": 38.0, "lng": 128.0, "capacity": 30}]
        result = ChildcareAPI.find_nearest(37.5, 127.0, facilities, radius_m=1000)
        assert result["count"] == 0
        assert result["nearest_dist"] is None
        assert result["nearest_name"] == ""

    def test_빈_시설목록(self):
        result = ChildcareAPI.find_nearest(37.5, 127.0, [], radius_m=1000)
        assert result["count"] == 0

    def test_가장_가까운_것_선택(self):
        facilities = [
            {"name": "중간", "lat": 37.503, "lng": 127.003, "capacity": 40},
            {"name": "가장가까운", "lat": 37.5001, "lng": 127.0001, "capacity": 60},
            {"name": "살짝먼", "lat": 37.505, "lng": 127.005, "capacity": 30},
        ]
        result = ChildcareAPI.find_nearest(37.5, 127.0, facilities, radius_m=2000)
        assert result["nearest_name"] == "가장가까운"
        assert result["nearest_capacity"] == 60


class TestResolveSigunguCode:
    """행정표준코드 매핑"""

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

    def test_세종_gu_None(self):
        # 세션 41: 세종은 광역=시군구 1:1, gu 없이도 매핑되어야 함 (40건 구제)
        assert resolve_sigungu_code("세종", None) == "36110"

    def test_세종특별자치시_gu_None(self):
        assert resolve_sigungu_code("세종특별자치시", None) == "36110"

    def test_서울_gu_None_여전히_None(self):
        # region 단독으론 매핑 못하는 광역(서울 25개 구)은 여전히 None
        assert resolve_sigungu_code("서울", None) is None

    # 세션 42: 일반구 → 모시 별칭 폴백 (22건 구제)

    def test_경기_덕양구_고양시_폴백(self):
        # mibunyang 원본이 "경기 고양시 덕양구"를 gu="덕양구"로 저장한 케이스.
        # 폴백 별칭 테이블로 고양시 코드 반환해야 함.
        assert resolve_sigungu_code("경기", "덕양구") == "41280"

    def test_충남_서북구_천안시_폴백(self):
        assert resolve_sigungu_code("충남", "서북구") == "44130"

    def test_경북_북구_포항시_폴백(self):
        # 중복 구명("북구"는 부산/대구/광주/울산에도 있음)이지만
        # region 튜플 키로 경북 북구 → 포항 북구 하나로 고정.
        assert resolve_sigungu_code("경북", "북구") == "47110"

    def test_부산_북구_기존_매핑_유지_regression(self):
        # 광역시 북구 직매핑은 별칭 폴백 이전에 sigungu_codes.json
        # 직매핑에서 히트해야 함 (부산/대구/광주/울산 모두 동일 방어).
        assert resolve_sigungu_code("부산", "북구") == "26320"
        assert resolve_sigungu_code("대구", "북구") == "27230"

    def test_경기_수원시_영통구_기존_복합_gu_유지_regression(self):
        # 기존 split 분기가 별칭 폴백보다 먼저 걸려야 함.
        assert resolve_sigungu_code("경기", "수원시 영통구") == "41110"

    def test_경기_존재안함구_None_유지(self):
        # 폴백 별칭 테이블에도 없는 일반구는 여전히 None.
        assert resolve_sigungu_code("경기", "존재안함구") is None
