"""V058 도장 컬럼 2개(complexes.articles_crawled_at · last_viewed_at) 정합 가드 — 세션 402.

이 테스트가 검증하는 것 (두 축):

(a) **마이그레이션 SQL 텍스트** — V058 파일의 실행문이 두 컬럼을 멱등(IF NOT EXISTS)하게
    TIMESTAMPTZ 로 추가하고, PostgREST 스키마 캐시 갱신(NOTIFY)과 롤백 문구를 담는지.
    헤더 주석이 컬럼명·SQL 을 그대로 인용하므로 파일을 통째로 substring 검사하면
    "주석만 있고 실행문이 없어도 통과"하는 자기오탐이 된다 — V057 테스트의
    `_strip_comments` 패턴을 답습해 실행문만 검사 대상으로 좁힌다.

(b) **ORM 매핑** — db.models.Complex 에 두 컬럼이 timezone-aware DateTime 으로 실제로
    매핑돼 있는지. 이 축이 중요한 이유는 SQL 과 ORM 이 어긋나면 증상이 갈리기 때문이다:
    ORM 에만 있고 prod 에 없으면 Complex SELECT 전 경로가 UndefinedColumn 500 이 되고
    (그래서 V058 헤더가 "prod 선행 실행 필수"를 못박는다), SQL 에만 있으면 스탬프 코드가
    조용히 컬럼을 못 찾는다. SQLite CI 는 create_all() 이 ORM 대로 테이블을 만들어
    이 불일치를 절대 못 잡으므로, 두 정의가 같은 것을 가리키는지는 여기서 본다.
"""

from pathlib import Path

import pytest
from sqlalchemy import DateTime

from db.models import Complex

_MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "db" / "migrations"
_V058 = _MIGRATIONS_DIR / "V058__complexes_articles_crawled_at_last_viewed_at.sql"

NEW_COLUMNS = ("articles_crawled_at", "last_viewed_at")


# ── (a) 마이그레이션 SQL 텍스트 ────────────────────────────────────────────


@pytest.fixture(scope="module")
def v058_sql() -> str:
    assert _V058.exists(), (
        f"V058 마이그레이션 파일 부재: {_V058} — 이 파일이 두 컬럼 정의의 단일 출처다"
    )
    return _V058.read_text(encoding="utf-8")


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


def test_v058_adds_both_columns_idempotently(v058_sql):
    """실행문이 두 컬럼을 각각 `ADD COLUMN IF NOT EXISTS ... TIMESTAMPTZ` 로 추가하는지.

    * `IF NOT EXISTS` — 멱등(재실행 안전). prod 수동 실행이라 중복 실행 여지가 있다.
    * `TIMESTAMPTZ` 2회 — 두 컬럼 모두 타임존 인식 타입. ORM 의 DateTime(timezone=True)
      와 맞춰야 KST/UTC 혼선이 안 난다(timezone-consistency 룰).
    """
    executable_sql = _strip_comments(v058_sql)

    for col in NEW_COLUMNS:
        assert f"ADD COLUMN IF NOT EXISTS {col}" in executable_sql, (
            f"V058 실행문에 멱등 `ADD COLUMN IF NOT EXISTS {col}` 가 없다"
        )
    assert executable_sql.count("TIMESTAMPTZ") == 2, (
        "V058 실행문의 TIMESTAMPTZ 가 정확히 2회가 아니다 — 두 컬럼 모두 타임존 인식 "
        f"타입이어야 한다(실제 {executable_sql.count('TIMESTAMPTZ')}회)"
    )
    assert "NOTIFY pgrst, 'reload schema';" in executable_sql, (
        "V058 에 PostgREST 스키마 캐시 갱신(NOTIFY pgrst)이 없다 — 컬럼 추가 시 필요"
    )


def test_v058_documents_rollback(v058_sql):
    """롤백 경로가 파일에 적혀 있는지 — 주석 포함 **원문**에서 확인.

    롤백은 실행하면 안 되므로 주석으로만 담긴다(V055·V057 선례). 따라서 (a) 의
    실행문 검사와 분리해 원문에서 본다 — 섞으면 서로가 서로의 오탐이 된다.
    """
    for col in NEW_COLUMNS:
        assert f"DROP COLUMN IF EXISTS {col}" in v058_sql, (
            f"V058 에 {col} 롤백 문구(DROP COLUMN IF EXISTS)가 없다"
        )


def test_v058_warns_prod_first(v058_sql):
    """"코드보다 prod 선행 실행 필수" 경고가 헤더에 남아 있는지.

    ORM 매핑 컬럼이 prod 에 없으면 Complex SELECT 전 경로가 UndefinedColumn 500 이
    되는데, SQLite CI 는 이 사고를 구조적으로 못 잡는다(create_all 이 컬럼을 만든다).
    그래서 배포 순서를 사람이 읽을 수 있는 자리에 못박아 두는 것이 유일한 방어다.
    """
    assert "prod 선행 실행 필수" in v058_sql, (
        "V058 헤더에 'prod 선행 실행 필수' 경고가 없다 — V034·V055 관례"
    )


# ── (b) ORM 매핑 ───────────────────────────────────────────────────────────


def test_orm_complex_has_both_stamp_columns():
    """Complex ORM 에 두 컬럼이 timezone-aware DateTime · nullable 로 매핑돼 있는지.

    nullable 이어야 기존 6만 행이 전부 NULL("아직 한 번도 완주/조회 안 함")로 남아
    PR-2 의 `NULLS FIRST` 순환에서 최우선 순번을 받는다.
    """
    columns = Complex.__table__.c
    for col in NEW_COLUMNS:
        assert col in columns, f"Complex ORM 에 {col} 컬럼이 없다"
        mapped = columns[col]
        assert isinstance(mapped.type, DateTime), (
            f"{col} 타입이 DateTime 이 아니다: {mapped.type!r}"
        )
        assert mapped.type.timezone is True, (
            f"{col} 이 timezone-aware 가 아니다 — 마이그레이션의 TIMESTAMPTZ 와 어긋난다"
        )
        assert mapped.nullable is True, (
            f"{col} 이 nullable 이 아니다 — 기존 행이 NULL 로 남아야 순환 최우선이 된다"
        )
