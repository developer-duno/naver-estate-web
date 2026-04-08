"""한국산업인력공단 자격증 진위확인 API

HRDKOREA_ENABLED=true + HRDKOREA_API_KEY 설정 시 활성화.
- 공인중개사 자격증번호 + 성명 → 진위 여부 반환
- API 키 미확보 상태에서는 HRDKOREA_ENABLED=false 유지
"""

import logging
import os

import requests as std_requests

logger = logging.getLogger(__name__)

# data.go.kr 또는 q-net.or.kr 엔드포인트 (키 신청 후 확정)
VERIFY_URL = "https://api.odcloud.kr/api/15000806/v1/uddi:9367f27a-f601-4e50-a2cf-699e8a72528e"
REQUEST_TIMEOUT = 10


def verify_license(
    license_number: str,
    name: str,
) -> dict:
    """자격증 진위확인 — 한국산업인력공단 API

    Args:
        license_number: 공인중개사 자격증번호
        name: 성명

    Returns:
        {"valid": True/False, "message": "..."}
        비활성화/실패 시 {"valid": None, "message": "..."}
    """
    enabled = os.getenv("HRDKOREA_ENABLED", "false").lower() == "true"
    if not enabled:
        return {"valid": None, "message": "자격증 검증 서비스 미활성화"}

    service_key = os.getenv("HRDKOREA_API_KEY")
    if not service_key:
        logger.warning("[license_api] HRDKOREA_API_KEY 미설정")
        return {"valid": None, "message": "API 키 미설정"}

    if not license_number or not license_number.strip():
        return {"valid": False, "message": "자격증번호를 입력해주세요"}

    params = {
        "serviceKey": service_key,
        "page": "1",
        "perPage": "1",
        "cond[QUAL_NUM::EQ]": license_number.strip(),
        "cond[NM::EQ]": name.strip(),
    }

    try:
        resp = std_requests.get(
            VERIFY_URL,
            params=params,
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            logger.warning("[license_api] HTTP %d", resp.status_code)
            return {"valid": None, "message": f"API 응답 오류 ({resp.status_code})"}

        data = resp.json()
        items = data.get("data", [])
        if not items:
            return {"valid": False, "message": "일치하는 자격증 정보 없음"}

        # 일치하는 레코드 존재 → 유효
        return {"valid": True, "message": "자격증 확인됨"}

    except std_requests.Timeout:
        logger.warning("[license_api] 타임아웃")
        return {"valid": None, "message": "API 응답 시간 초과"}
    except Exception as e:
        logger.warning("[license_api] 요청 실패: %s", type(e).__name__)
        return {"valid": None, "message": "API 호출 실패"}
