"""SGIS 행정구역 통계 적재 스크립트(scripts/load_sgis_stats.py) 회귀 — V071, 세션 453.

진짜 모양을 흉내 낸 작은 zip 을 tmp_path 에 만들어(CSV = cp949 4열, 코드집 = openpyxl xlsx)
파서·라벨 생성·upsert 를 실제 경로로 지나가게 한다. DB 는 conftest 의 SQLite(운영 DB 무관).
"""

import csv
import io
import zipfile
from decimal import Decimal

import openpyxl
import pytest
from sqlalchemy import func, select

from db.models import SgisAreaStats
from scripts import load_sgis_stats as ls

ROOT = "국가데이터처_SGIS 행정구역 통계 및 경계"
HEADER = ["기준연도", "행정구역코드", "통계항목", "통계값"]


def _csv_bytes(rows, header=HEADER) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\r\n")
    w.writerow(header)
    w.writerows(rows)
    return buf.getvalue().encode("cp949")


def _codebook_bytes() -> bytes:
    """실물 코드집과 같은 열 배치 — (빈칸, 분류, 소분류, 통계항목, 코드). 건축년도 표 2개."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "집계구·행정동"
    ws.append([None, "[ 집계구·행정구역 통계 제공 항목 ]"])
    ws.append([None, "분류", None, "통계항목", "코드"])
    ws.append([None, "총괄", "가구총괄", "총가구수", "to_ga_001"])
    ws.append([None, "가구", "세대구성별 가구", "1세대가구", "ga_sd_001"])
    ws.append([None, None, None, "1인가구", "ga_sd_005"])
    ws.append([None, "주택", "건축년도별 주택\n(2000,05,10년)", "1959년 이전", "ho_yr_001"])
    ws.append([None, None, None, "1960년~1969년", "ho_yr_002"])
    ws.append([None, None, "건축년도별 주택\n(2015년~2023년)", "1979년 이전", "ho_yr_001"])
    ws.append([None, None, None, "1980년~1989년", "ho_yr_002"])
    ws.append([None, None, None, "2000년~2004년", "ho_yr_004"])
    ws.append([None, None, None, "2024년", "ho_yr_020"])
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def _make_zip(tmp_path, files: dict[str, bytes], codebook: bytes | None = None):
    p = tmp_path / "admstats.zip"
    with zipfile.ZipFile(p, "w") as z:
        for name, data in files.items():
            z.writestr(f"{ROOT}/1. 통계/1.2024년 행정구역 통계(가구)/{name}", data)
        z.writestr(f"{ROOT}/3. 코드집/2. 제공용 코드(statistics_code).xlsx", codebook or _codebook_bytes())
    return p


# 코드 길이 2·5·8 섞임 + N/A + 건축년도 행
MIXED = {
    "가구.csv": _csv_bytes([
        ["2024", "11", "to_ga_001", "4000000"],          # 시도 — 기본 제외
        ["2024", "11230", "to_ga_001", "250000"],        # 시군구 — 기본 제외
        ["2024", "11230640", "to_ga_001", "21140"],
        ["2024", "11230640", "ga_sd_005", "14255"],
        ["2024", "11230650", "ga_sd_005", "N/A"],        # 작은 수 보호 → NULL
        ["2024", "11230640", "to_in_002", "41.3"],
    ]),
    "주택.csv": _csv_bytes([
        ["2024", "11230640", "ho_yr_001", "38"],
        ["2024", "11230640", "ho_yr_004", "3785"],
        ["2024", "11230650", "ho_yr_020", "N/A"],
    ]),
}


def _rows(db):
    return {(r.adm_cd, r.year, r.item_code): (r.value, r.value_text) for r in db.scalars(select(SgisAreaStats))}


def _load(db, zip_path, **kw):
    stats = []
    with zipfile.ZipFile(zip_path) as zf:
        rows = ls.iter_zip_rows(zf, year=kw.get("year", 2024), levels=kw.get("levels", frozenset({8})), stats_out=stats)
        n = ls.upsert_rows(db, rows, kw.get("batch_size", 1000))
    return n, stats


# ── 파서 ─────────────────────────────────────────────────────────────


def test_8글자만_남기고_N_A_는_NULL(db, tmp_path):
    n, stats = _load(db, _make_zip(tmp_path, MIXED))
    rows = _rows(db)
    # 2·5글자 행은 없다
    assert all(len(k[0]) == 8 for k in rows)
    assert ("11", 2024, "to_ga_001") not in rows and ("11230", 2024, "to_ga_001") not in rows
    assert rows[("11230640", 2024, "to_ga_001")] == (Decimal("21140"), None)
    assert rows[("11230640", 2024, "to_in_002")][0] == Decimal("41.3")
    # N/A → value NULL (0 이 아니다)
    assert rows[("11230650", 2024, "ga_sd_005")] == (None, None)
    # 원본 7행(8글자) + 건축년도 라벨 3행
    assert n == 10 and len(rows) == 10
    st = {s.name: s for s in stats}
    assert st["가구.csv"].by_len == {2: 1, 5: 1, 8: 4}
    assert st["가구.csv"].na == 1 and st["주택.csv"].label_rows == 3


def test_all_levels_면_2_5글자도(db, tmp_path):
    _load(db, _make_zip(tmp_path, MIXED), levels=frozenset({2, 5, 8}))
    rows = _rows(db)
    assert rows[("11", 2024, "to_ga_001")][0] == Decimal("4000000")
    assert rows[("11230", 2024, "to_ga_001")][0] == Decimal("250000")


def test_건축년도_라벨_항목은_2015년_이후_표로(db, tmp_path):
    _load(db, _make_zip(tmp_path, MIXED))
    rows = _rows(db)
    # 2024 기준 ho_yr_001 = "1979년 이전"(2000·05·10년 표의 "1959년 이전"이 아니다)
    assert rows[("11230640", 2024, "ho_cy_label_0000_1979")] == (Decimal("38"), "1979년 이전")
    assert rows[("11230640", 2024, "ho_cy_label_2000_2004")] == (Decimal("3785"), "2000년~2004년")
    assert rows[("11230650", 2024, "ho_cy_label_2024_2024")] == (None, "2024년")
    assert not any(k[2] == "ho_cy_label_0000_1959" for k in rows)


def test_코드집에_없는_건축년도_코드면_멈춘다(db, tmp_path):
    z = _make_zip(tmp_path, {"주택.csv": _csv_bytes([["2024", "11230640", "ho_yr_099", "1"]])})
    with pytest.raises(ls.SgisLoadError, match="ho_yr_099"):
        _load(db, z)


def test_머리줄이_4열_형식이_아니면_멈춘다(db, tmp_path):
    z = _make_zip(tmp_path, {"x.csv": _csv_bytes([["2024", "11230640", "1"]], header=["연도", "코드", "값"])})
    with pytest.raises(ls.SgisLoadError, match="머리줄"):
        _load(db, z)


def test_다른_연도_행은_건너뛴다(db, tmp_path):
    z = _make_zip(tmp_path, {"x.csv": _csv_bytes([["2023", "11230640", "to_ga_001", "1"],
                                                  ["2024", "11230640", "to_ga_001", "2"]])})
    n, stats = _load(db, z)
    assert n == 1 and stats[0].other_year == 1
    assert _rows(db)[("11230640", 2024, "to_ga_001")][0] == Decimal("2")


def test_cp949_한글_머리줄을_읽는다():
    st = ls.FileStats(name="t")
    got = list(ls.iter_file_rows(io.BytesIO(_csv_bytes([["2024", "11230640", "to_ga_001", "5"]])), st,
                                 year=2024, levels=frozenset({8}), labels={}))
    assert got[0]["item_code"] == "to_ga_001" and got[0]["value"] == Decimal("5")


@pytest.mark.parametrize("label,code", [
    ("1979년 이전", "ho_cy_label_0000_1979"),
    ("1980년~1989년", "ho_cy_label_1980_1989"),
    ("2010년", "ho_cy_label_2010_2010"),
])
def test_라벨_항목_이름(label, code):
    assert ls.label_item_code(label) == code


# ── 멱등 ─────────────────────────────────────────────────────────────


def test_두_번_돌려도_행_수와_값이_같다(db, tmp_path):
    z = _make_zip(tmp_path, MIXED)
    _load(db, z, batch_size=3)            # 묶음 경계를 여러 번 넘게
    first = _rows(db)
    _load(db, z, batch_size=3)
    second = _rows(db)
    assert first == second
    assert db.scalar(select(func.count()).select_from(SgisAreaStats)) == 10


def test_같은_키가_다시_나오면_세고_마지막_값만_남긴다(db, tmp_path, capsys):
    z = _make_zip(tmp_path, {"x.csv": _csv_bytes([
        ["2024", "11230640", "to_ga_001", "1"],
        ["2024", "11230640", "to_ga_001", "2"],     # 같은 키 다시
        ["2024", "11230650", "to_ga_001", "3"],
    ])})
    n, stats = _load(db, z)
    assert stats[0].dup_keys == 1
    rows = _rows(db)
    assert len(rows) == 2 and rows[("11230640", 2024, "to_ga_001")][0] == Decimal("2")
    assert ls.main([str(z), "--dry-run"]) == 0
    assert "같은 키 중복 1" in capsys.readouterr().out


def test_한_묶음_안_같은_키는_하나로_줄인다():
    """PostgreSQL 은 한 문장에서 같은 행을 두 번 고치면 거부한다 — SQLite CI 는 받아 주므로 묶음 함수를 직접 본다."""
    rows = [
        {"adm_cd": "11230640", "year": 2024, "item_code": "a", "value": 1},
        {"adm_cd": "11230640", "year": 2024, "item_code": "b", "value": 2},
        {"adm_cd": "11230640", "year": 2024, "item_code": "a", "value": 3},
    ]
    batches = list(ls._batched(rows, 10))
    assert len(batches) == 1 and len(batches[0]) == 2
    assert {r["item_code"]: r["value"] for r in batches[0]} == {"a": 3, "b": 2}


@pytest.mark.parametrize("year", [2025, 2030, 2012, 1995])
def test_코드집이_다루지_않는_연도면_멈춘다(year):
    with pytest.raises(ls.SgisLoadError, match="코드집 건축년도 표"):
        ls.load_build_year_labels(_codebook_bytes(), year)


def test_코드집이_다루는_연도는_통과한다():
    assert ls.load_build_year_labels(_codebook_bytes(), 2024)["ho_yr_001"] == "1979년 이전"
    assert ls.load_build_year_labels(_codebook_bytes(), 2010)["ho_yr_001"] == "1959년 이전"


# ── dry-run 은 DB 없이 ───────────────────────────────────────────────


def test_dry_run_은_DB_를_안_쓴다(db, tmp_path, capsys):
    z = _make_zip(tmp_path, MIXED)
    assert ls.main([str(z), "--dry-run"]) == 0
    out = capsys.readouterr().out
    assert "넣을 행 7 + 라벨 행 3 = 10" in out
    assert db.scalar(select(func.count()).select_from(SgisAreaStats)) == 0
