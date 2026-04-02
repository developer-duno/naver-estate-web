"""어린이집 API 승인 상태 확인 스크립트

사용법: cd backend && python -m scripts.test_childcare_api
"""

import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

if __name__ == "__main__":
    api_key = os.getenv("PUBLIC_DATA_API_KEY", "")
    if not api_key:
        print("ERROR: PUBLIC_DATA_API_KEY 환경변수가 설정되지 않았습니다")
        sys.exit(1)

    print("=== 어린이집 API 승인 테스트 ===")
    print(f"  서비스키: {api_key[:8]}...{api_key[-4:]}")

    from crawler.childcare_api import ChildcareAPI

    # 서울 강남구 (행정코드 11680) 테스트
    print("\n[1] 서울 강남구 (sigungu_code=11680)...")
    result = ChildcareAPI.get_childcare_list("11680")
    if result:
        print(f"  SUCCESS: {len(result)}개 어린이집 조회됨")
        if result:
            sample = result[0]
            print(f"  예시: {sample.get('name', '?')} (정원: {sample.get('capacity', '?')}명)")
    elif result is not None:
        print("  WARNING: 빈 결과 반환 (시군구코드 확인 필요)")
    else:
        print("  FAIL: API 응답 없음")
        print("  → data.go.kr 마이페이지에서 B553260/CpmsService 승인 상태 확인 필요")
        print("  → https://www.data.go.kr/iim/api/selectAPIAc498View.do")

    # 부산 해운대구 (행정코드 26350) 테스트
    print("\n[2] 부산 해운대구 (sigungu_code=26350)...")
    result2 = ChildcareAPI.get_childcare_list("26350")
    if result2:
        print(f"  SUCCESS: {len(result2)}개 어린이집 조회됨")
    else:
        print("  FAIL: API 응답 없음")

    print("\n=== 테스트 완료 ===")
