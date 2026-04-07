"""국세청 사업자등록 진위확인 API

POST https://api.odcloud.kr/api/nts-businessman/v1/validate
- data.go.kr 통합키(PUBLIC_DATA_API_KEY) 사용
- 사업자번호 + 대표자명 → 진위 여부 반환
"""

import logging
import os

import requests as std_requests

logger = logging.getLogger(__name__)

VALIDATE_URL = "https://api.odcloud.kr/api/nts-businessman/v1/validate"
REQUEST_TIMEOUT = 10


def verify_business_registration(
    business_number: str,
    representative_name: str,
    start_date: str = "",
) -> dict:
    """사업자등록 진위확인 — 국세청 odcloud API

    Args:
        business_number: 사업자등록번호 (10자리, 하이픈 제거)
        representative_name: 대표자명
        start_date: 개업일 YYYYMMDD (선택)

    Returns:
        {"valid": True/False, "message": "..."}
        API 실패 시 {"valid": None, "message": "API 호출 실패"}
    """
    service_key = os.getenv("PUBLIC_DATA_API_KEY")
    if not service_key:
        logger.warning("[business_api] PUBLIC_DATA_API_KEY 미설정")
        return {"valid": None, "message": "API 키 미설정"}

    # 하이픈 제거
    b_no = business_number.replace("-", "").strip()
    if len(b_no) != 10 or not b_no.isdigit():
        return {"valid": False, "message": "사업자번호는 10자리 숫자여야 합니다"}

    payload = {
        "businesses": [
            {
                "b_no": b_no,
                "p_nm": representative_name.strip(),
                "start_dt": start_date,
            }
        ]
    }

    try:
        resp = std_requests.post(
            VALIDATE_URL,
            json=payload,
            params={"serviceKey": service_key},
            headers={"Content-Type": "application/json"},
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            logger.warning("[business_api] HTTP %d", resp.status_code)
            return {"valid": None, "message": f"API 응답 오류 ({resp.status_code})"}

        data = resp.json()
        items = data.get("data", [])
        if not items:
            return {"valid": None, "message": "API 응답 데이터 없음"}

        result = items[0]
        valid_code = result.get("valid", "")
        # "01" = 유효, "02" = 유효하지 않음
        if valid_code == "01":
            return {"valid": True, "message": "사업자등록 확인됨"}
        return {"valid": False, "message": result.get("valid_msg", "유효하지 않은 사업자번호")}

    except std_requests.Timeout:
        logger.warning("[business_api] 타임아웃")
        return {"valid": None, "message": "API 응답 시간 초과"}
    except Exception as e:
        logger.warning("[business_api] 요청 실패: %s", type(e).__name__)
        return {"valid": None, "message": "API 호출 실패"}
