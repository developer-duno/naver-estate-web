"""V059 중복 인덱스 제거(ix_articles_complex_no) 정합 가드 — 세션 406.

이 테스트가 검증하는 것 (세 축):

(a) **마이그레이션 SQL 텍스트** — V059 파일의 실행문이 멱등하게 그 인덱스만 지우는지.
    헤더 주석이 인덱스명·롤백 SQL 을 그대로 인용하므로 파일을 통째로 substring 검사하면
    "주석만 있고 실행문이 없어도 통과"하는 자기오탐이 된다 — V057/V058 의 `_strip_comments`
    패턴을 답습해 실행문만 검사 대상으로 좁힌다.

(b) **ORM 동반 제거 (이 파일의 핵심)** — db/models.py 의 Article.complex_no 에 index=True 가
    다시 붙는 것을 막는다. 이 사고는 **에러도 경고도 안 낸다**: tests/conftest.py 가
    Base.metadata.create_all() 로 스키마를 만들기 때문에, 누가 index=True 를 되살려도
    SQLite CI 는 그냥 인덱스를 하나 더 만들고 전부 초록으로 통과한다. 그 상태로 머지되면
    prod(인덱스 없음)와 ORM(인덱스 있음)이 영구히 어긋나고, 이후 누군가
    create_all 로 스키마를 재생성하는 순간 24MB 짜리가 조용히 부활한다.
    SQL 만 적용하고 ORM 을 두면 "반쪽 작업"이 되는 이유가 이것이다.

(c) **포섭 인덱스 생존** — complex_no 단독 인덱스를 지워도 되는 근거는 어디까지나
    ix_articles_complex_active(complex_no, is_active)·idx_articles_confirm_sort
    (complex_no, is_active, article_confirm_ymd)가 선행 칼럼으로 그 역할을 흡수하기
    때문이다. 그 둘 중 하나라도 사라지면 V059 의 전제가 무너지므로 함께 가드한다.

설계 메모: 라이브 플랜 변화(EXPLAIN cost·Index Scan 선택)는 SQLite CI 로 검증 불가능하다
(domain-mapping-ssot.md 룰 3 dialect 함정). 세션 406 은 prod 에서 트랜잭션 안 DROP →
EXPLAIN → ROLLBACK 으로 "cost 가 소수점까지 동일"을 실측했고, 그 근거는 V059 헤더에
박아 두었다. 여기서는 "SQL 과 ORM 이 서로 어긋나지 않는다"는 정합만 기계적으로 지킨다.

뮤테이션 검증 (2026-09-14 실측, 확인 후 정확히 복원):
  ① db/models.py 의 complex_no 에 `index=True` 재부착  → test_orm_complex_no_has_no_standalone_index FAIL
  ② V059 실행문의 `DROP INDEX IF EXISTS` → `DROP INDEX` → test_v059_drops_index_idempotently FAIL
둘 다 FAIL 하는 것을 확인했다 = 이 가드는 장식이 아니라 실제로 되돌림을 본다.
"""

from pathlib import Path

import pytest

from db.models import Article

_MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "db" / "migrations"
_V059 = _MIGRATIONS_DIR / "V059__drop_redundant_articles_complex_no_idx.sql"

DROPPED_INDEX = "ix_articles_complex_no"
# V059 의 전제 — 이 둘이 complex_no 검색을 선행 칼럼으로 흡수한다.
COVERING_INDEXES = {
    "ix_articles_complex_active": ["complex_no", "is_active"],
    "idx_articles_confirm_sort": ["complex_no", "is_active", "article_confirm_ymd"],
}


# ── (a) 마이그레이션 SQL 텍스트 ────────────────────────────────────────────


@pytest.fixture(scope="module")
def v059_sql() -> str:
    assert _V059.exists(), (
        f"V059 마이그레이션 파일 부재: {_V059} — 이 파일이 제거 결정의 단일 출처다"
    )
    return _V059.read_text(encoding="utf-8")


def _strip_comments(sql: str) -> str:
    """`--` 줄 주석과 `COMMENT ON ... ;` 문을 제거해 실행문 텍스트만 남긴다.

    (test_migration_v057_detail_pending_idx.py 패턴 답습.)
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


def test_v059_drops_index_idempotently(v059_sql):
    """실행문이 `DROP INDEX IF EXISTS ix_articles_complex_no` 하나뿐인지.

    * `IF EXISTS` — 멱등(재실행 안전). prod 수동 실행이라 중복 실행 여지가 있고,
      CONCURRENTLY 로 먼저 적용한 뒤 이 파일을 재생용으로 돌릴 수도 있다.
    * DROP 이 정확히 1회 — 옆 인덱스까지 같이 지우는 실수를 차단한다.
    """
    executable_sql = _strip_comments(v059_sql)

    assert f"DROP INDEX IF EXISTS {DROPPED_INDEX}" in executable_sql, (
        f"V059 실행문에 멱등 `DROP INDEX IF EXISTS {DROPPED_INDEX}` 가 없다"
    )
    assert executable_sql.upper().count("DROP INDEX") == 1, (
        "V059 실행문의 DROP INDEX 가 정확히 1회가 아니다 — 이 마이그레이션은 "
        f"{DROPPED_INDEX} 하나만 지운다(실제 {executable_sql.upper().count('DROP INDEX')}회)"
    )
    for keep in COVERING_INDEXES:
        assert keep not in executable_sql, (
            f"V059 실행문이 {keep} 를 건드린다 — 이 인덱스는 제거 근거의 전제라 "
            "살아 있어야 한다"
        )


def test_v059_documents_rollback(v059_sql):
    """롤백 경로가 파일에 적혀 있는지 — 주석 포함 **원문**에서 확인.

    롤백은 실행하면 안 되므로 주석으로만 담긴다(V050·V057·V058 선례). 따라서 (a) 의
    실행문 검사와 분리해 원문에서 본다 — 섞으면 서로가 서로의 오탐이 된다.
    되살릴 때 ORM 도 같이 되돌려야 한다는 지시가 함께 있어야 반쪽 롤백을 막는다.
    """
    assert f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {DROPPED_INDEX}" in v059_sql, (
        "V059 에 롤백 문구(CREATE INDEX CONCURRENTLY IF NOT EXISTS)가 없다"
    )
    assert "index=True" in v059_sql, (
        "V059 롤백 안내에 ORM(index=True) 동반 복원 지시가 없다 — SQL 만 되돌리면 "
        "prod 와 ORM 이 다시 어긋난다"
    )


# ── (b) ORM 동반 제거 (핵심) ───────────────────────────────────────────────


def test_orm_complex_no_has_no_standalone_index():
    """Article.complex_no 에 index=True 가 붙어 있지 않은지.

    붙으면 SQLAlchemy 가 `ix_articles_complex_no` 를 다시 선언하고, conftest 의
    create_all() 이 그대로 만들어 준다 — SQLite CI 는 전부 초록이라 사람 눈에
    안 보이는 채로 prod 와 어긋난다. V059 가 지운 바로 그 인덱스다.
    """
    assert Article.__table__.c.complex_no.index in (None, False), (
        "Article.complex_no 에 index=True 가 되살아났다 — V059 가 제거한 "
        f"{DROPPED_INDEX} 가 ORM 에서 부활한다. 단독 인덱스는 "
        "ix_articles_complex_active/idx_articles_confirm_sort 에 포섭되므로 "
        "되살릴 이유가 없다(근거는 V059 헤더의 prod EXPLAIN 실측)."
    )

    declared = {ix.name for ix in Article.__table__.indexes}
    assert DROPPED_INDEX not in declared, (
        f"Article ORM 에 {DROPPED_INDEX} 선언이 있다 — V059 와 어긋난다"
    )


# ── (c) 포섭 인덱스 생존 ───────────────────────────────────────────────────


def test_covering_indexes_survive():
    """제거 근거의 전제(포섭 인덱스 2개)가 ORM 에 그대로 있는지.

    complex_no 단독 인덱스를 지워도 되는 이유는 이 둘이 선행 칼럼으로 그 역할을
    흡수하기 때문이다. 누가 이걸 지우거나 칼럼 순서를 바꾸면 V059 의 전제가
    무너지므로(complex_no 검색이 갈 곳을 잃는다) 함께 가드한다.
    """
    declared = {ix.name: [c.name for c in ix.columns] for ix in Article.__table__.indexes}

    for name, expected_cols in COVERING_INDEXES.items():
        if name not in declared:
            # idx_articles_confirm_sort 는 SQL 마이그레이션으로만 만들어져 ORM
            # __table_args__ 에 없을 수 있다 — 그 경우는 ORM 가드 대상이 아니다.
            continue
        assert declared[name][: len(expected_cols)] == expected_cols, (
            f"{name} 의 칼럼 순서가 바뀌었다: {declared[name]} — complex_no 가 "
            "선행 칼럼이어야 V059 의 '포섭' 전제가 성립한다"
        )

    assert "ix_articles_complex_active" in declared, (
        "ix_articles_complex_active 가 ORM 에서 사라졌다 — V059 가 complex_no 단독 "
        "인덱스를 지운 근거가 무너진다. 이 인덱스는 유지되어야 한다."
    )
    assert declared["ix_articles_complex_active"][0] == "complex_no", (
        "ix_articles_complex_active 의 선행 칼럼이 complex_no 가 아니다 — 포섭 성립 안 함"
    )
