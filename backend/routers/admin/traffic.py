"""관리자 트래픽 관측 라우트

무료 공개 전환 대비 — 하루 요청량·고유 방문자·응답시간 분포·에러율을
10분/1시간/24시간 윈도우로 노출. 집서버 1대 + Supabase Small 이 감당 가능한
범위 안에 있는지 사람이 눈으로 보고 판단하기 위한 계측이다.

계측 지점 = auth/rate_limiter.py RateLimitMiddleware (모든 /api/ 요청의 길목).
저장 = 프로세스 in-memory (services/traffic_metrics.py) — 요청마다 DB 를 쓰지 않는다.
"""

import logging

from fastapi import Depends, Query

from deps import get_admin_user
from services.traffic_metrics import get_stats

from ._shared import router

logger = logging.getLogger(__name__)


@router.get("/traffic")
def get_traffic_stats(
    top_paths: int = Query(10, ge=1, le=40, description="경로 그룹 상위 N"),
    top_identities: int = Query(10, ge=1, le=50, description="상위 식별자 N (최근 1시간)"),
    admin: dict = Depends(get_admin_user),
):
    """트래픽 요약 (10분 / 1시간 / 24시간).

    각 윈도우마다:
    - total_requests: 총 요청 수
    - unique_visitors: 고유 식별자 수 (로그인=토큰 해시, 비로그인=IP 해시)
    - p50_ms / p95_ms: 응답시간 분포
    - rate_4xx / rate_5xx: 에러율 (%)
    - top_paths: 경로 그룹별 요청 수 상위 N

    최근 1시간 윈도우에만 top_identities(요청 상위 식별자)가 포함된다 — 비정상
    사용자를 **보이게만** 하는 용도이며 자동 차단은 하지 않는다(오탐 시 정상 사용자
    차단 위험). 식별자는 salt 붙인 해시 앞 12자라 원문 IP·토큰으로 되돌릴 수 없고,
    프로세스가 재시작하면 salt 가 바뀌어 같은 사람도 다른 값이 된다.

    ⚠ 프로세스 in-memory 라 재시작하면 0 부터 다시 센다. process_uptime_seconds 가
    24시간 미만이면 24h 수치는 아직 덜 찬 값이다(naver-calls 와 같은 성질).
    window_truncated 가 true 면 레코드 상한에 걸려 오래된 기록을 버렸다는 뜻으로,
    24h 수치가 실제보다 작다.
    """
    return get_stats(top_paths=top_paths, top_identities=top_identities)
