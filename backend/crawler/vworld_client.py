"""V-WORLD 부동산중개업사무소정보 조회 API 클라이언트 (공인중개사 검증 대조용)

국세청 진위확인(사업자등록)만으로는 식당·카페 사업자도 자동승인되는 구멍을 막기 위해,
가입 시 V-WORLD getEBOfficeInfo 로 "진짜 공인중개사무소인가" 를 실시간 대조한다.

- 요청주소: https://api.vworld.kr/ned/data/getEBOfficeInfo (국토부 부동산중개업사무소정보)
- 인증: VWORLD_API_KEY + VWORLD_DOMAIN(발급 시 등록 도메인). 서버사이드는 domain 파라미터 필수
  (없으면 INCORRECT_KEY. 2026-06-15 라이브 실측 확정).
- 응답 필드(JSON): jurirno(등록번호) · bsnmCmpnm(상호) · brkrNm(중개업자명) ·
  sttusSeCode/sttusSeCodeNm(상태 1영업중~8업무정지) · ldCode/ldCodeNm · registDe · 주소.
  마스킹 없음(실측).
"""

import logging
import os
import re

import requests as std_requests

logger = logging.getLogger(__name__)

GET_EB_OFFICE_URL = "https://api.vworld.kr/ned/data/getEBOfficeInfo"
REQUEST_TIMEOUT = 10

# sttusSeCode "1" = 영업중. 자동승인은 영업중일 때만 (휴업·폐업·취소 등은 수동심사로).
ACTIVE_STATUS_CODE = "1"


def _normalize_office_name(name: str | None) -> str:
    """상호 정규화 — 괄호·공백·하이픈·점 제거 + 소문자 (비교용).

    "○○공인중개사 (본점)" → "○○공인중개사본점". 띄어쓰기·표기 차이 흡수.
    """
    if not name:
        return ""
    s = re.sub(r"[(\[（]", "", name)
    s = re.sub(r"[)\]）]", "", s)
    s = re.sub(r"[\s\-·.]", "", s)
    return s.lower()


def search_broker_office(
    office_name: str,
    representative_name: str = "",
    ld_code: str = "",
) -> dict | None:
    """V-WORLD 부동산중개업사무소 조회 — 상호(+중개업자명)로 "진짜 중개사무소" 대조.

    Args:
        office_name: 중개사무소 상호 (필수 — 대조 키)
        representative_name: 중개업자명/대표자명 (보조 정확도)
        ld_code: 시군구코드 2~5자리 (선택 — 후보 축소)

    Returns:
        매칭됨:   {"matched": True,  "status_code": "1", "status_name": "영업중",
                   "jurirno": "나92...", "office_name": "...", "active": True}
        미매칭:   {"matched": False, "status_code": None, "status_name": None,
                   "jurirno": None, "office_name": None, "active": False}
        호출실패: None  (키 미설정·타임아웃·HTTP에러 — 게이트는 pending 처리)

    상호 정규화 후 응답 목록과 대조. 중개업자명이 주어지면 추가 일치 확인.
    """
    api_key = os.getenv("VWORLD_API_KEY")
    domain = os.getenv("VWORLD_DOMAIN")
    if not api_key or not domain:
        logger.warning("[vworld] VWORLD_API_KEY/VWORLD_DOMAIN 미설정 — 중개사 대조 건너뜀")
        return None

    if not office_name or not office_name.strip():
        # 상호 없으면 대조 불가 — 호출실패와 구분해 미매칭으로 (게이트가 pending)
        return {"matched": False, "status_code": None, "status_name": None,
                "jurirno": None, "office_name": None, "active": False}

    params = {
        "key": api_key,
        "domain": domain,
        "bsnmCmpnm": office_name.strip(),
        "format": "json",
        "numOfRows": "30",
        "pageNo": "1",
    }
    if representative_name.strip():
        params["brkrNm"] = representative_name.strip()
    if ld_code.strip():
        params["ldCode"] = ld_code.strip()

    try:
        resp = std_requests.get(GET_EB_OFFICE_URL, params=params, timeout=REQUEST_TIMEOUT)
        if resp.status_code != 200:
            logger.warning("[vworld] HTTP %d", resp.status_code)
            return None
        data = resp.json()
    except std_requests.Timeout:
        logger.warning("[vworld] 타임아웃")
        return None
    except Exception as e:
        logger.warning("[vworld] 요청 실패: %s", type(e).__name__)
        return None

    ed = data.get("EDOffices") or {}
    # 인증 실패 등 에러 응답 (resultCode INCORRECT_KEY 등) → 호출실패로 처리
    if ed.get("resultCode") and ed.get("resultCode") not in ("NORMAL_SERVICE",):
        # field 가 있으면 정상, 없고 에러코드만 있으면 실패
        if not ed.get("field"):
            logger.warning("[vworld] resultCode=%s", ed.get("resultCode"))
            return None

    fields = ed.get("field") or []
    if isinstance(fields, dict):
        fields = [fields]

    target_office = _normalize_office_name(office_name)
    target_rep = (representative_name or "").strip()

    best = None  # 영업중 우선 매칭 보관
    for f in fields:
        if _normalize_office_name(f.get("bsnmCmpnm")) != target_office:
            continue
        # 중개업자명이 주어졌으면 일치 확인 (불일치 행은 스킵)
        if target_rep and (f.get("brkrNm") or "").strip() != target_rep:
            continue
        status_code = f.get("sttusSeCode")
        match_info = {
            "matched": True,
            "status_code": status_code,
            "status_name": f.get("sttusSeCodeNm"),
            "jurirno": f.get("jurirno"),
            "office_name": f.get("bsnmCmpnm"),
            "active": status_code == ACTIVE_STATUS_CODE,
        }
        if match_info["active"]:
            return match_info  # 영업중 매칭 = 즉시 채택
        best = best or match_info  # 비영업 매칭은 보관 (영업중 없으면 사용)

    if best:
        return best

    return {"matched": False, "status_code": None, "status_name": None,
            "jurirno": None, "office_name": None, "active": False}
