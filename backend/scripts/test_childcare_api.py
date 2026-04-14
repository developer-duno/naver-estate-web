"""어린이집 API 라이브 승인 테스트 스크립트

사용법: cd backend && python -m scripts.test_childcare_api

cpmsapi030에 arcode만 보내 시군구 전체 어린이집 목록+좌표+상세를 받아오는
패턴을 검증한다. CHILDCARE_DETAIL_API_KEY 환경변수가 필요.
"""

import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

if __name__ == "__main__":
    api_key = os.getenv("CHILDCARE_DETAIL_API_KEY") or os.getenv("CHILDCARE_API_KEY", "")
    if not api_key:
        print("ERROR: CHILDCARE_DETAIL_API_KEY 환경변수가 설정되지 않았습니다")
        print("  -> info.childcare.go.kr에서 cpmsapi030 활용신청 후 발급받은 키를 backend/.env에 추가")
        sys.exit(1)

    print("=== childcare cpmsapi030 live test ===")
    print(f"  key: {api_key[:8]}...{api_key[-4:]}")

    from crawler.childcare_api import ChildcareAPI

    print("\n[1] Seoul Gangnam-gu (arcode=11680)...")
    result = ChildcareAPI.get_childcare_list("11680")
    if result:
        print(f"  SUCCESS: {len(result)} facilities")
        sample = result[0]
        print(f"  sample name: {sample.get('name', '?')}")
        print(f"  sample coord: ({sample.get('lat')}, {sample.get('lng')})")
        print(f"  capacity={sample.get('capacity')} current={sample.get('current')} "
              f"teachers={sample.get('teachers')} type={sample.get('type_name')}")
    else:
        print("  FAIL: empty response (check key/approval)")
        sys.exit(1)

    print("\n[2] Busan Haeundae-gu (arcode=26350)...")
    result2 = ChildcareAPI.get_childcare_list("26350")
    print(f"  -> {len(result2)} facilities")

    print("\n=== done ===")
