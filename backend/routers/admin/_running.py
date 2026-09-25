"""'지금 돌아가는 작업' 판정 — 잡 유형별 임계로 유령(stale) running 행을 거른다.

관리자 화면 세 곳(`jobs.py` 작업 목록 running 필터 · `recrawl.py` 안전도 조회 ·
일괄 재수집 시작 전 재확인)이 같은 규칙을 쓴다.

옛 규칙은 "시작 1시간 이내"로 고정이라, 정상적으로 1시간 넘게 도는 작업
(관리비 3h·공시가격 16h·상세 백필 4h·시세 소급 12h 등)이 **돌고 있는데도
화면에서 사라졌다**(세션 419 검사관 ③). 임계는 모니터가 "멈췄다"고 판정해
정리하는 기준(`crawler/monitor.py _STALE_HOURS_BY_TYPE`)을 그대로 쓴다 —
모니터가 아직 살아 있다고 보는 동안은 화면에도 보여야 두 판정이 어긋나지 않는다.

⚠ `crawler.monitor` 는 함수 안에서 불러온다. monitor 가 모듈 최상위에서
`routers.admin.freshness` 를 import 하므로, 여기서 최상위 import 를 하면
스케줄러가 monitor 를 먼저 불러오는 순서에서 순환 import 로 깨진다.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, or_

from db.models import CrawlJob


def running_not_stale_clause(now: datetime | None = None):
    """started_at 이 그 잡 유형의 임계 안쪽인 행만 고르는 조건(status 조건은 호출부 몫).

    한 쿼리 안에서 유형마다 다른 컷오프를 쓴다:
      (job_type = k1 AND started_at >= now - h1) OR … OR
      (job_type NOT IN (k1, …) AND started_at >= now - 기본 1h)
    """
    from crawler import monitor as _monitor

    now = now or datetime.now(timezone.utc)
    by_type = _monitor._STALE_HOURS_BY_TYPE
    default_hours = _monitor._STALE_HOURS
    clauses = [
        and_(CrawlJob.job_type == job_type, CrawlJob.started_at >= now - timedelta(hours=hours))
        for job_type, hours in by_type.items()
    ]
    clauses.append(
        and_(
            CrawlJob.job_type.notin_(list(by_type)),
            CrawlJob.started_at >= now - timedelta(hours=default_hours),
        )
    )
    return or_(*clauses)
