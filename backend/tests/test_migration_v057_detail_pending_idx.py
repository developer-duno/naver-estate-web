"""V057 부분 인덱스(ix_articles_detail_pending) 정합 가드 — 세션 400.

이 테스트가 검증하는 것 (두 축):

(a) **마이그레이션 SQL 텍스트** — V057 파일이 실제로 의도한 인덱스를 만드는지.
    부분 인덱스는 술어·정렬이 자 단위로 맞아야 플래너가 쓰므로, 인덱스명·술어
    (detail_crawled = false AND is_active = true)·정렬 키(last_seen_at DESC NULLS LAST)·
    멱등(IF NOT EXISTS)·롤백 문구가 파일에 박혀 있는지 본다.

(b) **드리프트 가드 (이 파일의 핵심)** — crawler/service_discover.py 의 후보 SELECT 가
    나중에 바뀌어 인덱스가 **조용히 무시**되는 것을 막는다. 부분 인덱스가 죽는 사고는
    에러도 경고도 안 내고 그냥 쿼리가 다시 전량 스캔으로 돌아가는 형태라(세션 400 이
    고치려는 바로 그 상태) 사람 눈에는 안 보인다. 그래서 소스 텍스트를 grep 하는 게
    아니라 `crawl_article_details` 를 **실제로 실행해 DB 로 나가는 SQL 문을 캡처**해
    술어와 정렬을 대조한다 — filter_by 교체·술어 변수 추출·정렬 키 추가·다른 함수로
    이동 등 코드 형태가 어떻게 바뀌어도 실제 SQL 만 보므로 우회되지 않는다.

    뮤테이션 검증 (2026-09-12 실측, 확인 후 정확히 복원):
      ① `.order_by(Article.complex_no, Article.last_seen_at.desc().nullslast())`
         (정렬 키 앞에 하나 추가)                 → 이 파일 FAIL
      ② `Article.is_active == True,` 필터 줄 삭제 → 이 파일 FAIL
    둘 다 FAIL 하는 것을 확인했다 = 이 가드는 장식이 아니라 실제로 드리프트를 본다.

(c) vacuum_maintenance 의 상한 리셋 UPDATE 가 같은 두 술어를 유지하는지(기록용).

설계 메모: 라이브 인덱스 사용 여부(EXPLAIN Index Scan·Buffers)는 SQLite CI 로 검증
불가능하다(domain-mapping-ssot.md 룰 3 dialect 함정) — 그 판정은 V057 헤더의
"적용 후 판정 기준"대로 prod EXPLAIN 으로만 확인한다. 여기서는 "코드와 인덱스 정의가
서로 어긋나지 않는다"는 정합만 기계적으로 지킨다.
"""

import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy import event

from crawler import service_discover
from crawler.service_discover import crawl_article_details
from db.models import Article

_MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "db" / "migrations"
_V057 = _MIGRATIONS_DIR / "V057__articles_detail_pending_idx.sql"

INDEX_NAME = "ix_articles_detail_pending"

# 드리프트 실패 시 공통으로 붙이는 안내 — 쿼리를 바꾼 사람이 인덱스를 함께 봐야 한다는 것이
# 이 가드의 존재 이유이므로, 메시지에 그 지시를 명시한다.
_DRIFT_HINT = (
    "V057 부분 인덱스 술어/정렬과 어긋남 — 쿼리를 바꾸면 인덱스를 함께 "
    "재검토(새 마이그레이션)하라"
)


# ── (a) 마이그레이션 SQL 텍스트 ────────────────────────────────────────────


@pytest.fixture(scope="module")
def v057_sql() -> str:
    assert _V057.exists(), (
        f"V057 마이그레이션 파일 부재: {_V057} — 이 파일이 인덱스 정의의 단일 출처다"
    )
    return _V057.read_text(encoding="utf-8")


def _strip_comments(sql: str) -> str:
    """`--` 줄 주석과 `COMMENT ON ... ;` 문을 제거해 실행문 텍스트만 남긴다.

    (test_migration_v045_no_mibunyang_table_touch.py 패턴 답습.) V057 헤더 주석은
    설계 근거를 설명하며 인덱스 정의·롤백 문구를 그대로 인용하므로, 파일을 통째로
    substring 검사하면 주석만 있고 실행문이 없어도 통과하는 자기오탐이 된다 —
    실행문(CREATE INDEX 등)만 검사 대상으로 좁힌다.
    """
    lines = []
    in_comment_on = False
    for line in sql.splitlines():
        stripped = line.strip()
        if in_comment_on:
            if stripped.endswith("';"):
                in_comment_on = False
            continue
        if stripped.startswith("--"):
            continue
        if stripped.startswith("COMMENT ON"):
            if not stripped.endswith("';"):
                in_comment_on = True
            continue
        lines.append(line)
    return "\n".join(lines)


def test_v057_creates_partial_index_with_exact_predicate_and_order(v057_sql):
    """실행문(주석 제외)이 술어·정렬 키·멱등까지 정확히 담은 부분 인덱스를 만드는지.

    * `IF NOT EXISTS` — 멱등(재실행 안전, V048 관례)
    * 술어 두 개 — 이게 곧 인덱스 엔트리 수(= 대기 매물 수)를 KB 급으로 묶는다
    * `last_seen_at DESC NULLS LAST` — indoption 이 ORDER BY 와 정확히 일치해야
      플래너가 쓴다(불일치 시 Seq Scan 으로 통째 무시 — V057 헤더 실측)
    """
    executable_sql = _strip_comments(v057_sql)

    assert f"CREATE INDEX IF NOT EXISTS {INDEX_NAME}" in executable_sql, (
        f"V057 실행문에 멱등 CREATE INDEX IF NOT EXISTS {INDEX_NAME} 가 없다"
    )
    assert "detail_crawled = false" in executable_sql, (
        "V057 인덱스 술어에 detail_crawled = false 누락 — 술어가 빠지면 인덱스가 "
        "articles 전량(149만 행)을 담아 목적(엔트리 = 대기 매물 수)이 무너진다"
    )
    assert "is_active = true" in executable_sql, (
        "V057 인덱스 술어에 is_active = true 누락"
    )
    assert "last_seen_at DESC NULLS LAST" in executable_sql, (
        "V057 인덱스 정렬 키가 last_seen_at DESC NULLS LAST 가 아니다 — 코드의 "
        ".order_by(Article.last_seen_at.desc().nullslast()) 와 정확히 일치해야 "
        "플래너가 인덱스를 쓴다"
    )


def test_v057_documents_concurrent_rollback(v057_sql):
    """롤백 경로가 파일에 적혀 있는지 — 주석 포함 **원문**에서 확인.

    롤백(`DROP INDEX CONCURRENTLY`)은 트랜잭션 블록 안에서 실행할 수 없어 본문
    실행문이 아니라 주석으로만 담긴다(V048 선례). 따라서 (a) 의 실행문 검사와
    분리해 원문에서 본다 — 섞으면 서로가 서로의 오탐이 된다.
    """
    assert "DROP INDEX CONCURRENTLY" in v057_sql, (
        "V057 에 롤백 문구(DROP INDEX CONCURRENTLY)가 없다 — 인덱스 미사용·INVALID "
        "잔존 시 되돌릴 경로가 파일에 남아야 한다"
    )
    assert INDEX_NAME in v057_sql


# ── (b) 드리프트 가드: 실행 SQL 캡처 대조 ──────────────────────────────────


def _make_pending_article(db, article_no: str, last_seen: datetime) -> None:
    """detail_crawled=False, is_active=True 인 상세 미완 매물 1건 심기
    (test_crawl_detail_order.py 헬퍼 답습)."""
    db.add(
        Article(
            article_no=article_no,
            complex_no="100",
            trade_type_name="매매",
            detail_crawled=False,
            is_active=True,
            last_seen_at=last_seen,
            detail_fail_count=0,
        )
    )
    db.commit()


@pytest.fixture
def no_throttle(monkeypatch):
    """throttle.wait() 1.5초 대기 제거 + record_call no-op (테스트 속도/격리)."""
    monkeypatch.setattr(service_discover._throttle_details, "wait", lambda: None)
    monkeypatch.setattr(service_discover, "record_call", lambda *a, **k: None)


@pytest.fixture
def candidate_select(db, no_throttle, monkeypatch) -> str:
    """`crawl_article_details` 를 실제 실행하고 후보 SELECT 문 원문을 캡처해 돌려준다.

    엔진(`db.get_bind()`)에 `before_cursor_execute` 리스너를 걸어 캡처한다 — 크롤
    함수는 자기 세션(`SessionLocal()`)을 쓰지만 테스트 conftest 에서 같은
    `test_engine` 을 공유하므로 엔진 레벨 리스너에 잡힌다. 실행 후 반드시
    `event.remove` 로 해제해 다른 테스트에 누수 0.
    """
    now = datetime.now(timezone.utc)
    _make_pending_article(db, "DRIFT_NEW", now)
    _make_pending_article(db, "DRIFT_OLD", now - timedelta(days=3))

    monkeypatch.setattr(
        service_discover.NaverEstateAPI,
        "get_article_detail",
        staticmethod(lambda an: {"articleDetail": {"articleNo": an}}),
    )

    captured: list[str] = []

    def _capture(conn, cursor, statement, parameters, context, executemany):
        captured.append(statement)

    bind = db.get_bind()
    event.listen(bind, "before_cursor_execute", _capture)
    try:
        crawl_article_details(batch_size=10)
    finally:
        event.remove(bind, "before_cursor_execute", _capture)

    # 후보 SELECT = articles 에서 읽으면서 LIMIT 이 붙은 문(배치 선정 쿼리)
    selects = [
        s
        for s in captured
        if "FROM articles" in s and "LIMIT" in s and s.lstrip().upper().startswith("SELECT")
    ]
    assert len(selects) == 1, (
        f"후보 SELECT 를 정확히 1건 캡처하지 못했다(캡처 {len(selects)}건) — "
        f"crawl_article_details 의 배치 선정 쿼리 구조가 바뀌었는지 확인하라. {_DRIFT_HINT}"
    )
    return selects[0]


def test_candidate_select_keeps_index_predicate(candidate_select):
    """후보 SELECT WHERE 절이 V057 인덱스 술어 두 개를 그대로 유지하는지.

    술어가 빠지면(예: is_active 필터 제거) 쿼리가 인덱스 술어에 포함되지 않아
    플래너가 부분 인덱스를 쓸 수 없다. SQLite 는 불리언을 0/1 로, PostgreSQL 은
    false/true 로 렌더하므로 둘 다 허용한다.
    """
    assert re.search(r"articles\.detail_crawled\s*=\s*(0|false)", candidate_select), (
        f"후보 SELECT 에 detail_crawled = false 조건이 없다. {_DRIFT_HINT}\n"
        f"실제 SQL: {candidate_select}"
    )
    assert re.search(r"articles\.is_active\s*=\s*(1|true)", candidate_select), (
        f"후보 SELECT 에 is_active = true 조건이 없다. {_DRIFT_HINT}\n"
        f"실제 SQL: {candidate_select}"
    )


def test_candidate_select_order_by_is_exactly_index_key(candidate_select):
    """정렬 절이 **오직** `last_seen_at DESC NULLS LAST` 하나인지.

    앞에 다른 정렬 키가 추가되면(예: complex_no 먼저) 인덱스만으로는 정렬을
    만족시킬 수 없어 플래너가 Sort 노드를 붙이며 인덱스를 버린다 — 에러 없이
    조용히 전량 스캔으로 돌아가는 형태라 이 단언이 유일한 방어선이다.
    `ORDER BY` 바로 뒤가 이 키이고 곧바로 `LIMIT` 이 오는지로 "정렬 절 전체"를 본다
    (파라미터는 `LIMIT ?` 로 바인딩되므로 LIMIT 토큰까지만 매칭).
    """
    assert re.search(
        r"ORDER BY articles\.last_seen_at DESC NULLS LAST\s+LIMIT", candidate_select
    ), (
        f"후보 SELECT 의 정렬 절이 'last_seen_at DESC NULLS LAST' 단독이 아니다 "
        f"(정렬 키 추가·변경·NULLS 처리 변경 포함). {_DRIFT_HINT}\n"
        f"실제 SQL: {candidate_select}"
    )


# ── (c) vacuum_maintenance 상한 리셋 술어 정합 (기록용) ────────────────────


def test_vacuum_retry_grant_keeps_same_predicate():
    """일일 정비 잡의 상한 리셋 UPDATE 가 같은 두 술어를 유지하는지(소스 텍스트).

    이 UPDATE 는 `detail_fail_count >= cap` 을 1행으로 추정하는 플래너 탓에 V057
    인덱스로 빨라지지 않는다(실측 — Bitmap 경로가 Seq 보다 비싸 영향 0). 부수 이득이
    없으므로 성능 가드가 아니라, 상한 매물을 되살리는 대상 집합이 상세 후보 집합과
    같은 술어를 쓴다는 **정합 기록**으로 둔다.
    """
    source = (
        Path(__file__).resolve().parent.parent / "crawler" / "vacuum_maintenance.py"
    ).read_text(encoding="utf-8")
    assert "is_active = TRUE AND detail_crawled = FALSE" in source, (
        "vacuum_maintenance 의 상한 리셋 UPDATE 술어가 상세 후보 술어와 어긋났다 — "
        "되살린 매물이 후보 집합 밖이면 재시도 자격 부여가 무의미해진다"
    )
