"""공동주택 공시가격 기반(PR-A1) 회귀 테스트 — V044 테이블 + _do_upsert 복합키 확장.

검증 대상 4가지:
  1. ComplexOfficialPrice ORM 모델이 conftest create_all 로 생성되고 저장·조회된다 (SQLite 호환).
  2. _do_upsert 가 복합 키(list) 를 받아 멱등하게 동작한다 — 같은 (단지, 연도, 전용면적)
     2회 upsert 시 행이 늘지 않고 값만 갱신.
  3. 기존 호출처(단일 PK 문자열) 경로가 확장 후에도 그대로 동작한다 (하위호환).
  4. 이름 2차 매칭(PR-E3) 매처 — alt 정규화 + (a)완전일치·(b)부분포함 + 3중 안전장치.
"""

from decimal import Decimal
from pathlib import Path

import pytest

from crawler.service_official_price import (
    _group_by_aphus,
    _normalize_alt,
    match_complex_group,
    match_complex_group_secondary,
    normalize_complex_name,
)
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


# ── 4. 이름 2차 매칭 (PR-E3) ──
#
# 1차는 정규화 이름 **완전일치**라, 표기가 조금만 달라도 놓친다(세션 371 표본조사 확정:
# ~413단지). 2차는 그 셋만 흡수하되 안전장치(세대수 게이트·후보 유일성·claimed 제외)는
# 1차와 똑같이 3중으로 건다 — 세금값이라 "틀린 값 < 값 없음" 원칙 유지.
#
# fixture 설계(testing.md 세션 372 답습): 세대수와 후보 수가 우연히 같은 값이 되지 않게
# 세대수는 40·60 등을 쓰고 후보 수는 1~2개로 둔다 — 두 축이 섞여 단위 오류를 은폐하지
# 않도록.


def _alt_rows(*, aphus_code, aphus_nm, ho_count):
    """공시 행 묶음 — 호수(=유니크 (dongNm,hoNm) 수)가 세대수 게이트의 분자가 된다."""
    return [
        {
            "aphusCode": aphus_code,
            "aphusNm": aphus_nm,
            "dongNm": "101",
            "hoNm": str(1000 + i),
            "prvuseAr": "84.43",
            "pblntfPc": str(500_000_000 + i * 10_000),
            "stdrMt": "01",
            "stdrYear": "2026",
        }
        for i in range(ho_count)
    ]


def _by_name(*specs):
    """공시 행들 → 1차 색인({정규화이름: [(code, group)]}) — 2차 매처의 입력 형식."""
    rows = []
    for aphus_code, aphus_nm, ho_count in specs:
        rows += _alt_rows(aphus_code=aphus_code, aphus_nm=aphus_nm, ho_count=ho_count)
    index: dict = {}
    for code, group in _group_by_aphus(rows).items():
        index.setdefault(normalize_complex_name(group["name"]), []).append((code, group))
    return index


def test_secondary_matches_paren_danji_to_chasu():
    """공시 "성서주공(2단지)" ↔ 우리 "성서주공2차" — 1차가 괄호로 잃은 차수를 2차가 살린다.

    1차는 괄호를 통째로 지워 "성서주공" 이 되므로 우리 "성서주공2차" 와 키가 어긋난다.
    """
    by_name = _by_name(("P1", "성서주공(2단지)", 40))

    assert match_complex_group("성서주공2차", 40, by_name) is None, (
        "1차가 이미 매칭하면 이 테스트는 2차를 검증하지 못한다"
    )
    hit = match_complex_group_secondary("성서주공2차", 40, by_name, set())
    assert hit is not None
    assert hit[0] == "P1"


def test_secondary_matches_sangga_suffix():
    """공시 "광동상가" ↔ 우리 "광동" — 꼬리 "상가" 를 떼면 같은 이름."""
    by_name = _by_name(("P2", "광동상가", 60))

    assert match_complex_group("광동", 60, by_name) is None
    hit = match_complex_group_secondary("광동", 60, by_name, set())
    assert hit is not None
    assert hit[0] == "P2"


def test_secondary_matches_dong_prefix_by_partial_containment():
    """우리 "신당한화꿈에그린" ↔ 공시 "한화꿈에그린" — 동명 프리픽스를 부분포함으로 회수."""
    by_name = _by_name(("P3", "한화꿈에그린", 45))

    assert match_complex_group("신당한화꿈에그린", 45, by_name) is None
    hit = match_complex_group_secondary("신당한화꿈에그린", 45, by_name, set())
    assert hit is not None
    assert hit[0] == "P3"


def test_secondary_discards_ambiguous_exact_without_falling_back_to_partial():
    """(a) alt 완전일치 후보가 2개면 폐기 — (b) 부분포함으로 되풀지 않는다.

    되풀면 "완전일치에서도 모호했던 것"을 더 느슨한 규칙으로 억지 선택하게 되어
    오매칭을 스스로 부른다.

    ⚠ fixture 는 **3글자 이상 키**여야 한다(적대검증 검증A 적발) — 2글자 키("광동")면
    모호폐기 가드를 지워도 (b)의 길이 가드(_PARTIAL_MIN_LEN)가 대신 막아 뮤테이션이
    무감지된다. 여기서는 키가 "성서주공"(4글자)이라 길이 가드가 개입하지 않고,
    canary(잉여 "타운" = 무숫자·게이트 통과)가 (b)에 진입했다면 유일 후보로 채택돼
    None 이 아니게 된다 — 그 차이로 폴백 여부를 실제로 판별한다.
    """
    by_name = _by_name(
        ("P4", "성서주공상가", 50),   # alt = "성서주공"
        ("P5", "성서주공", 50),       # alt = "성서주공" (동일 → 완전일치 후보 2개)
        ("P9", "성서주공타운", 50),   # alt = "성서주공타운" — (b) 진입 시 채택될 canary
    )

    assert match_complex_group_secondary("성서주공", 50, by_name, set()) is None


def test_secondary_respects_household_gate():
    """이름이 맞아도 세대수 ±5% 밖이면 매칭하지 않는다 — 1차와 같은 게이트."""
    by_name = _by_name(("P6", "성서주공(2단지)", 40))

    # 40 vs 60 = 비율 0.67 → 게이트 탈락
    assert match_complex_group_secondary("성서주공2차", 60, by_name, set()) is None
    # 같은 데이터라도 세대수가 맞으면 매칭된다 (게이트 외 다른 이유로 실패한 게 아님을 확인)
    assert match_complex_group_secondary("성서주공2차", 40, by_name, set()) is not None


def test_secondary_excludes_claimed_group():
    """이미 다른 단지가 1차로 가져간 공시 그룹은 2차가 재사용하지 않는다 (claimed 제외).

    같은 그룹을 두 단지에 붙이면 한쪽은 반드시 오매칭이다.
    """
    by_name = _by_name(("P7", "광동상가", 60))

    assert match_complex_group_secondary("광동", 60, by_name, set()) is not None
    assert match_complex_group_secondary("광동", 60, by_name, {"P7"}) is None


def test_secondary_partial_requires_min_length():
    """부분포함은 짧은 쪽이 3글자 미만이면 폐기 — 2글자는 아무 이름에나 걸린다.

    우리 이름 "동아" (2글자)가 공시 "동아산업" 에 부분포함되지만, 이 정도 길이를
    허용하면 전국의 무관한 단지들이 서로 걸려 오매칭이 폭발한다.
    """
    by_name = _by_name(("P8", "동아산업", 55))

    assert match_complex_group_secondary("동아", 55, by_name, set()) is None


def test_secondary_partial_respects_household_gate():
    """(b) 부분포함도 세대수 게이트를 그대로 받는다 — 이름만 겹친다고 붙이지 않는다.

    (a)의 게이트는 test_secondary_respects_household_gate 가 커버하므로, 여기서는
    (b) 경로에 게이트가 실제로 걸려 있는지를 따로 못박는다.
    """
    by_name = _by_name(("Q1", "한화꿈에그린", 45))

    # 45 vs 70 = 비율 0.64 → 게이트 탈락
    assert match_complex_group_secondary("신당한화꿈에그린", 70, by_name, set()) is None
    # 세대수가 맞으면 붙는다 (게이트 외 다른 이유로 실패한 게 아님을 확인)
    assert match_complex_group_secondary("신당한화꿈에그린", 45, by_name, set()) is not None


def test_secondary_partial_discards_multiple_candidates():
    """(b) 부분포함 후보가 2개면 폐기 — 유일성은 (b)에서도 지켜진다.

    key="신당한화꿈에그린" 기준으로 공시 "한화꿈에그린"(⊂ key)과
    "신당한화꿈에그린힐"(⊃ key)이 양방향으로 각각 성립해 후보가 2개가 된다.
    둘 다 잉여가 무숫자라 형제 배제에도 안 걸리므로, 순수하게 유일성만 검증한다.
    """
    by_name = _by_name(
        ("Q2", "한화꿈에그린", 45),
        ("Q3", "신당한화꿈에그린힐", 45),
    )

    assert match_complex_group_secondary("신당한화꿈에그린", 45, by_name, set()) is None


def test_secondary_partial_excludes_claimed_group():
    """(b) 부분포함 유일 후보가 claimed 면 폐기 — claimed 제외도 (b)에 적용된다."""
    by_name = _by_name(("Q4", "한화꿈에그린", 45))

    assert match_complex_group_secondary("신당한화꿈에그린", 45, by_name, set()) is not None
    assert match_complex_group_secondary("신당한화꿈에그린", 45, by_name, {"Q4"}) is None


def test_secondary_partial_rejects_sibling_chasu():
    """형제 흡수 차단 — 잉여가 숫자면 같은 단지가 아니라 차수 형제다 (HIGH-1 회귀핀).

    우리 "현대홈타운" 과 공시 "현대홈타운2차" 는 부분포함이 성립하고 세대수도 통과하지만,
    잉여 "2차" 는 표기 차이가 아니라 **다른 단지**를 가리키는 신호다. 허용하면 1차 단지가
    2차 단지의 공시가격을 받아가는 오매칭이 된다(세금값이라 치명적).
    """
    by_name = _by_name(("R1", "현대홈타운2차", 50))

    assert match_complex_group_secondary("현대홈타운", 50, by_name, set()) is None


def test_secondary_blocks_partial_when_exact_key_exists_but_gate_failed():
    """드리프트 흘러내림 차단 — 완전일치 키가 있으면 게이트 탈락이어도 (b) 진입 금지 (HIGH-1 회귀핀).

    공시 "삼성래미안"(우리와 이름 완전일치)이 V-WORLD 페이지 드리프트로 호수가 모자라
    게이트에서 탈락한 상황이다. 이때 (b)로 흘러내리면 "삼성래미안타운"(잉여 무숫자·게이트
    통과)이 유일 후보로 채택돼, **드리프트로 인한 미스가 오매칭으로 변환**된다.
    정답은 None — 이번 달은 미스로 두고 재수집·다음 달에 구제한다.
    """
    by_name = _by_name(
        ("R2", "삼성래미안", 30),      # 이름 완전일치 짝. 세대수 50 대비 0.6 → 게이트 탈락
        ("R3", "삼성래미안타운", 50),  # (b) 진입 시 채택될 미끼 (잉여 "타운" 무숫자)
    )

    assert match_complex_group_secondary("삼성래미안", 50, by_name, set()) is None


def test_secondary_blocks_partial_when_exact_key_exists_but_claimed():
    """완전일치 짝이 claimed 로 전멸한 경우도 (b) 진입 금지 — 같은 규칙의 다른 진입로."""
    by_name = _by_name(
        ("R4", "삼성래미안", 50),      # 이름 완전일치 짝 (게이트는 통과하나 이미 선점)
        ("R5", "삼성래미안타운", 50),  # (b) 진입 시 채택될 미끼
    )

    assert match_complex_group_secondary("삼성래미안", 50, by_name, {"R4"}) is None


def test_primary_matching_is_unchanged_by_secondary():
    """1차 매칭 동작은 2차 도입과 무관하게 그대로다 (기존 26,307개 회귀 위험 0).

    1차가 잡는 케이스는 여전히 1차가 잡고, 정규화 결과도 그대로여야 한다.
    """
    by_name = _by_name(("P0", "은마아파트", 40))

    hit = match_complex_group("은마", 40, by_name)
    assert hit is not None and hit[0] == "P0"
    # 1차 정규화가 alt 규칙(괄호 차수 보존·상가 제거)에 오염되지 않았는지 직접 확인
    assert normalize_complex_name("성서주공(2단지)") == "성서주공"
    assert normalize_complex_name("광동상가") == "광동상가"
    assert _normalize_alt("성서주공(2단지)") == "성서주공2차"
    assert _normalize_alt("광동상가") == "광동"
