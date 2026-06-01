"""V031 마이그레이션 자산 가드 (CI 회귀).

목적: V031 은 공유 4테이블(articles/complexes/trades/complex_price_history)의 anon·
authenticated REST 노출을 차단한다. 그러나 CI 엔진은 file-based SQLite(conftest.py)라
RLS/role/GRANT/`SET ROLE` 을 실행할 수 없어 라이브 정책을 단위테스트로 검증 못 한다
(domain-mapping-ssot.md 룰3 dialect 함정). 그래서 마이그 SQL '텍스트'를 자산으로 검사해
"4테이블 × 차단 SQL 누락"을 commit 마다 막는다. 라이브 실제 차단은
backend/db/maintenance/verify_anon_shared_locked.sql 수동 smoke 로 별도 검증.

설계 (test_mb_schema_sync.py 패턴 답습):
- 정규식 최소화 — 테이블/role 조합을 명시 리스트로 두고 각 줄이 SQL 에 있는지 정확 매칭.
- V007 원본 정책명과 V031 DROP 대상의 drift 가드 — V007 이 만든 정책을 V031 이 빠짐없이
  DROP 하는지 교차 확인 (정책명 손글씨 drift 차단).
"""

from pathlib import Path

import pytest

_MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "db" / "migrations"
_V031 = _MIGRATIONS_DIR / "V031__revoke_anon_shared_tables.sql"

# 차단 대상 공유 테이블 (trades "Service write" cmd=ALL 은 service_role 의도라 미대상)
SHARED_TABLES = ["articles", "complexes", "trades", "complex_price_history"]

# 라이브 실측(2026-06-02)으로 확정한 anon SELECT permissive 정책명 (테이블 → 정책명)
ANON_SELECT_POLICIES = {
    "articles": "anon_read_articles",
    "complexes": "anon_read_complexes",
    "complex_price_history": "anon_read_complex_price_history",
    "trades": '"Public read"',
}


@pytest.fixture(scope="module")
def v031_sql() -> str:
    assert _V031.exists(), f"V031 마이그레이션 파일 부재: {_V031}"
    return _V031.read_text(encoding="utf-8")


def _norm(s: str) -> str:
    """공백 1칸으로 정규화 (정렬 공백·줄바꿈 무관 매칭)."""
    return " ".join(s.split())


def test_v031_revokes_select_from_anon_and_authenticated(v031_sql):
    """4테이블 각각 SELECT GRANT 를 anon·authenticated 양쪽에서 REVOKE 하는지 (이중 빗장)."""
    norm = _norm(v031_sql)
    for table in SHARED_TABLES:
        expected = _norm(f"REVOKE SELECT ON public.{table} FROM anon, authenticated;")
        assert expected in norm, (
            f"V031 에 '{table}' SELECT REVOKE 누락 — anon REST 노출 차단의 이중 빗장. "
            f"기대 줄: {expected}"
        )


def test_v031_revokes_write_grants(v031_sql):
    """4테이블 각각 과잉 쓰기 GRANT(INSERT/UPDATE/DELETE/TRUNCATE) 를 회수하는지."""
    norm = _norm(v031_sql)
    for table in SHARED_TABLES:
        expected = _norm(
            f"REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.{table} FROM anon, authenticated;"
        )
        assert expected in norm, (
            f"V031 에 '{table}' 쓰기 GRANT REVOKE 누락. 기대 줄: {expected}"
        )


def test_v031_drops_all_anon_select_policies(v031_sql):
    """라이브 실측 anon SELECT 정책 4건을 빠짐없이 DROP 하는지 (정책명 drift 가드)."""
    norm = _norm(v031_sql)
    for table, policy in ANON_SELECT_POLICIES.items():
        expected = _norm(f"DROP POLICY IF EXISTS {policy} ON public.{table};")
        assert expected in norm, (
            f"V031 이 '{table}' 의 anon 정책 {policy} 를 DROP 하지 않음. "
            f"permissive 정책 누락 시 OR 결합으로 노출 잔존. 기대 줄: {expected}"
        )


def test_v031_drop_targets_match_v007_origin(v031_sql):
    """V007(원본) 이 만든 anon 정책을 V031 이 전부 DROP 하는지 교차 확인 (drift 가드).

    V007 은 complexes/articles 의 anon_read_* 정책을 CREATE 한다. 이 둘이 V031 DROP
    대상에서 빠지면 노출이 살아남는다. (complex_price_history/trades 는 mibunyang 생성분이라
    V007 에 없으나 ANON_SELECT_POLICIES 로 별도 가드.)
    """
    v007 = (_MIGRATIONS_DIR / "V007__shared_columns.sql").read_text(encoding="utf-8")
    norm_v031 = _norm(v031_sql)
    # V007 이 CREATE POLICY 한 (정책명, 테이블) 을 단순 추출
    for line in v007.splitlines():
        ls = line.strip()
        if ls.upper().startswith("CREATE POLICY"):
            # 형식: CREATE POLICY <name> ON <table> FOR SELECT ...
            parts = ls.split()
            name, table = parts[2], parts[4]
            expected = _norm(f"DROP POLICY IF EXISTS {name} ON public.{table};")
            assert expected in norm_v031, (
                f"V007 이 만든 정책 {name} (on {table}) 를 V031 이 DROP 안 함 — drift. "
                f"기대 줄: {expected}"
            )


def test_v031_notifies_postgrest_reload(v031_sql):
    """정책/권한 변경 즉시 반영을 위한 PostgREST 스키마 리로드 NOTIFY 포함."""
    assert _norm("NOTIFY pgrst, 'reload schema';") in _norm(v031_sql), (
        "V031 에 NOTIFY pgrst, 'reload schema' 누락 — PostgREST 캐시가 옛 정책 유지 가능."
    )


def test_v031_keeps_rls_enabled(v031_sql):
    """RLS 를 DISABLE 하지 않는지 (V007 의 ENABLE 상태 유지가 의도)."""
    norm = _norm(v031_sql).upper()
    assert "DISABLE ROW LEVEL SECURITY" not in norm, (
        "V031 이 RLS 를 DISABLE 함 — 정책 DROP + GRANT REVOKE 만 해야 하고 RLS 는 켜둬야 함."
    )
