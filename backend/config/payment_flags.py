"""결제 기능 전역 온·오프 스위치 — 무료 전환 기간의 "뒷문" 차단 (세션 400).

배경: 요금제 화면(FE)을 잠그더라도 결제 API(/api/payment/*)는 URL 을 직접 때리면
그대로 열려 있었다. 코드는 지우지 않고 **진입만 막는다**는 사장님 결정에 따라,
라우터 등록 단계에서 게이트를 걸어 꺼져 있으면 403 을 돌려준다.

기본값이 꺼짐(false)인 이유: 라이브 서버 .env 에 PAYMENT_ENABLED 항목이 없으므로,
배포(재시작) 즉시 잠긴다 — .env 를 손대지 않아도 된다. 매출을 시작할 때는 .env 에
`PAYMENT_ENABLED=true` 한 줄만 추가하고 재시작하면 결제 기능이 그대로 되살아난다
(결제 코드·테이블·PortOne 연동은 전부 보존).

⚠ **요청마다 판정하는 코드는 값을 복사하지 말 것.** 게이트(require_payment_enabled)는
아래처럼 호출 시점에 모듈 속성으로 읽는다 — FastAPI 앱·라우터는 import 시점에 한 번만
구성되므로, 값을 복사해 두면 테스트에서 patch.object(payment_flags, ...) 로 껐다 켤 수 없다.
반대로 **부팅 시 한 번만 읽는 자리**는 값 복사가 정상이다: crawler/scheduler.py 는 다른
토글들과 같은 모듈 상수(PAYMENT_ENABLED)로 받아 create_scheduler() 조건에 쓰며, 테스트는
그쪽 모듈 상수를 patch.object(sched_mod, ...) 로 바꾼다(기존 토글 검증 패턴과 동일).
"""

import os

from fastapi import HTTPException

# 결제 기능 활성 여부. 기본 꺼짐 — 위 docstring 의 "기본값이 꺼짐" 사유 참조.
PAYMENT_ENABLED = os.getenv("PAYMENT_ENABLED", "false").lower() == "true"

# 꺼진 상태에서 결제 API 가 돌려주는 사용자 노출 문구 (FE·라이브 검증이 이 문구로 판정).
PAYMENT_DISABLED_DETAIL = "결제 기능이 비활성화되어 있습니다"


def require_payment_enabled() -> None:
    """결제 라우터 게이트 — 꺼져 있으면 403.

    main.py 의 include_router(dependencies=[Depends(require_payment_enabled)]) 로 걸린다.
    라우터 레벨 dependencies 는 각 엔드포인트의 인증 의존성보다 **먼저** 평가되므로,
    꺼진 상태에서는 비로그인·잘못된 토큰이어도 401 이 아니라 403 이 나온다
    (그 순서를 tests/test_payment_disabled.py 가 단언한다).

    모듈 속성을 그때그때 읽으므로 테스트에서 patch.object 로 켜고 끌 수 있다.
    """
    if not PAYMENT_ENABLED:
        raise HTTPException(status_code=403, detail=PAYMENT_DISABLED_DETAIL)
