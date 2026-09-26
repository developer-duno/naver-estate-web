"""V067 부분 인덱스 2개 정합 가드 — 세션 420.

(a) **마이그레이션 SQL 텍스트** — 실행문(주석 제외)이 두 부분 인덱스를 술어째 만드는지,
    롤백 문구가 원문에 있는지.
(b) **드리프트 가드** — 인덱스가 받치는 두 쿼리를 실제로 실행해 DB 로 나가는 SQL 을 캡처하고
    술어를 대조한다. 부분 인덱스는 쿼리 WHERE 가 술어를 함의하지 않으면 에러 없이 조용히
    무시되고 전량 스캔으로 돌아간다(V057 가드와 같은 이유):
      ⓐ routers/admin/jobs.py `_compute_detailed_stats` 의 상세 채움 count —
         WHERE 가 정확히 두 조건뿐이어야 Index Only Scan 이 된다(다른 열 조건이 붙으면 힙을 봐야 함).
      ⓑ routers/admin/jobs.py `list_crawl_jobs(status="running")` — `status = 'running'` 유지.

라이브 인덱스 사용 여부(EXPLAIN)는 SQLite CI 로 검증 불가 — V067 헤더의 판정 기준대로 prod
EXPLAIN 으로만 본다. 여기서는 "코드와 인덱스 정의가 어긋나지 않는다"만 기계적으로 지킨다.
"""

import re
from pathlib import Path

import pytest
from sqlalchemy import event

from routers.admin.jobs import _compute_detailed_stats, list_crawl_jobs

_V067 = (
    Path(__file__).resolve().parent.parent
    / "db"
    / "migrations"
    / "V067__admin_stats_partial_indexes.sql"
)
_DRIFT_HINT = "V067 부분 인덱스 술어와 어긋남 — 쿼리를 바꾸면 인덱스를 함께 재검토(새 마이그레이션)하라"


@pytest.fixture(scope="module")
def v067_sql() -> str:
    assert _V067.exists(), f"V067 마이그레이션 파일 부재: {_V067}"
    return _V067.read_text(encoding="utf-8")


def _executable(sql: str) -> str:
    """`--` 주석 줄을 뺀 실행문만 — 헤더 주석이 정의를 인용해도 자기오탐이 안 나게."""
    return "\n".join(line for line in sql.splitlines() if not line.strip().startswith("--"))


def _capture(db, fn) -> list[tuple[str, object]]:
    """fn 을 실행하는 동안 엔진으로 나간 (SQL, 파라미터) 를 모은다. 끝나면 리스너 해제."""
    captured: list[tuple[str, object]] = []

    def _listener(conn, cursor, statement, parameters, context, executemany):
        captured.append((statement, parameters))

    bind = db.get_bind()
    event.listen(bind, "before_cursor_execute", _listener)
    try:
        fn()
    finally:
        event.remove(bind, "before_cursor_execute", _listener)
    return captured


# ── (a) 마이그레이션 SQL 텍스트 ────────────────────────────────────────────


def test_v067_creates_both_partial_indexes(v067_sql):
    """두 인덱스가 CONCURRENTLY·멱등·정확한 술어로 실행문에 있는지."""
    sql = " ".join(_executable(v067_sql).split())
    assert (
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_articles_detail_filled_active "
        "ON articles (complex_no) WHERE detail_crawled = true AND is_active = true;"
    ) in sql, "ⓐ 인덱스 정의(열 complex_no · 술어 두 개)가 실행문에 없다"
    assert (
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_crawl_jobs_running "
        "ON crawl_jobs (created_at DESC) WHERE status = 'running';"
    ) in sql, "ⓑ 인덱스 정의(술어 status = 'running')가 실행문에 없다"


def test_v067_documents_rollback(v067_sql):
    """롤백은 트랜잭션 밖 단일 문장이라 주석으로만 담긴다 — 원문에서 확인."""
    for name in ("ix_articles_detail_filled_active", "ix_crawl_jobs_running"):
        assert f"DROP INDEX CONCURRENTLY IF EXISTS {name};" in v067_sql, f"{name} 롤백 문구 없음"


# ── (b) 드리프트 가드: 실행 SQL 캡처 대조 ──────────────────────────────────


def test_detail_filled_count_where_is_exactly_index_predicate(db):
    """상세 통계의 articles count 중 detail_crawled 를 보는 문장이 두 조건만 갖는지."""
    captured = _capture(db, lambda: _compute_detailed_stats(db))
    counts = [
        s
        for s, _ in captured
        if "FROM articles" in s and "count(" in s.lower() and "detail_crawled" in s
    ]
    assert len(counts) == 1, f"상세 채움 count 를 정확히 1건 캡처하지 못했다({len(counts)}건). {_DRIFT_HINT}"
    where = " ".join(counts[0].split("WHERE", 1)[1].split())
    assert re.fullmatch(
        r"articles\.detail_crawled = (1|true) AND articles\.is_active = (1|true)", where
    ), f"WHERE 가 인덱스 술어 두 조건과 정확히 같지 않다. {_DRIFT_HINT}\n실제 WHERE: {where}"


def test_running_job_list_keeps_status_running(db):
    """'지금 돌아가는 작업' 조회(count·목록 두 문장)가 status = 'running' 을 유지하는지."""
    captured = _capture(
        db,
        lambda: list_crawl_jobs(
            status="running", job_type=None, page=1, page_size=20, db=db, admin={}
        ),
    )
    stmts = [(s, p) for s, p in captured if "FROM crawl_jobs" in s]
    assert len(stmts) == 2, f"count·목록 두 문장을 캡처하지 못했다({len(stmts)}건). {_DRIFT_HINT}"
    for statement, params in stmts:
        assert "crawl_jobs.status = ?" in statement, f"status 조건이 없다. {_DRIFT_HINT}\n{statement}"
        assert "running" in tuple(params), f"status 값이 'running' 이 아니다. {_DRIFT_HINT}\n{params}"
