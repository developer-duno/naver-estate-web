"""어린이집 API 승인 상태 확인 스크립트

사용법: cd backend && python -m scripts.test_childcare_api

보육정보공개포털(api.childcare.go.kr) cpmsapi021 API를 테스트한다.
CHILDCARE_API_KEY 환경변수가 설정되어 있어야 한다.
"""

import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

if __name__ == "__main__":
    api_key = os.getenv("CHILDCARE_API_KEY", "")
    if not api_key:
        print("ERROR: CHILDCARE_API_KEY 환경변수가 설정되지 않았습니다")
        print("  → info.childcare.go.kr에서 활용신청 후 발급받은 인증키를 설정하세요")
        print("  → backend/.env에 CHILDCARE_API_KEY=발급받은키 추가")
        sys.exit(1)

    print("=== 어린이집 API 승인 테스트 (api.childcare.go.kr) ===")
    print(f"  인증키: {api_key[:8]}...{api_key[-4:]}")

    from crawler.childcare_api import ChildcareAPI

    # 서울 강남구 (행정코드 11680) 테스트
    print("\n[1] 서울 강남구 (arcode=11680)...")
    result = ChildcareAPI.get_childcare_list("11680")
    if result:
        print(f"  SUCCESS: {len(result)}개 어린이집 조회됨")
        sample = result[0]
        print(f"  예시: {sample.get('name', '?')} (정원: {sample.get('capacity', '?')}명)")
    elif result is not None:
        print("  WARNING: 빈 결과 반환 (시군구코드 확인 필요)")
    else:
        print("  FAIL: API 응답 없음")
        print("  → info.childcare.go.kr에서 cpmsapi021 활용신청 승인 상태 확인 필요")

    # 부산 해운대구 (행정코드 26350) 테스트
    print("\n[2] 부산 해운대구 (arcode=26350)...")
    result2 = ChildcareAPI.get_childcare_list("26350")
    if result2:
        print(f"  SUCCESS: {len(result2)}개 어린이집 조회됨")
    else:
        print("  FAIL: API 응답 없음")

    print("\n=== 테스트 완료 ===")
