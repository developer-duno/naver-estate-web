"""정기 VACUUM 유지보수 — visibility map 재악화 차단

배경 (세션 260): articles/trades 는 autovacuum 이 한 번도 안 돌아(통계 stale 악순환)
visibility map 이 stale → 풀 테이블 집계(data-freshness COUNT)가 5초+. 수동 VACUUM ANALYZE
1회로 정상화해도, crawl_details 가 30분마다 articles 를 UPDATE 하므로 며칠 뒤 다시 악화된다.

이 잡은 매일 새벽 VACUUM (ANALYZE) 를 돌려 vismap/통계를 유지하는 안전망이다. 수동 1회
정상화로 autovacuum 이 살아나면 이 잡은 무해한 중복이 되고, autovacuum 이 계속 안 돌면
이 잡이 생명줄이 된다.

VACUUM 은 트랜잭션 블록 안에서 실행 불가 → autocommit 연결로 문장별 실행.
SQLite(테스트)는 VACUUM 문법/대상이 달라 no-op (dialect 분기).

곁다리 작업: 만료된 `rate_limit_counters` 행 정리도 여기서 함께 한다. 그 테이블은
`quota:{api}:{날짜}` 로 **날짜마다 새 키**가 생기는데 `expires_at` 을 보고 지우는
주체가 없어 만료분이 계속 쌓이고 있었다(2026-04-15 이후 ~135행). 하루 한 번 도는
청소 잡에 얹는 게 새 스케줄러 잡을 만드는 것보다 단순하다. best-effort 라 실패해도
VACUUM 결과·잡 상태에 영향이 0 이다.

세션 359: 전수조사에서 이 잡만 CrawlJob 기록을 아예 안 남겨(logger 만) monitor.py
감시망(작업실패/작업마비/데이터미축적 3축 전부)의 완전한 사각지대였다 — "이 잡이
오늘 도는지 안 도는지" 자체를 볼 방법이 없었다. VACUUM 은 새 행이 쌓이는 잡이 아니라
"신선도"(new_rows) 개념이 안 맞으므로 freshness_meta.py 패턴 대신, 다른 수집기와
동일하게 CrawlJob 기록만 추가해 monitor.py 의 작업실패·작업마비 축(job_type 무관
범용 스캔)에 자연 편입시킨다 — 새 감시 축을 만들 필요 없이 기존 것에 올라탄다.
"""

import logging

from crawler.service_common import fail_job_safely
from db.database import SessionLocal
from db.models import CrawlJob
from utils import utcnow

logger = logging.getLogger(__name__)

# VACUUM 대상 테이블 (bloat 누적 + 풀스캔 집계 대상)
_VACUUM_TABLES = ("articles", "trades")


def _purge_expired_quota_counters(db) -> int:
    """만료된 rate_limit_counters 행 정리 — **best-effort 곁다리 작업**.

    이 잡의 본체는 VACUUM 이고, 이건 "청소하는 김에 같이" 하는 일이다. 그래서
    실패해도 VACUUM 결과·잡 상태에 절대 영향을 주지 않는다(예외를 통째로 삼키고
    경고만 남긴다) — 곁다리가 본체를 죽이면 안 된다.

    ⚠ 실패 시 `db.rollback()` 이 필요하다. 실패한 문장을 그대로 두면 세션이
    aborted 상태로 남아, 뒤이은 CrawlJob 마감 commit 까지 연쇄로 터진다
    (infra.md §monitor freshness 의 InFailedSqlTransaction 연쇄와 같은 결).
    """
    try:
        from crawler.quota_db import purge_expired_counters

        deleted = purge_expired_counters(db)
        if deleted:
            logger.info("만료된 쿼터 카운터 %d행 정리", deleted)
        return deleted
    except Exception:
        logger.warning("만료된 쿼터 카운터 정리 실패 (VACUUM 결과에는 영향 없음)", exc_info=True)
        try:
            db.rollback()
        except Exception:
            logger.warning("쿼터 정리 실패 후 rollback 도 실패", exc_info=True)
        return 0


def run_vacuum_maintenance() -> dict:
    """articles/trades VACUUM (ANALYZE) 실행. 결과 요약 dict 반환.

    PostgreSQL: autocommit 연결로 테이블별 `VACUUM (ANALYZE)` 실행.
    SQLite: VACUUM 이 전체 DB 단위 + ANALYZE 문법 차이 → no-op (테스트 격리).

    CrawlJob 기록은 VACUUM 본체(autocommit 연결)와 별도 세션으로 처리 —
    VACUUM 연결의 격리 수준(autocommit)을 건드리지 않기 위함.
    """
    # 함수 내부 import: conftest 가 sys.modules["db.database"] 를 SQLite 엔진으로 교체하므로
    # top-level import 면 교체 전 prod 엔진이 바인딩될 수 있음 → 테스트가 prod VACUUM 위험.
    from db.database import engine

    db = SessionLocal()
    job = CrawlJob(job_type="vacuum_maintenance", status="running", started_at=utcnow())
    db.add(job)
    db.commit()
    job_id = job.id

    # 만료 쿼터 카운터 정리는 **VACUUM 여부와 무관**하게 매일 돌린다 —
    # dialect 를 안 타는 평범한 DELETE 라, PostgreSQL 전용인 VACUUM 의
    # early return 앞에 둔다(뒤에 두면 SQLite 경로에선 영영 안 돈다).
    purged = _purge_expired_quota_counters(db)

    dialect = engine.dialect.name
    if dialect != "postgresql":
        logger.info("VACUUM 유지보수 skip (dialect=%s, PostgreSQL 전용)", dialect)
        job.status = "completed"
        job.completed_at = utcnow()
        job.total_items = len(_VACUUM_TABLES)
        job.processed_items = 0
        db.commit()
        db.close()
        return {"skipped": dialect, "vacuumed": [], "purged_counters": purged}

    vacuumed: list[str] = []
    failed: list[str] = []
    # VACUUM 은 트랜잭션 밖에서만 실행 가능 → AUTOCOMMIT 격리
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        for table in _VACUUM_TABLES:
            try:
                conn.exec_driver_sql(f"VACUUM (ANALYZE) {table}")
                vacuumed.append(table)
                logger.info("VACUUM (ANALYZE) %s 완료", table)
            except Exception:
                logger.exception("VACUUM (ANALYZE) %s 실패", table)
                failed.append(table)

    try:
        if failed and not vacuumed:
            # 전부 실패 — job_error_listener.py 처럼 예외를 던지진 않지만(스케줄러를
            # 안 죽이는 게 의도), monitor.py 의 작업실패 축이 잡도록 failed 로 기록.
            job.status = "failed"
            job.error_message = f"VACUUM 전체 실패: {failed}"[:500]
        else:
            job.status = "completed"
        job.completed_at = utcnow()
        job.total_items = len(_VACUUM_TABLES)
        job.processed_items = len(vacuumed)
        db.commit()
    except Exception as e:
        db.rollback()
        fail_job_safely(job_id, str(e)[:500])
    finally:
        db.close()

    return {"skipped": None, "vacuumed": vacuumed, "purged_counters": purged}
