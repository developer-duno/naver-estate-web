"""관리자 Naver API 호출 모니터링 라우트

Phase 3 리팩터 선결 조건 — 어느 경로가 네이버 API를 얼마나 부르는지
10분/1시간/24시간 윈도우로 노출. 쿨다운 재발 시 병목 식별용.
"""

import logging

from fastapi import Depends

from deps import get_admin_user
from services.naver_call_counter import get_stats

from ._shared import router

logger = logging.getLogger(__name__)


@router.get("/naver-calls")
def get_naver_call_stats(admin: dict = Depends(get_admin_user)):
    """엔드포인트 라벨별 네이버 API 호출 수 (10m/1h/24h 슬라이딩 윈도우)

    시도 수 기준 — 캐시 히트도 포함. 실제 HTTP 수는 naver_api.py 내부
    로깅과 교차 검증 필요. label 예시:

    - search / search_discover — 검색 경로 (사용자 / 스케줄러)
    - crawl_articles_live / crawl_articles_batch — 매물 목록 (사용자 / 스케줄러)
    - article_detail_live / article_detail_batch / article_detail_realtime
      / article_detail_live_fallback — 매물 상세 경로
    - complex_prices_ondemand / complex_prices_batch / complex_real_prices_ondemand
      — 시세 경로 (on-demand / 스케줄러)
    - complex_detail — 단지 보강
    """
    return get_stats()
