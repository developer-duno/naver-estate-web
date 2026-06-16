"""V-WORLD 부동산중개업사무소 조회 클라이언트 단위 테스트 (세션 308 PR B)
실행: python -m pytest tests/test_vworld_client.py -v
"""

from unittest.mock import MagicMock, patch

from crawler.vworld_client import (
    _normalize_office_name,
    _office_name_matches,
    search_broker_office,
)


def _env(key="vw-key", domain="www.2u.pe.kr"):
    """os.getenv 사이드이펙트 — VWORLD_API_KEY, VWORLD_DOMAIN 순서로 반환"""
    def fake(name, *a):
        return {"VWORLD_API_KEY": key, "VWORLD_DOMAIN": domain}.get(name)
    return fake


def _resp(payload):
    m = MagicMock()
    m.status_code = 200
    m.json.return_value = payload
    return m


# ── 정규화 ──


def test_normalize_office_name():
    assert _normalize_office_name("행복공인중개사 (본점)") == "행복공인중개사본점"
    assert _normalize_office_name("ABC 공인·중개") == "abc공인중개"
    assert _normalize_office_name(None) == ""


# ── 상호 매칭 헬퍼 (접두 양방향) ──


def test_office_name_matches_exact():
    """완전 일치 → 매칭"""
    assert _office_name_matches("길동부동산", "길동부동산") is True


def test_office_name_matches_suffix_samuso():
    """등록부 '사무소' 접미사 차이 흡수 (입력 접두) — 2026-06-16 라이브 실측 케이스"""
    assert _office_name_matches("늘세움공인중개사사무소", "늘세움공인중개사") is True


def test_office_name_matches_either_direction():
    """접두 양방향 — 등록이 더 짧아도 매칭"""
    assert _office_name_matches("행복공인중개사", "행복공인중개사사무소") is True


def test_office_name_matches_no_common_prefix():
    """접두 공유 없음 → 미매칭"""
    assert _office_name_matches("행복공인중개사", "행운공인중개사") is False


def test_office_name_matches_short_input_guard():
    """정규화 1글자 접두는 매칭 안 함 (오매칭 방어)"""
    assert _office_name_matches("행복공인중개사", "행") is False


def test_office_name_matches_empty():
    """빈/None → 미매칭"""
    assert _office_name_matches("길동부동산", "") is False
    assert _office_name_matches(None, "길동부동산") is False


# ── 키-가드 ──


def test_no_api_key_returns_none():
    """VWORLD_API_KEY 미설정 → None (호출실패)"""
    with patch("crawler.vworld_client.os.getenv", side_effect=_env(key=None)):
        assert search_broker_office("길동부동산") is None


def test_no_domain_returns_none():
    """VWORLD_DOMAIN 미설정 → None"""
    with patch("crawler.vworld_client.os.getenv", side_effect=_env(domain=None)):
        assert search_broker_office("길동부동산") is None


def test_empty_office_name_no_match():
    """상호 빈값 → 미매칭 (호출 안 하고 matched False)"""
    with patch("crawler.vworld_client.os.getenv", side_effect=_env()):
        r = search_broker_office("")
    assert r is not None and r["matched"] is False


# ── 매칭 ──


def test_match_active():
    """상호 일치 + 영업중 → matched, active"""
    payload = {"EDOffices": {"field": [{
        "jurirno": "나92200000-51", "bsnmCmpnm": "길동부동산", "brkrNm": "홍길동",
        "sttusSeCode": "1", "sttusSeCodeNm": "영업중",
    }]}}
    with (
        patch("crawler.vworld_client.os.getenv", side_effect=_env()),
        patch("crawler.vworld_client.std_requests.get", return_value=_resp(payload)),
    ):
        r = search_broker_office("길동부동산", "홍길동")
    assert r["matched"] is True
    assert r["active"] is True
    assert r["jurirno"] == "나92200000-51"
    assert r["status_name"] == "영업중"


def test_match_with_spacing_difference():
    """상호 띄어쓰기·괄호 차이 흡수 (정규화 매칭)"""
    payload = {"EDOffices": {"field": [{
        "bsnmCmpnm": "길동 부동산 (본점)", "sttusSeCode": "1", "sttusSeCodeNm": "영업중",
    }]}}
    with (
        patch("crawler.vworld_client.os.getenv", side_effect=_env()),
        patch("crawler.vworld_client.std_requests.get", return_value=_resp(payload)),
    ):
        r = search_broker_office("길동부동산본점")
    assert r["matched"] is True


def test_match_suffix_samuso_with_rep():
    """입력 '늘세움공인중개사' → 등록 '늘세움공인중개사사무소' + 대표 일치 → 매칭·영업중.

    2026-06-16 라이브 실측 결함 회귀 가드: '사무소' 접미사 차이로 진짜 중개사가
    미매칭되던 것을 접두 매칭으로 해소. brkrNm 정확일치가 2차 키.
    """
    payload = {"EDOffices": {"field": [{
        "bsnmCmpnm": "늘세움공인중개사사무소", "brkrNm": "김상원",
        "sttusSeCode": "1", "sttusSeCodeNm": "영업중", "jurirno": "30200-2024-00023",
    }]}}
    with (
        patch("crawler.vworld_client.os.getenv", side_effect=_env()),
        patch("crawler.vworld_client.std_requests.get", return_value=_resp(payload)),
    ):
        r = search_broker_office("늘세움공인중개사", "김상원")
    assert r["matched"] is True
    assert r["active"] is True
    assert r["jurirno"] == "30200-2024-00023"


def test_prefix_match_but_rep_mismatch_no_match():
    """상호 접두는 같으나 대표자명 불일치 → 미매칭 (접두 완화의 오매칭 방어 핵심)"""
    payload = {"EDOffices": {"field": [{
        "bsnmCmpnm": "늘세움공인중개사사무소", "brkrNm": "다른사람",
        "sttusSeCode": "1", "sttusSeCodeNm": "영업중",
    }]}}
    with (
        patch("crawler.vworld_client.os.getenv", side_effect=_env()),
        patch("crawler.vworld_client.std_requests.get", return_value=_resp(payload)),
    ):
        r = search_broker_office("늘세움공인중개사", "김상원")
    assert r["matched"] is False


def test_match_but_closed():
    """상호 일치하나 폐업(5) → matched True, active False"""
    payload = {"EDOffices": {"field": [{
        "bsnmCmpnm": "길동부동산", "sttusSeCode": "5", "sttusSeCodeNm": "폐업",
    }]}}
    with (
        patch("crawler.vworld_client.os.getenv", side_effect=_env()),
        patch("crawler.vworld_client.std_requests.get", return_value=_resp(payload)),
    ):
        r = search_broker_office("길동부동산")
    assert r["matched"] is True
    assert r["active"] is False
    assert r["status_name"] == "폐업"


def test_active_preferred_over_closed():
    """동일 상호 여러 건 — 영업중 우선 채택"""
    payload = {"EDOffices": {"field": [
        {"bsnmCmpnm": "길동부동산", "sttusSeCode": "5", "sttusSeCodeNm": "폐업"},
        {"bsnmCmpnm": "길동부동산", "sttusSeCode": "1", "sttusSeCodeNm": "영업중", "jurirno": "X"},
    ]}}
    with (
        patch("crawler.vworld_client.os.getenv", side_effect=_env()),
        patch("crawler.vworld_client.std_requests.get", return_value=_resp(payload)),
    ):
        r = search_broker_office("길동부동산")
    assert r["active"] is True
    assert r["jurirno"] == "X"


# ── 미매칭 ──


def test_no_match_empty_edoffices():
    """가짜 상호 → EDOffices 빈 dict → 미매칭"""
    with (
        patch("crawler.vworld_client.os.getenv", side_effect=_env()),
        patch("crawler.vworld_client.std_requests.get", return_value=_resp({"EDOffices": {}})),
    ):
        r = search_broker_office("없는식당1234")
    assert r["matched"] is False


def test_name_mismatch_no_match():
    """상호는 같지만 중개업자명 불일치 → 미매칭"""
    payload = {"EDOffices": {"field": [{
        "bsnmCmpnm": "길동부동산", "brkrNm": "다른사람", "sttusSeCode": "1", "sttusSeCodeNm": "영업중",
    }]}}
    with (
        patch("crawler.vworld_client.os.getenv", side_effect=_env()),
        patch("crawler.vworld_client.std_requests.get", return_value=_resp(payload)),
    ):
        r = search_broker_office("길동부동산", "홍길동")
    assert r["matched"] is False


def test_single_field_as_dict():
    """field 가 단일 dict(list 아님)여도 처리"""
    payload = {"EDOffices": {"field": {
        "bsnmCmpnm": "길동부동산", "sttusSeCode": "1", "sttusSeCodeNm": "영업중",
    }}}
    with (
        patch("crawler.vworld_client.os.getenv", side_effect=_env()),
        patch("crawler.vworld_client.std_requests.get", return_value=_resp(payload)),
    ):
        r = search_broker_office("길동부동산")
    assert r["matched"] is True


# ── 호출 실패 ──


def test_incorrect_key_returns_none():
    """resultCode INCORRECT_KEY + field 없음 → None (호출실패)"""
    payload = {"EDOffices": {"resultCode": "INCORRECT_KEY", "resultMsg": "..."}}
    with (
        patch("crawler.vworld_client.os.getenv", side_effect=_env()),
        patch("crawler.vworld_client.std_requests.get", return_value=_resp(payload)),
    ):
        r = search_broker_office("길동부동산")
    assert r is None


def test_http_error_returns_none():
    """HTTP 500 → None"""
    m = MagicMock()
    m.status_code = 500
    with (
        patch("crawler.vworld_client.os.getenv", side_effect=_env()),
        patch("crawler.vworld_client.std_requests.get", return_value=m),
    ):
        r = search_broker_office("길동부동산")
    assert r is None


def test_timeout_returns_none():
    """타임아웃 → None"""
    import requests as std_requests
    with (
        patch("crawler.vworld_client.os.getenv", side_effect=_env()),
        patch("crawler.vworld_client.std_requests.get", side_effect=std_requests.Timeout()),
    ):
        r = search_broker_office("길동부동산")
    assert r is None
