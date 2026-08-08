"""공동주택 공시가격 기반(PR-A1) 회귀 테스트 — V044 테이블 + _do_upsert 복합키 확장.

검증 대상 3가지:
  1. ComplexOfficialPrice ORM 모델이 conftest create_all 로 생성되고 저장·조회된다 (SQLite 호환).
  2. _do_upsert 가 복합 키(list) 를 받아 멱등하게 동작한다 — 같은 (단지, 연도, 전용면적)
     2회 upsert 시 행이 늘지 않고 값만 갱신.
  3. 기존 호출처(단일 PK 문자열) 경로가 확장 후에도 그대로 동작한다 (하위호환).
"""

from decimal import Decimal
from pathlib import Path

import pytest

from db.models import Complex, ComplexOfficialPrice
from services.upsert import _do_upsert

_V044 = Path(__file__).resolve().parent.parent / "db" / "migrations" / "V044__complex_official_prices.sql"


@pytest.fixture
def seeded_complex(db):
    """FK 대상 단지 1행 선생성 — 공시가격 행은 실재하는 complex_no 로만 넣는다."""
    db.add(Complex(complex_no="C1", complex_name="은마아파트", cortar_no="1168010600"))
    db.commit()
    return "C1"


def _price_values(complex_no: str, *, area="84.43", median=2_702_000_000, ho=3461):
    """공시가격 upsert 값 팩토리 — 테스트마다 하드코딩하지 않도록."""
    return {
        "complex_no": complex_no,
        "stdr_year": "2026",
        "prvuse_ar": Decimal(area),
        "price_median": median,
        "ho_count": ho,
        "aphus_code": "A123",
        "aphus_nm": "은마아파트",
    }


# ── 1. 모델 생성·조회 ──

def test_official_price_model_insert_and_query(db, seeded_complex):
    """ORM 모델로 저장한 공시가격 행이 그대로 조회된다."""
    db.add(ComplexOfficialPrice(**_price_values(seeded_complex)))
    db.commit()

    row = db.query(ComplexOfficialPrice).one()
    assert row.complex_no == "C1"
    assert row.stdr_year == "2026"
    assert Decimal(str(row.prvuse_ar)) == Decimal("84.43")
    assert row.price_median == 2_702_000_000  # BigInteger — 21억 초과값 저장 확인
    assert row.ho_count == 3461
    assert row.collected_at is not None  # default=utcnow 자동 채움


def test_official_price_fk_targets_complexes():
    """complex_no 는 complexes.complex_no 를 참조한다 (FK 선언 메타데이터 검증).

    conftest SQLite 엔진은 PRAGMA foreign_keys 를 켜지 않아 위반이 런타임 에러로
    드러나지 않는다 → 제약 위반 대신 **FK 선언 자체**를 메타데이터로 검증한다
    (prod PostgreSQL 에서 실제 강제되는 것은 V044 SQL 의 REFERENCES).
    """
    fks = ComplexOfficialPrice.__table__.c.complex_no.foreign_keys
    assert {fk.target_fullname for fk in fks} == {"complexes.complex_no"}


def test_v044_migration_declares_same_constraint_name():
    """V044 SQL 의 UNIQUE 제약명이 ORM/_do_upsert 가 기대하는 이름과 같다."""
    sql = _V044.read_text(encoding="utf-8")
    assert "CONSTRAINT complex_official_prices_key UNIQUE (complex_no, stdr_year, prvuse_ar)" in sql
    assert "CREATE TABLE IF NOT EXISTS complex_official_prices" in sql
    assert "ENABLE ROW LEVEL SECURITY" in sql
    # 이중 빗장: GRANT 회수 조항이 반드시 있어야 한다 (V031 답습)
    assert "REVOKE ALL ON public.complex_official_prices FROM anon, authenticated" in sql
    # anon read 개방 정책은 이름과 무관하게 없어야 한다 (FastAPI 경유만)
    assert "USING (true)" not in sql
    assert "Public read" not in sql


# ── 2. _do_upsert 복합키 멱등성 ──

def test_do_upsert_composite_key_is_idempotent(db, seeded_complex):
    """같은 (complex_no, stdr_year, prvuse_ar) 로 2회 upsert → 1행 유지 + 값 갱신."""
    key = ["complex_no", "stdr_year", "prvuse_ar"]

    _do_upsert(db, ComplexOfficialPrice, _price_values(seeded_complex), key)
    db.commit()

    # 같은 키 + 다른 값으로 재수집
    _do_upsert(
        db,
        ComplexOfficialPrice,
        _price_values(seeded_complex, median=2_800_000_000, ho=3470),
        key,
    )
    db.commit()

    rows = db.query(ComplexOfficialPrice).all()
    assert len(rows) == 1, "복합 키 충돌인데 행이 늘었다 = ON CONFLICT 미동작"
    assert rows[0].price_median == 2_800_000_000
    assert rows[0].ho_count == 3470


def test_do_upsert_composite_key_distinguishes_area(db, seeded_complex):
    """전용면적이 다르면 별개 행으로 쌓인다 (키의 세 번째 축이 실제로 작동)."""
    key = ["complex_no", "stdr_year", "prvuse_ar"]

    _do_upsert(db, ComplexOfficialPrice, _price_values(seeded_complex, area="84.43"), key)
    _do_upsert(db, ComplexOfficialPrice, _price_values(seeded_complex, area="76.79"), key)
    db.commit()

    assert db.query(ComplexOfficialPrice).count() == 2


# ── 3. 단일 PK 문자열 하위호환 ──

def test_do_upsert_single_str_pk_still_works(db):
    """기존 호출처(pk_col 이 문자열) 경로가 확장 후에도 그대로 동작한다."""
    values = {"complex_no": "C9", "complex_name": "테스트단지", "cortar_no": "1111010100"}
    _do_upsert(db, Complex, values, "complex_no")
    db.commit()

    # 같은 PK 로 이름만 바꿔 재upsert → 1행 유지 + 갱신
    _do_upsert(db, Complex, {**values, "complex_name": "이름변경단지"}, "complex_no")
    db.commit()

    rows = db.query(Complex).filter(Complex.complex_no == "C9").all()
    assert len(rows) == 1
    assert rows[0].complex_name == "이름변경단지"
