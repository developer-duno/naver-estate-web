"""정기 VACUUM 유지보수 — visibility map 재악화 차단

배경 (세션 260): articles/trades 는 autovacuum 이 한 번도 안 돌아(통계 stale 악순환)
visibility map 이 stale → 풀 테이블 집계(data-freshness COUNT)가 5초+. 수동 VACUUM ANALYZE
1회로 정상화해도, crawl_details 가 30분마다 articles 를 UPDATE 하므로 며칠 뒤 다시 악화된다.

이 잡은 매일 새벽 VACUUM (ANALYZE) 를 돌려 vismap/통계를 유지하는 안전망이다. 수동 1회
정상화로 autovacuum 이 살아나면 이 잡은 무해한 중복이 되고, autovacuum 이 계속 안 돌면
이 잡이 생명줄이 된다.

VACUUM 은 트랜잭션 블록 안에서 실행 불가 → autocommit 연결로 문장별 실행.
SQLite(테스트)는 VACUUM 문법/대상이 달라 no-op (dialect 분기).
"""

import logging

logger = logging.getLogger(__name__)

# VACUUM 대상 테이블 (bloat 누적 + 풀스캔 집계 대상)
_VACUUM_TABLES = ("articles", "trades")


def run_vacuum_maintenance() -> dict:
    """articles/trades VACUUM (ANALYZE) 실행. 결과 요약 dict 반환.

    PostgreSQL: autocommit 연결로 테이블별 `VACUUM (ANALYZE)` 실행.
    SQLite: VACUUM 이 전체 DB 단위 + ANALYZE 문법 차이 → no-op (테스트 격리).
    """
    # 함수 내부 import: conftest 가 sys.modules["db.database"] 를 SQLite 엔진으로 교체하므로
    # top-level import 면 교체 전 prod 엔진이 바인딩될 수 있음 → 테스트가 prod VACUUM 위험.
    from db.database import engine

    dialect = engine.dialect.name
    if dialect != "postgresql":
        logger.info("VACUUM 유지보수 skip (dialect=%s, PostgreSQL 전용)", dialect)
        return {"skipped": dialect, "vacuumed": []}

    vacuumed: list[str] = []
    # VACUUM 은 트랜잭션 밖에서만 실행 가능 → AUTOCOMMIT 격리
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        for table in _VACUUM_TABLES:
            try:
                conn.exec_driver_sql(f"VACUUM (ANALYZE) {table}")
                vacuumed.append(table)
                logger.info("VACUUM (ANALYZE) %s 완료", table)
            except Exception:
                logger.exception("VACUUM (ANALYZE) %s 실패", table)
    return {"skipped": None, "vacuumed": vacuumed}
