"""공유 DB 소유권 가드(scripts/audit_shared_db_ownership.py) 시험 — 세션 459.

가짜 정본(tmp_path) + 가짜 레포 트리(모델 미니판 포함)로 판정 ①~④·끄기·정본 형식 오류를 본다. 네트워크 0 · DB 0.
양성 대조군(upsert.py·enricher.py·env_crime.py 의 실제 꼴)은 등록돼 있으면 통과해야 한다.
"""

import json
import subprocess
import textwrap
from pathlib import Path

from scripts.audit_shared_db_ownership import FORMAT_CHANGED, check_migration_sql, main

MODELS = """
class Base:
    pass


class Complex(Base):
    __tablename__ = "complexes"


class Article(Base):
    __tablename__ = "articles"


class CrawlJob(Base):
    __tablename__ = "crawl_jobs"
"""

MB_MODELS = """
class Base:
    pass


class Apartment(Base):
    __tablename__ = "apartments"


class Infra(Base):
    __tablename__ = "infra"
"""

# 실제 꼴을 옮긴 양성 대조군 — services/upsert.py(pg_insert·articles 삭제) · services/enricher.py(.update({) ·
# crawler/env_crime.py(헬퍼가 준 Infra 행에 칸 대입) · crawler/env_emergency.py(Infra 생성 + db.add)
UPSERT = """
from sqlalchemy.dialects.postgresql import insert as pg_insert

from db.models import Article as ArticleModel
from db.models import Complex as ComplexModel


def _upsert(db, model, values):
    stmt = pg_insert(model).values(**values)
    db.execute(stmt)


def upsert_complex(db, complex_no):
    _upsert(db, ComplexModel, {"complex_no": complex_no, "complex_name": "단지"})


def delete_missing_articles(db, complex_no, seen_article_nos):
    db.query(ArticleModel).filter(
        ArticleModel.complex_no == complex_no,
        ~ArticleModel.article_no.in_(seen_article_nos),
    ).delete(synchronize_session=False)
"""

ENRICHER = """
from db.models import Complex as ComplexModel


def enrich(db, complex_no, addr):
    db.query(ComplexModel).filter(ComplexModel.complex_no == complex_no).update({
        "address": addr,
    })
"""

ENV_CRIME = """
from crawler.env_common import _prefetch_infra_map


def apply(db, apt_ids, result):
    infra_map = _prefetch_infra_map(db, apt_ids)
    for apt_id in apt_ids:
        infra = infra_map.get(apt_id)
        if not infra:
            continue
        infra.crime_score = result["crime_score"]
    db.commit()
"""

ENV_EMERGENCY = """
from db.mb_models import Apartment, Infra


def apply(db, rows):
    for apt in db.query(Apartment.id).all():
        infra = Infra(apartment_id=apt.id, emergency_hospital=rows[apt.id])
        db.add(infra)
    db.commit()
"""

# 2u 전용 표만 쓰고 공유 표는 읽기만 — 통과해야 한다(캐시 .delete(key) 도 행 삭제가 아니다)
JOBS = """
from db.models import Complex, CrawlJob


def run(db, cache):
    rows = db.query(Complex).all()
    db.add(CrawlJob(job_type="x", total_items=len(rows)))
    db.query(CrawlJob).filter(CrawlJob.status == "running").delete()
    cache("complexes").delete("complex_detail:1")
    db.commit()
"""


def _registry(**override) -> dict:
    reg = {
        "version": 1,
        "updated": "2026-10-09",
        "tables": {
            "complexes": {
                "owner": "shared",
                "readers": ["2u", "mibunyang"],
                "columns": {"key": ["complex_no"], "mibunyang": ["corridor_type"], "2u": ["address"], "contested": ["complex_name"]},
            },
            "articles": {"owner": "shared", "readers": ["2u", "mibunyang"], "columns": {"key": ["article_no"], "2u": ["tags"]}},
            "infra": {
                "owner": "shared",
                "readers": ["2u", "mibunyang"],
                "columns": {"key": ["apartment_id"], "mibunyang": ["hospital"], "2u": ["emergency_hospital", "crime_score"]},
            },
            "apartments": {"owner": "mibunyang", "readers": ["2u"]},
            "crawl_jobs": {"owner": "2u"},
        },
        "writers": {
            "mibunyang": {},
            "2u": {
                "backend/services/upsert.py": {"complexes": ["complex_name", "complex_no"], "articles": []},
                "backend/services/enricher.py": {"complexes": ["address"]},
                "backend/crawler/env_crime.py": {"infra": ["crime_score"]},
                "backend/crawler/env_emergency.py": {"infra": ["apartment_id", "emergency_hospital"]},
            },
        },
        "delete_allowed": {"mibunyang": {}, "2u": {"backend/services/upsert.py": ["articles"]}},
    }
    reg.update(override)
    return reg


def _write(root: Path, rel: str, text: str) -> None:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(textwrap.dedent(text).lstrip("\n"), encoding="utf-8")


def _tree(tmp_path: Path, registry: dict | None = None) -> tuple[Path, Path]:
    """양성 대조군만 있는 가짜 레포 + 정본 파일. (레포 루트, 정본 경로)"""
    root = tmp_path / "repo"
    _write(root, "backend/db/models.py", MODELS)
    _write(root, "backend/db/mb_models.py", MB_MODELS)
    _write(root, "backend/services/upsert.py", UPSERT)
    _write(root, "backend/services/enricher.py", ENRICHER)
    _write(root, "backend/crawler/env_crime.py", ENV_CRIME)
    _write(root, "backend/crawler/env_emergency.py", ENV_EMERGENCY)
    _write(root, "backend/crawler/jobs.py", JOBS)
    _write(root, "backend/tests/test_x.py", "def test_x(db):\n    db.query(Complex).delete()\n")  # 시험은 제외
    reg_path = tmp_path / "ownership.json"
    reg_path.write_text(json.dumps(registry or _registry(), ensure_ascii=False), encoding="utf-8")
    return root, reg_path


def _run(capsys, root: Path, reg_path: Path, *extra: str) -> tuple[int, str]:
    code = main(["--repo-root", str(root), "--registry", str(reg_path), *extra])
    return code, capsys.readouterr().out


def test_positive_controls_pass(tmp_path, capsys):
    """실제 꼴(pg_insert·.update({·행.칸 대입·Infra 생성)이 등록돼 있으면 🔴 0 · exit 0."""
    root, reg = _tree(tmp_path)
    code, out = _run(capsys, root, reg)
    assert code == 0, out
    assert "🔴 0 · 🟡 0 · 스캔 5파일 · 정본 version 1/2026-10-09" in out
    assert "④ 마이그 생략(--since 없음)" in out


def test_a_unregistered_pg_insert_is_red(tmp_path, capsys):
    """(a) 정본에 없는 파일이 pg_insert(Complex) → 🔴 ① 미등록 쓰기."""
    root, reg = _tree(tmp_path)
    _write(root, "backend/crawler/new_writer.py", """
        from sqlalchemy.dialects.postgresql import insert as pg_insert
        from db.models import Complex


        def save(db):
            db.execute(pg_insert(Complex).values(complex_no="1"))
    """)
    code, out = _run(capsys, root, reg)
    assert code == 1
    assert "| 🔴 ① | backend/crawler/new_writer.py:6 | complexes |" in out


def test_a_registered_for_other_table_only_is_red(tmp_path, capsys):
    """(a') 파일이 다른 표로만 등록돼 있어도 그 표 쓰기는 🔴."""
    reg_dict = _registry()
    reg_dict["writers"]["2u"]["backend/crawler/new_writer.py"] = {"crawl_jobs": ["*"]}
    root, reg = _tree(tmp_path, reg_dict)
    _write(root, "backend/crawler/new_writer.py", """
        from db.models import Complex, CrawlJob


        def save(db, no):
            db.add(CrawlJob(job_type="x"))
            db.query(Complex).filter(Complex.complex_no == no).update({"address": "a"})
    """)
    code, out = _run(capsys, root, reg)
    assert code == 1
    assert "| 🔴 ① | backend/crawler/new_writer.py:6 | complexes |" in out


def test_a_allow_marker_downgrades_only_without_direct_chain(tmp_path, capsys):
    """allow 주석은 표를 모르는 쓰기만 🟡 로 — 그 표에 직접 쓰는 사슬이 있으면 🔴 유지."""
    root, reg = _tree(tmp_path)
    _write(root, "backend/crawler/reader.py", """
        # ownership-guard: allow complexes 단지는 읽기만 — 쓰는 건 helper 가 준 행
        from db.models import Complex


        def run(db, obj):
            rows = db.query(Complex).all()
            db.add(obj)
            return rows
    """)
    code, out = _run(capsys, root, reg)
    assert code == 0, out
    assert "| 🟡 ① | backend/crawler/reader.py:7 | complexes |" in out
    _write(root, "backend/crawler/reader.py", """
        # ownership-guard: allow complexes 읽기만이라고 적었지만
        from sqlalchemy.dialects.postgresql import insert as pg_insert
        from db.models import Complex


        def run(db):
            db.execute(pg_insert(Complex).values(complex_no="1"))
    """)
    code, out = _run(capsys, root, reg)
    assert code == 1
    assert "| 🔴 ① | backend/crawler/reader.py:7 | complexes |" in out


def test_a_raw_sql_write_counts_without_model_name(tmp_path, capsys):
    """모델 이름 없이 text("UPDATE complexes SET …") 만 있어도 ① 미등록 쓰기."""
    root, reg = _tree(tmp_path)
    _write(root, "backend/scripts/raw.py", """
        from sqlalchemy import text


        def run(db):
            db.execute(text("UPDATE complexes SET address = :a WHERE complex_no = :n"), {"a": "x", "n": "1"})
    """)
    code, out = _run(capsys, root, reg)
    assert code == 1
    assert "| 🔴 ① | backend/scripts/raw.py:5 | complexes |" in out


def test_b_mibunyang_column_in_registered_file_is_red(tmp_path, capsys):
    """(b) 등록 파일에 미분양 칸 corridor_type= → 🔴 ② · emergency_hospital= 은 hospital 과 달라 통과."""
    root, reg = _tree(tmp_path)
    code, out = _run(capsys, root, reg)
    assert code == 0, out  # env_emergency 의 emergency_hospital= 은 미분양 칸 hospital 이 아니다
    extra = (
        "\n\ndef extra(db, complex_no):\n"
        '    values = dict(corridor_type="계단식")\n'
        "    db.query(ComplexModel).filter(ComplexModel.complex_no == complex_no).update(values)\n"
    )
    _write(root, "backend/services/enricher.py", ENRICHER + extra)
    code, out = _run(capsys, root, reg)
    assert code == 1
    assert "| 🔴 ② | backend/services/enricher.py:11 | complexes | 미분양 칸 쓰기 — complexes.corridor_type" in out


def test_b_attribute_assignment_of_mibunyang_column_is_red(tmp_path, capsys):
    """등록 파일(env_crime)에서 헬퍼가 준 Infra 행에 미분양 칸 대입(infra.hospital = …) → 🔴 ②."""
    root, reg = _tree(tmp_path)
    _write(root, "backend/crawler/env_crime.py", ENV_CRIME.replace(
        'infra.crime_score = result["crime_score"]',
        'infra.crime_score = result["crime_score"]\n        infra.hospital = result["h"]',
    ))
    code, out = _run(capsys, root, reg)
    assert code == 1
    assert "| 🔴 ② | backend/crawler/env_crime.py:11 | infra | 미분양 칸 쓰기 — infra.hospital" in out


def test_c_shared_table_delete_outside_allowed_is_red(tmp_path, capsys):
    """(c) db.query(Infra).delete() 가 delete_allowed 밖 → 🔴 ③ (allow 주석과 무관)."""
    reg_dict = _registry()
    reg_dict["writers"]["2u"]["backend/crawler/cleanup_infra.py"] = {"infra": ["emergency_hospital"]}
    root, reg = _tree(tmp_path, reg_dict)
    _write(root, "backend/crawler/cleanup_infra.py", """
        # ownership-guard: allow infra 지우는 게 아니라 정리일 뿐
        from db.mb_models import Infra


        def cleanup(db, apt_id):
            db.query(Infra).filter(Infra.apartment_id == apt_id).delete()
    """)
    code, out = _run(capsys, root, reg)
    assert code == 1
    assert "| 🔴 ③ | backend/crawler/cleanup_infra.py:6 | infra |" in out


def test_c_row_delete_resolved_through_loop_variable(tmp_path, capsys):
    """db.delete(행) — 행 변수가 Article 질의에서 왔으면 articles 삭제로 푼다(upsert.py 밖이면 🔴 ③)."""
    reg_dict = _registry()
    reg_dict["writers"]["2u"]["backend/crawler/purge.py"] = {"articles": []}
    root, reg = _tree(tmp_path, reg_dict)
    _write(root, "backend/crawler/purge.py", """
        from db.models import Article, CrawlJob


        def purge(db):
            stale = db.query(Article).filter(Article.is_active == False).all()
            for row in stale:
                db.delete(row)


        def purge_jobs(db):
            for row in db.query(CrawlJob).all():
                db.delete(row)
    """)
    code, out = _run(capsys, root, reg)
    assert code == 1
    assert "| 🔴 ③ | backend/crawler/purge.py:7 | articles |" in out
    assert "crawl_jobs" not in out  # 다른 함수의 같은 이름 row 는 섞지 않는다


def test_d_2u_only_table_delete_and_cache_delete_pass(tmp_path, capsys):
    """(d) Complex 를 읽기만 하고 CrawlJob 만 쓰고 지우는 미등록 파일 · 캐시 .delete(key) → 통과."""
    root, reg = _tree(tmp_path)  # JOBS 가 이미 들어 있다
    code, out = _run(capsys, root, reg)
    assert code == 0, out
    assert "jobs.py" not in out


def test_d_same_variable_name_in_other_function_is_not_mixed(tmp_path, capsys):
    """함수마다 변수 → 표를 따로 푼다 — 다른 함수에서 Infra 를 읽은 row 와 CrawlJob 을 지우는 row 를 섞지 않는다."""
    root, reg = _tree(tmp_path)
    _write(root, "backend/crawler/report.py", """
        from db.mb_models import Infra
        from db.models import CrawlJob


        def show(db):
            for row in db.query(Infra).all():
                print(row.apartment_id)


        def purge_jobs(db):
            for row in db.query(CrawlJob).all():
                db.delete(row)
    """)
    code, out = _run(capsys, root, reg)
    assert code == 0, out
    assert "report.py" not in out


def _git(root: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@example.com", "-C", str(root), *args],
        check=True, capture_output=True, text=True,
    ).stdout.strip()


def test_e_since_migration_drop_column_is_red(tmp_path, capsys):
    """(e) --since 이후 새 마이그에 공유 표 DROP COLUMN → 🔴 ④ · 기준 이전 마이그는 안 본다."""
    root, reg = _tree(tmp_path)
    _write(root, "backend/db/migrations/V001__old.sql", "ALTER TABLE complexes DROP COLUMN legacy_a;\n")
    _git(root, "init", "-q")
    _git(root, "add", "-A")
    _git(root, "commit", "-q", "-m", "base")
    base = _git(root, "rev-parse", "HEAD")
    code, out = _run(capsys, root, reg, "--since", base)
    assert code == 0, out
    assert f"④ 마이그 0개 검사(기준 {base})" in out
    _write(root, "backend/db/migrations/V002__drop.sql", "-- 주석\nALTER TABLE public.complexes\n  DROP COLUMN corridor_type;\n")
    _git(root, "add", "-A")
    _git(root, "commit", "-q", "-m", "drop")
    code, out = _run(capsys, root, reg, "--since", base)
    assert code == 1
    assert "| 🔴 ④ | backend/db/migrations/V002__drop.sql:2 | complexes |" in out
    assert "V001" not in out.split("④ 마이그")[0]


def test_e_since_bad_ref_is_red(tmp_path, capsys):
    """--since 기준을 못 풀면 조용히 넘기지 않고 🔴."""
    root, reg = _tree(tmp_path)
    _git(root, "init", "-q")
    code, out = _run(capsys, root, reg, "--since", "no-such-ref")
    assert code == 1
    assert "바뀐 마이그 목록을 못 구함" in out


def test_migration_sql_rules():
    """④ 규칙 단위 — 파괴적 변경은 보호 표만 🔴, 미분양 표 ADD COLUMN 은 🟡, 2u 전용 표는 무관."""
    reg = _registry()
    sql = """
    ALTER TABLE apartments ADD COLUMN x int;
    ALTER TABLE apartments RENAME TO apartments_old;
    ALTER TABLE infra RENAME hospital TO hosp;
    DROP TABLE IF EXISTS crawl_jobs, articles CASCADE;
    ALTER TABLE crawl_jobs DROP COLUMN y;
    /* ALTER TABLE complexes DROP COLUMN z; */
    """
    found = {(f.level, f.table) for f in check_migration_sql("m.sql", sql, reg)}
    assert found == {("yellow", "apartments"), ("red", "apartments"), ("red", "infra"), ("red", "articles")}


def test_f_registry_version_2_is_red(tmp_path, capsys):
    """(f) 정본 version 2 → exit 1 + '정본 형식이 바뀜' 문구(조용히 통과 금지)."""
    root, reg = _tree(tmp_path, _registry(version=2))
    code, out = _run(capsys, root, reg)
    assert code == 1
    assert "version 이 1 이 아님(2)" in out
    assert FORMAT_CHANGED in out


def test_f_registry_broken_json_is_red(tmp_path, capsys):
    """정본 JSON 이 깨져도 exit 1."""
    root, reg = _tree(tmp_path)
    reg.write_text("{not json", encoding="utf-8")
    code, out = _run(capsys, root, reg)
    assert code == 1
    assert FORMAT_CHANGED in out


def test_g_off_file_exits_zero(tmp_path, capsys):
    """(g) backend/.ownership-guard-off 가 있으면 정본이 깨져 있어도 판정 없이 exit 0."""
    root, reg = _tree(tmp_path, _registry(version=2))
    (root / "backend/.ownership-guard-off").write_text("", encoding="utf-8")
    code, out = _run(capsys, root, reg)
    assert code == 0
    assert "가드 꺼짐(backend/.ownership-guard-off)" in out


def test_missing_registered_file_is_yellow(tmp_path, capsys):
    """정본에 등록됐으나 레포에 없는 파일은 🟡(통과)."""
    reg_dict = _registry()
    reg_dict["writers"]["2u"]["backend/gone.py"] = {"crawl_jobs": ["*"]}
    root, reg = _tree(tmp_path, reg_dict)
    code, out = _run(capsys, root, reg)
    assert code == 0
    assert "| 🟡 정본 | backend/gone.py:0 | - | writers.2u 에 등록됐으나 파일 없음 |" in out
