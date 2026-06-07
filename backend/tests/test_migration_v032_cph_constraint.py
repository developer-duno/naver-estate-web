"""V032 migration text-asset guard (session 280).

complex_price_history constraint-name alignment migration. PostgreSQL-only SQL
(DO block) so SQLite test engine can't execute it -- like the V031 guard, this
validates the migration file content as text.

Core invariant: the constraint name the code uses in ON CONFLICT must equal the
constraint name V032 guarantees (if either side changes, prod ON CONFLICT breaks).
"""

from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
_V032 = _BACKEND / "db" / "migrations" / "V032__cph_constraint_name_align.sql"
_SERVICE_COMMON = _BACKEND / "crawler" / "service_common.py"


def _read(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def test_v032_file_exists():
    """V032 migration file exists."""
    assert _V032.exists(), "V032 migration file missing"


def test_v032_matches_code_constraint_name():
    """V032's guaranteed constraint name == code's ON CONFLICT constraint name."""
    code = _read(_SERVICE_COMMON)
    assert 'constraint="complex_price_history_upsert_key"' in code, (
        "code ON CONFLICT constraint name changed -- sync with V032"
    )
    sql = _read(_V032)
    assert "ADD CONSTRAINT complex_price_history_upsert_key" in sql
    assert "DROP CONSTRAINT IF EXISTS uq_cph_composite" in sql


def test_v032_definition_is_simple_4col_unique():
    """V032 constraint def == prod-measured simple 4-col UNIQUE (no COALESCE)."""
    sql = _read(_V032)
    assert "UNIQUE (complex_no, trade_type, area_no, base_month)" in sql
    add_section = sql.split("ADD CONSTRAINT complex_price_history_upsert_key")[1]
    add_line = add_section.split(";")[0]
    assert "COALESCE" not in add_line, "COALESCE in ADD def would re-drift from prod"


def test_v032_idempotent_guards():
    """Idempotent guards (IF EXISTS / IF NOT EXISTS) so prod run is a no-op."""
    sql = _read(_V032)
    assert "DROP CONSTRAINT IF EXISTS" in sql
    assert "IF NOT EXISTS" in sql
