"""응급의료 수집 — 병상·등급 필드 정정 회귀 가드 (세션 417)

옛 코드는 목록 op(getEgytListInfoInqire) 응답에 **없는** `hvec`·`dutyLevel` 을 읽어
운영 DB 2,938행 전부 emergency_beds=0 · emergency_level="" 로 저장했다(화면 "병상 수" 전부 "-").
실응답(2026-09-24)으로 확인한 사실:
- 목록 op 항목 = dutyAddr·dutyEmcls·dutyEmclsName·dutyName·dutyTel1·dutyTel3·hpid·phpid·rnum·wgs84Lat·wgs84Lon
- 병상은 실시간 op(getEmrrmRltmUsefulSckbdInfoInqire)의 `hvs01`(응급실 일반병상 기준값)
- 실시간 op 에 없는 기관(528 중 112곳)은 병상을 모른다 → None

아래 fixture 는 실응답 원문에서 모양을 그대로 옮겼다(값 일부만 줄임). 실제 API 호출 0.
"""

from unittest.mock import patch

from crawler.emergency_api import (
    EMERGENCY_BEDS_URL,
    EMERGENCY_LIST_URL,
    EmergencyAPI,
    _parse_bed_items,
)


def _list_item(hpid: str, name: str, emcls_name: str | None = "지역응급의료기관") -> dict:
    """목록 op 항목 1건 — 실응답 키 11개 그대로 (hvec·dutyLevel 은 원래 없다)"""
    item = {
        "dutyAddr": "부산광역시 기장군 기장읍 대청로72번길 6",
        "dutyEmcls": "G007",
        "dutyEmclsName": emcls_name,
        "dutyName": name,
        "dutyTel1": "051-723-0171",
        "dutyTel3": "051-723-2119",
        "hpid": hpid,
        "phpid": hpid,
        "rnum": 1,
        "wgs84Lat": 35.23602946449906,
        "wgs84Lon": 129.21649161387128,
    }
    if emcls_name is None:
        del item["dutyEmclsName"]
    return item


def _wrap(items: list[dict], total: int | None = None) -> dict:
    """data.go.kr 공통 응답 봉투"""
    return {
        "response": {
            "header": {"resultCode": "00", "resultMsg": "NORMAL SERVICE."},
            "body": {
                "items": {"item": items},
                "numOfRows": 100,
                "pageNo": 1,
                "totalCount": len(items) if total is None else total,
            },
        }
    }


def _bed_item(hpid: str, hvs01, hvec=-1) -> dict:
    """실시간 op 항목 — 병상 판정에 쓰는 키만 (실응답엔 80여 개 키가 더 있다)"""
    return {"dutyName": "x", "hpid": hpid, "hvec": hvec, "hvs01": hvs01, "hvidate": 20260924201914}


def _fake_call_api(list_resp: dict, bed_resp: dict | None):
    def _call(url, params):
        if url == EMERGENCY_LIST_URL:
            return list_resp
        if url == EMERGENCY_BEDS_URL:
            return bed_resp
        raise AssertionError(f"예상 밖 URL: {url}")
    return _call


class TestEmergencyListFields:
    def test_병상은_실시간_op_hvs01_등급은_dutyEmclsName(self):
        """정상: 실시간 op 에 있는 기관은 hvs01 을 병상으로, 목록의 dutyEmclsName 을 등급으로.

        hvec(지금 남은 병상, -1)는 쓰지 않는다 — hvs01(21)이 들어가야 한다.
        """
        list_resp = _wrap([_list_item("A1700004", "울산대학교병원", "권역응급의료센터")])
        bed_resp = _wrap([_bed_item("A1700004", 21, hvec=-1)])
        with patch.object(EmergencyAPI, "call_api", side_effect=_fake_call_api(list_resp, bed_resp)):
            got = EmergencyAPI.get_emergency_list()
        assert len(got) == 1
        assert got[0]["beds"] == 21
        assert got[0]["level"] == "권역응급의료센터"

    def test_실시간_op_에_없는_기관은_병상_None_0이_아니다(self):
        """경계: 병상을 모르는 기관은 None — 옛 코드처럼 0 을 넣으면 '0병상'으로 거짓 표시된다.

        등급 필드가 빠진 항목도 빈 문자열이 아니라 None.
        """
        list_resp = _wrap([_list_item("A9999999", "없는병원", emcls_name=None)])
        bed_resp = _wrap([_bed_item("A1700004", 21)])
        with patch.object(EmergencyAPI, "call_api", side_effect=_fake_call_api(list_resp, bed_resp)):
            got = EmergencyAPI.get_emergency_list()
        assert got[0]["beds"] is None
        assert got[0]["level"] is None

    def test_병상_op_실패해도_목록은_수집되고_병상만_None(self):
        """오류: 병상 op 가 None(실패)이어도 목록 수집은 계속된다 — 병상은 부가 정보."""
        list_resp = _wrap([_list_item("A1700004", "울산대학교병원")])
        with patch.object(EmergencyAPI, "call_api", side_effect=_fake_call_api(list_resp, None)):
            got = EmergencyAPI.get_emergency_list()
        assert len(got) == 1
        assert got[0]["beds"] is None
        assert got[0]["level"] == "지역응급의료기관"


class TestBedTotalCountGuard:
    """실시간 병상 op 응답이 numOfRows(1000)를 넘으면 뒷 페이지 누락을 경고 (검사관-573 LOW)"""

    def test_totalCount_이_numOfRows_초과면_경고_로그(self, caplog):
        """totalCount=1200 > numOfRows=1000 이면 경고 1건, 맵은 정상 반환."""
        bed_resp = _wrap([_bed_item("A1700004", 21)], total=1200)
        with patch.object(EmergencyAPI, "call_api", return_value=bed_resp):
            with caplog.at_level("WARNING"):
                got = EmergencyAPI.get_er_bed_map()
        assert got == {"A1700004": 21}
        warnings = [r for r in caplog.records if "한 페이지를 넘음" in r.message]
        assert len(warnings) == 1

    def test_totalCount_이_numOfRows_이하면_경고_없음(self, caplog):
        """totalCount=416 (실측값) <= numOfRows=1000 이면 경고 0건."""
        bed_resp = _wrap([_bed_item("A1700004", 21)], total=416)
        with patch.object(EmergencyAPI, "call_api", return_value=bed_resp):
            with caplog.at_level("WARNING"):
                got = EmergencyAPI.get_er_bed_map()
        assert got == {"A1700004": 21}
        warnings = [r for r in caplog.records if "한 페이지를 넘음" in r.message]
        assert len(warnings) == 0


class TestParseBedItems:
    def test_0은_0으로_보존_None_음수_문자는_None(self):
        """0 병상은 '0'(확정값)으로 남고, 없음·음수·숫자 아님은 None(모름)."""
        got = _parse_bed_items([
            _bed_item("A", 0),
            _bed_item("B", None),
            _bed_item("C", -3),
            _bed_item("D", "abc"),
            _bed_item("E", "17"),
            {"hvs01": 5},  # hpid 없음 → 버림
        ])
        assert got == {"A": 0, "B": None, "C": None, "D": None, "E": 17}


class TestFindNearestNone:
    def test_반경_내_기관_없으면_병상_등급_None(self):
        got = EmergencyAPI.find_nearest(37.0, 127.0, [], radius_m=1000)
        assert got["count"] == 0
        assert got["nearest_beds"] is None
        assert got["nearest_level"] is None

    def test_최근접_기관의_0병상은_0_그대로(self):
        fac = [{"name": "A", "lat": 37.0, "lng": 127.0, "beds": 0, "level": "지역응급의료기관", "addr": ""}]
        got = EmergencyAPI.find_nearest(37.0, 127.0, fac, radius_m=1000)
        assert got["nearest_beds"] == 0
