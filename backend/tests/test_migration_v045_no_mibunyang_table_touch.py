"""V045 마이그레이션 mibunyang 테이블 무변경 가드 (이슈 #323 P0 재발방지).

목적: V045 는 오피스텔 청약 전용 테이블(officetel_presale_schedule/
officetel_unit_supply)을 신설해, 기존 아파트 청약 테이블(presale_schedule_official/
applyhome_unit_supply)과 apartments 로스터에 오피스텔 house_manage_no 를 끼워 넣던
방식을 대체한다. mibunyang 이 소유·전제하는 이 세 테이블의 무결성 가정을 절대
건드리지 않아야 하므로, 마이그 SQL 텍스트에 이 세 테이블명이 등장하지 않는지
검사한다(ALTER/DROP 은 물론 어떤 형태의 참조도 금지).

설계(test_migration_v031_anon_lock.py 패턴 답습): 라이브 RLS/DDL 은 SQLite CI 로
검증 불가능하므로(domain-mapping-ssot.md 룰3 dialect 함정) 마이그 SQL '텍스트'를
자산으로 검사한다.
"""

from pathlib import Path

import pytest

_MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "db" / "migrations"
_V045 = _MIGRATIONS_DIR / "V045__officetel_presale_own_table.sql"

# V045 가 절대 건드리면 안 되는 mibunyang/기존 아파트 청약 테이블명.
FORBIDDEN_TABLE_NAMES = [
    "presale_schedule_official",
    "applyhome_unit_supply",
    "apartments",
]


@pytest.fixture(scope="module")
def v045_sql() -> str:
    assert _V045.exists(), f"V045 마이그레이션 파일 부재: {_V045}"
    return _V045.read_text(encoding="utf-8")


def _strip_comments(sql: str) -> str:
    """`--` 줄 주석과 `COMMENT ON ... ;` 문 전체를 제외한 실행문 텍스트만 남긴다.

    이 파일 상단의 "이 테이블은 안 건드립니다" 설명 주석과, COMMENT ON 문의
    설명 문자열 리터럴(여러 줄에 걸쳐 세미콜론까지 이어짐)이 금지 테이블명을
    정상적으로 언급하므로, 통째로 substring 검사하면 자기 자신이 오탐으로
    실패한다 — 실제 실행문(CREATE/ALTER/DROP 등)만 검사 대상으로 좁힌다.
    """
    lines = []
    in_comment_on = False
    for line in sql.splitlines():
        stripped = line.strip()
        if in_comment_on:
            # COMMENT ON 문의 진짜 종료는 "닫는 작은따옴표 바로 뒤의 세미콜론"(`';`)
            # 뿐이다. 문자열 리터럴 설명 텍스트 안에 우연히 세미콜론만 있는 줄
            # (예: "text\nALTER TABLE apartments...;\nmore text';")은 여기서
            # 걸리지 않아야 in_comment_on 이 조기에 풀리지 않는다.
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


def test_v045_does_not_mention_mibunyang_apartment_tables(v045_sql):
    """V045 SQL 실행문(주석 제외)에 presale_schedule_official/applyhome_unit_supply/
    apartments 문자열이 전혀 등장하지 않는지 확인 (mibunyang 무결성 전제 보존 가드)."""
    executable_sql = _strip_comments(v045_sql)
    for table in FORBIDDEN_TABLE_NAMES:
        assert table not in executable_sql, (
            f"V045 실행문에 '{table}' 문자열이 등장함 — mibunyang/아파트 청약 테이블을 "
            f"건드리면 안 된다(ALTER/DROP 없이 완전 독립 신규 테이블만 생성해야 함)."
        )


def test_v045_creates_two_new_officetel_tables(v045_sql):
    """V045 가 officetel_presale_schedule/officetel_unit_supply 를 신설하는지."""
    assert "CREATE TABLE IF NOT EXISTS officetel_presale_schedule" in v045_sql
    assert "CREATE TABLE IF NOT EXISTS officetel_unit_supply" in v045_sql


def test_v045_officetel_unit_supply_has_real_api_columns(v045_sql):
    """2026-08-10 재설계 — 오피스텔 API(getUrbtyOfctlLttotPblancMdl)가 실제로 주는
    필드(supply_area/supply_hshldco/supply_amount/subscrpt_reqst_amount)로 구성되는지.
    처음 만들었던 general_supply/special_supply/special_by_type(아파트 청약 틀 복사,
    오피스텔 API가 절대 안 주는 값)은 실행문(주석 제외)에서 제거됐다 — 설명 주석에서는
    "왜 뺐는지" 서술상 옛 이름이 등장하므로 _strip_comments() 로 실행문만 검사한다.
    """
    executable_sql = _strip_comments(v045_sql)
    for column in ["supply_area", "supply_hshldco", "supply_amount", "subscrpt_reqst_amount"]:
        assert column in executable_sql, f"V045 officetel_unit_supply 에 '{column}' 컬럼 누락"
    for removed in ["general_supply", "special_supply", "special_by_type"]:
        assert removed not in executable_sql, (
            f"V045 officetel_unit_supply 실행문에 죽은 컬럼 '{removed}' 이 남아있음 — "
            "오피스텔 API는 이 필드를 절대 주지 않는다(재설계로 제거 대상)."
        )


def test_v045_officetel_presale_schedule_has_region_name(v045_sql):
    """SUBSCRPT_AREA_CODE_NM(청약 지역명) 을 저장할 region_name 컬럼이 있는지 —
    지역 필터 로직 자체는 미구현(dead parameter), 데이터 적재만 이번 리뉴얼 범위."""
    assert "region_name" in v045_sql


def test_v045_house_nm_not_null(v045_sql):
    """house_nm 은 NOT NULL (실제 API 응답 3건 표본 전부 값 존재, 실측 완료)."""
    assert "house_nm TEXT NOT NULL" in v045_sql


def test_v045_officetel_unit_supply_no_apartments_fk(v045_sql):
    """officetel_unit_supply 는 officetel_presale_schedule 하나만 참조,
    apartments 와는 무관해야 한다(FK 없음)."""
    assert "REFERENCES officetel_presale_schedule(house_manage_no)" in v045_sql
    assert "REFERENCES apartments" not in v045_sql


def test_v045_notifies_postgrest_reload(v045_sql):
    """정책 변경 즉시 반영을 위한 PostgREST 스키마 리로드 NOTIFY 포함."""
    assert "NOTIFY pgrst, 'reload schema';" in v045_sql


def test_strip_comments_does_not_leak_string_literal_text_as_executable_sql():
    """COMMENT ON 문자열 리터럴 내부에 세미콜론이 있으면(설명 텍스트 우연 포함), 옛
    구현은 그 세미콜론에서 in_comment_on 이 조기에 풀려 **아직 안 닫힌 문자열 리터럴
    내부 텍스트**(`DROP TABLE presale_schedule_official;` 등)를 실행문으로 오인해
    결과에 새어 들어가게 했다 — 실제로는 실행되지 않는 텍스트가 위험한 실행 SQL 인
    것처럼 검사 결과에 섞이는 오탐이었다. 문자열 리터럴은 닫는 따옴표+세미콜론(`';`)
    으로 끝나는 줄에서만 종료돼야 하고, 리터럴 내부 텍스트는 결과에 전혀 남으면 안
    되며, 리터럴이 완전히 끝난 뒤의 진짜 실행문(CREATE TABLE 등)은 정상 검사돼야
    한다."""
    sql = (
        "COMMENT ON TABLE x IS 'text\n"
        "ALTER TABLE apartments DROP COLUMN id;\n"
        "DROP TABLE presale_schedule_official;\n"
        "more text';\n"
        "CREATE TABLE IF NOT EXISTS officetel_presale_schedule (id INT);\n"
    )
    executable_sql = _strip_comments(sql)
    assert "ALTER TABLE apartments" not in executable_sql, (
        "문자열 리터럴 내부의 텍스트가 실행문으로 새어 나옴 (아직 리터럴이 안 닫혔는데 "
        "in_comment_on 이 조기에 풀린 옛 결함이 재발)"
    )
    assert "DROP TABLE presale_schedule_official" not in executable_sql, (
        "문자열 리터럴 내부의 텍스트가 실행문으로 새어 나옴 — 옛 구현은 이 줄을 "
        "위험한 실행 SQL 로 오탐했다"
    )
    assert "CREATE TABLE IF NOT EXISTS officetel_presale_schedule" in executable_sql, (
        "문자열 리터럴이 완전히 닫힌 뒤의 진짜 실행문은 정상적으로 검사 대상에 남아야 함"
    )
