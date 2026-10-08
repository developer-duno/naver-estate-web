"""단지 "이 동네는" API (GET /api/complexes/{no}/neighborhood) 회귀 — PR ②, 세션 456.

픽스처 값 = 2026-10-09 운영 DB 자양2동(11050650) 실값 — 인구 23116 ≠ 가구 10105 ≠ 1인가구 3638 ≠ 주택 7240 처럼
축마다 값이 달라 칸을 뒤바꿔 쓰면 숫자가 어긋난다. complexes 의 sgis_emd_cd 는 Complex 모델에 아직 없어
(V071 운영 적용 전 재시작 대비) SQLite 표에 직접 더한다(test_sgis_map 과 같은 방식).
"""

from decimal import Decimal

import pytest
from sqlalchemy import text

from db.models import Complex, SgisAreaStats
from db.sgis_queries import build_neighborhood

EMD = "11050650"
JAYANG2 = {
    "to_in_001": "23116", "to_in_002": "45.4", "to_ga_001": "10105", "ga_sd_005": "3638",
    "to_ho_001": "7240", "ho_gb_003": "2813",
    "ho_cy_label_0000_1979": "103", "ho_cy_label_1980_1989": "789",
    "ho_cy_label_1990_1999": "2513", "ho_cy_label_2000_2004": "1044",
    "to_fa_010": "1821", "to_em_020": "5496",
}


@pytest.fixture
def ndb(db):
    db.execute(text("ALTER TABLE complexes ADD COLUMN sgis_emd_cd TEXT"))
    db.commit()
    return db


def _complex(db, no="100", emd=EMD):
    db.add(Complex(complex_no=no, complex_name="자양한양"))
    db.commit()
    db.execute(text("UPDATE complexes SET sgis_emd_cd = :cd WHERE complex_no = :no"), {"cd": emd, "no": no})
    db.commit()


def _stats(db, adm_cd=EMD, values=None, name="자양2동"):
    for code, v in (JAYANG2 if values is None else values).items():
        db.add(SgisAreaStats(adm_cd=adm_cd, year=2024, item_code=code, value=None if v is None else Decimal(v)))
    if name:
        db.add(SgisAreaStats(adm_cd=adm_cd, year=2024, item_code="adm_nm", value_text=name))
    db.commit()


# ── 200 정상 ─────────────────────────────────────────────────────────


def test_자양2동_산식_기대값_그대로_그리고_캐시헤더(client, ndb):
    _complex(ndb)
    _stats(ndb)
    res = client.get("/api/complexes/100/neighborhood")
    assert res.status_code == 200
    assert res.headers["Cache-Control"] == "private, max-age=3600"
    body = res.json()
    assert body == {
        "emd_cd": EMD, "emd_nm": "자양2동", "year": 2024,
        "population": 23116, "avg_age": 45.4,
        "one_person_pct": 36.0,          # 3638 / 10105
        "households": 10105,
        "house_mix": None,               # 요약 수집 전
        "old_house_pct": 61.5,           # (103+789+2513+1044) / 7240
        "old_house_cutoff": "2004년 이전",
        "corp_cnt": 1821, "worker_cnt": 5496,
        "broker_pct": None, "flood": None, "landslide": None,
        "source": "국가데이터처 통계지리정보 센서스 2024, 홍수·산사태 위험지도 2025",
    }


def test_요약_재해_수집_뒤_칸이_채워진다(client, ndb):
    _complex(ndb)
    _stats(ndb, values={**JAYANG2, "api_apart_per": "27.22", "api_officetel_per": "1.5",
                        "api_row_house_per": "34.68", "api_detach_house_per": "33.03",
                        "api_corp_1006_per": "2.89",
                        "ndsm_flood_affected": "0",
                        "ndsm_lndsld_affected": "1", "ndsm_lndsld_affc_pop": "8578",
                        "ndsm_lndsld_adm_pop": "19840", "ndsm_lndsld_year": "2024"})
    body = client.get("/api/complexes/100/neighborhood").json()
    assert body["house_mix"] == {"apt_pct": 27.2, "officetel_pct": 1.5, "row_pct": 34.7, "detached_pct": 33.0}
    assert body["broker_pct"] == 2.89
    assert body["flood"] == {"affected": False}
    assert body["landslide"] == {"affected": True, "pop": 8578, "pop_total": 19840, "year": 2024}


# ── 404 ──────────────────────────────────────────────────────────────


def test_단지_없음_404_캐시헤더_없음(client, ndb):
    res = client.get("/api/complexes/999/neighborhood")
    assert res.status_code == 404
    assert "Cache-Control" not in res.headers


def test_행정동_코드_없는_단지_404(client, ndb):
    _complex(ndb, emd=None)
    assert client.get("/api/complexes/100/neighborhood").status_code == 404


def test_이름만_있는_동은_404(client, ndb):
    _complex(ndb)
    _stats(ndb, values={"to_ga_001": "10105"})          # 다른 숫자·이름은 있어도 총인구 행이 없다
    res = client.get("/api/complexes/100/neighborhood")
    assert res.status_code == 404
    assert "Cache-Control" not in res.headers


def test_다른_연도_총인구만_있으면_404(client, ndb):
    _complex(ndb)
    ndb.add(SgisAreaStats(adm_cd=EMD, year=2023, item_code="to_in_001", value=Decimal("1")))
    ndb.commit()
    assert client.get("/api/complexes/100/neighborhood").status_code == 404


# ── 빈 값 (조립 함수) ───────────────────────────────────────────────────


def _items(**over):
    base = {k: (Decimal(v), None) for k, v in JAYANG2.items()}
    for k, v in over.items():
        if v == "drop":
            base.pop(k)
        else:
            base[k] = (v, None)
    return base


def test_산식_값_하나가_NULL이면_그_칸만_null():
    out = build_neighborhood(EMD, _items(ho_cy_label_1990_1999=None))
    assert out["old_house_pct"] is None
    assert out["one_person_pct"] == 36.0
    out = build_neighborhood(EMD, _items(ga_sd_005="drop"))
    assert out["one_person_pct"] is None and out["households"] == 10105
    out = build_neighborhood(EMD, _items(to_ga_001=Decimal(0)))
    assert out["one_person_pct"] is None                    # 0 으로 나누지 않는다


def test_집종류_한칸이라도_없으면_house_mix_null():
    items = _items(api_apart_per=Decimal("27.22"), api_officetel_per=Decimal("1.5"), api_row_house_per=None,
                   api_detach_house_per=Decimal("33.03"))
    assert build_neighborhood(EMD, items)["house_mix"] is None


def test_총인구_값이_NULL이어도_행이_있으면_200_모양():
    out = build_neighborhood(EMD, _items(to_in_001=None))
    assert out is not None and out["population"] is None


def test_총인구_행이_없으면_None():
    assert build_neighborhood(EMD, {"adm_nm": (None, "자양2동")}) is None
