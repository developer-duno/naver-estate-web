"""세션 483 PR 3a — 단지 색인용 공개 창구(등급·공개 요약·사이트맵 번호·허브·동 페이지·서버 렌더 열쇠 통·X-Robots-Tag).

fixture 원칙(testing.md): 단지 수와 동 수가 같은 값이 되지 않게 한 동에 여러 단지를 둔다.
실행: python -m pytest tests/test_seo_public_pr3a.py -q
"""
from decimal import Decimal

import pytest
from sqlalchemy import event, text

from crawler.metrics_helpers import _cutoff_month
from db.models import (
    Complex,
    ComplexAreaTradeStat,
    ComplexOfficialPrice,
    KaptComplexMap,
    KaptManagementCost,
    SgisAreaStats,
)
from routers.public_fields import NAVER_FIELDS
from services import seo_grade
from services.seo_grade import compute_grades, grade_of_complex, sitemap_ids

SGG = "30200"                    # 대전 유성구(region_codes.json)
DONG_X = "3020012300"
DONG_Y = "3020012400"
ADDR_X = "대전광역시 유성구 봉명동"
ADDR_Y = "대전광역시 유성구 궁동"


def _shift(ym: str, delta: int) -> str:
    total = int(ym[:4]) * 12 + int(ym[4:]) - 1 + delta
    y, m0 = divmod(total, 12)
    return f"{y:04d}{m0 + 1:02d}"


CUTOFF24 = _cutoff_month(24)     # 24개월 창 첫 달(포함)
BEFORE24 = _shift(CUTOFF24, -1)  # 25개월 전(제외)
CUTOFF6 = _cutoff_month(6)

SUMMARY_KEYS = {
    "complex_no", "name", "real_estate_type", "household_count", "building_count", "use_approve_year",
    "parking_count", "grade", "indexable", "has_region", "breadcrumb", "name_dup_scope", "basis_ym",
    "area_ranges", "official_price", "kapt_cost", "subway", "nearby", "nearby_scope", "nearby_total",
}
CARD_KEYS = {"complex_no", "name", "grade", "household_count", "rep_area_key", "recent6_min", "recent6_max",
             "official_price"}


def _cpx(db, no, name=None, type_="APT", cortar=DONG_X, addr=ADDR_X, hh=None, rep=None, ymd=None, **kw):
    db.add(Complex(complex_no=no, complex_name=name or f"단지{no}", real_estate_type_code=type_,
                   cortar_no=cortar, cortar_address=addr if cortar else None, total_household_count=hh,
                   rep_area_m2=rep, use_approve_ymd=ymd, **kw))
    db.commit()


def _trade(db, no, month=CUTOFF24, area=59, prices=(50000, 60000), trades=None):
    prices = sorted(prices)
    db.add(ComplexAreaTradeStat(
        complex_no=no, base_month=month, area_m2=area, trade_count=len(prices),
        price_median=prices[len(prices) // 2], price_min=prices[0], price_max=prices[-1],
        prices=list(prices), trades=trades or [],
    ))
    db.commit()


def _official(db, no, year="2026", area="59.90", price=400_000_000, ho=10):
    db.add(ComplexOfficialPrice(complex_no=no, stdr_year=year, prvuse_ar=Decimal(area), price_median=price,
                                ho_count=ho))
    db.commit()


def _kapt(db, no, month="202607", per_household=190_000, mapped=True):
    if mapped:
        db.add(KaptComplexMap(complex_no=no, kapt_code=f"K{no}", kapt_name="연결"))
    db.add(KaptManagementCost(complex_no=no, cost_month=month, cost_per_household=per_household))
    db.commit()


def _grade_fixture(db):
    """등급 7곳 · 동 2개(+지역 없음 1) — 단지 수 ≠ 동 수."""
    _cpx(db, "101", hh=900, rep=59)
    _trade(db, "101")                                   # A
    _cpx(db, "102", hh=500)
    _official(db, "102")                                # B(공시가격)
    _cpx(db, "103", cortar=DONG_Y, addr=ADDR_Y)
    _kapt(db, "103", mapped=False)                      # B(관리비)
    _cpx(db, "104")                                     # C(자료 없음)
    _cpx(db, "105", type_="OPST", cortar=DONG_Y, addr=ADDR_Y)
    _trade(db, "105")                                   # 오피스텔 = C
    _cpx(db, "106", cortar=None)
    _trade(db, "106")                                   # A 지만 지역 없음
    _cpx(db, "107")
    _trade(db, "107", month=BEFORE24)                   # 25개월 전 줄만 = A 아님 → C


# ── 1·2. 등급 ───────────────────────────────────────────────────────────────


def test_등급_3종_지역없음_오피스텔_24개월_경계(db):
    _grade_fixture(db)
    got = {no: grade_of_complex(db, no) for no in ("101", "102", "103", "104", "105", "106", "107")}
    assert got["101"] == {"grade": "A", "indexable": True, "has_region": True}
    assert got["102"] == {"grade": "B", "indexable": False, "has_region": True}
    assert got["103"] == {"grade": "B", "indexable": False, "has_region": True}
    assert got["104"] == {"grade": "C", "indexable": False, "has_region": True}
    assert got["105"] == {"grade": "C", "indexable": False, "has_region": True}
    assert got["106"] == {"grade": "A", "indexable": False, "has_region": False}
    assert got["107"]["grade"] == "C"
    assert grade_of_complex(db, "999") is None


def test_전체계산과_단건이_같고_사이트맵은_indexable_집합(db, client):
    _grade_fixture(db)
    allg = compute_grades(db)
    assert set(allg) == {"101", "102", "103", "104", "105", "106", "107"}
    for no, g in allg.items():
        assert grade_of_complex(db, no) == g
    indexable = {no for no, g in allg.items() if g["indexable"]}
    assert set(sitemap_ids(db, "A")) == indexable == {"101"}
    res = client.get("/api/complexes/sitemap-ids?grade=A")
    assert res.status_code == 200
    assert res.json() == {"grade": "A", "count": 1, "items": ["101"]}
    assert res.headers["cache-control"] == "public, max-age=3600"
    assert "last" not in res.text                       # lastmod 없음


def test_B_스위치를_켜면_B도_indexable(db, monkeypatch):
    _grade_fixture(db)
    monkeypatch.setattr(seo_grade, "INDEX_GRADE_B", True)
    assert grade_of_complex(db, "102")["indexable"] is True
    assert grade_of_complex(db, "104")["indexable"] is False


def test_사이트맵_등급은_A만_허용(client):
    assert client.get("/api/complexes/sitemap-ids?grade=B").status_code == 422
    assert client.get("/api/complexes/sitemap-ids").status_code == 422


def test_사이트맵_계산_실패는_5xx_그리고_캐시에_안_굳음(db, monkeypatch):
    calls = {"n": 0}

    def boom(*a, **k):
        calls["n"] += 1
        raise RuntimeError("db down")

    monkeypatch.setattr(seo_grade, "grade_rows", boom)
    with pytest.raises(RuntimeError):
        compute_grades(db)
    with pytest.raises(RuntimeError):
        compute_grades(db)
    assert calls["n"] == 2                               # 실패가 캐시되지 않았다


# ── 7. 라우트 순서 ───────────────────────────────────────────────────────────


def test_sitemap_ids_가_단지번호로_빨려가지_않음(db, client):
    _cpx(db, "101")
    res = client.get("/api/complexes/sitemap-ids?grade=A")
    assert res.status_code == 200 and set(res.json()) == {"grade", "count", "items"}


# ── 3. 공개 요약 — 허용 목록·404·헤더 ─────────────────────────────────────────


def test_공개요약_허용목록_칸만_네이버칸_좌표_0(db, client):
    _cpx(db, "201", name="햇살마을", hh=1200, rep=59, ymd="20050301", latitude=36.35, longitude=127.34,
         total_dong_count=12, total_parking_count=1500, construction_company="시공사", management_office_tel="042",
         nearby_median_price=55000, jeonse_rate=0.6, heat_method_type="개별")
    _trade(db, "201")
    res = client.get("/api/complexes/201/public-summary")
    assert res.status_code == 200
    assert res.headers["cache-control"] == "public, max-age=3600"
    body = res.json()
    assert set(body) == SUMMARY_KEYS
    assert set(body) & NAVER_FIELDS == set()
    for banned in ("latitude", "longitude", "nearby_median_price", "price_median", "cortar_address"):
        assert banned not in body
    assert body["name"] == "햇살마을" and body["household_count"] == 1200 and body["building_count"] == 12
    assert body["parking_count"] == 1500 and body["use_approve_year"] == 2005
    assert body["grade"] == "A" and body["indexable"] is True
    assert body["breadcrumb"] == {"sido": "대전", "sigungu_code": SGG, "sigungu_name": "유성구",
                                  "dong_code": DONG_X, "dong_name": "봉명동", "dong_has_page": False}
    assert len(body["basis_ym"]) == 7 and body["basis_ym"][4] == "-"


@pytest.mark.parametrize("no", ["99999999", "abc", "12a"])
def test_공개요약_404_이고_캐시머리_없음(client, no):
    res = client.get(f"/api/complexes/{no}/public-summary")
    assert res.status_code == 404
    assert "cache-control" not in res.headers


def test_공개요약_면적범위_직거래제외_공시가격_관리비(db, client):
    _cpx(db, "202", rep=84)
    _trade(db, "202", month=CUTOFF6, area=84, prices=(70000, 80000, 90000), trades=[
        {"p": 70000, "g": "직거래"}, {"p": 80000, "g": "중개거래"}, {"p": 90000, "g": "중개거래"}])
    _trade(db, "202", month=CUTOFF24, area=59, prices=(40000, 45000))   # 2년 전 59㎡ — 최근 6개월엔 없음
    _official(db, "202", year="2025", area="84.90", price=300_000_000)
    _official(db, "202", year="2026", area="84.90", price=350_000_000)
    _kapt(db, "202", per_household=210_000)
    body = client.get("/api/complexes/202/public-summary").json()
    ranges = {r["area_key"]: r for r in body["area_ranges"]}
    assert ranges[84]["recent6"] == {"min": 80000, "max": 90000, "count": 2}
    assert ranges[84]["recent24"] == {"min": 80000, "max": 90000, "count": 2}
    assert ranges[59]["recent6"] is None and ranges[59]["recent24"] == {"min": 40000, "max": 45000, "count": 2}
    assert body["official_price"] == {"year": "2026", "items": [
        {"prvuse_ar": 84.9, "price_median": 350_000_000, "ho_count": 10}]}
    assert body["kapt_cost"] == {"ym": "202607", "monthly_total": 210_000}
    assert body["subway"] == []                                          # 좌표 없음


# ── 4. 같은 동 다른 단지 ─────────────────────────────────────────────────────


def test_같은동_정렬_A먼저_세대수_C제외_자기제외(db, client):
    _cpx(db, "301", hh=100)
    _trade(db, "301")                                   # 자기(A)
    _cpx(db, "302", hh=500, rep=59)
    _trade(db, "302", month=CUTOFF6, prices=(50000, 61000))
    _cpx(db, "303", hh=900)
    _trade(db, "303")
    _cpx(db, "304", hh=2000, rep=59)
    _official(db, "304", area="59.90", price=410_000_000)   # B — 세대수는 가장 크지만 A 뒤
    _cpx(db, "305", hh=5000)                            # C
    body = client.get("/api/complexes/301/public-summary").json()
    assert [c["complex_no"] for c in body["nearby"]] == ["303", "302", "304"]
    assert body["nearby_scope"] == "dong" and body["nearby_total"] == 3
    assert all(set(c) == CARD_KEYS for c in body["nearby"])
    c302 = body["nearby"][1]
    assert (c302["rep_area_key"], c302["recent6_min"], c302["recent6_max"]) == (59, 50000, 61000)
    assert body["nearby"][2]["official_price"] == 410_000_000 and body["nearby"][2]["grade"] == "B"


def test_같은동_12개_상한(db, client):
    _cpx(db, "400", hh=1)
    _trade(db, "400")
    for i in range(14):
        no = f"4{i + 10:02d}"
        _cpx(db, no, hh=100 + i)
        _trade(db, no)
    body = client.get("/api/complexes/400/public-summary").json()
    assert len(body["nearby"]) == 12 and body["nearby_total"] == 14
    assert body["nearby"][0]["household_count"] == 113


def test_같은동에_없으면_시군구로(db, client):
    _cpx(db, "501")
    _trade(db, "501")
    _cpx(db, "502", cortar=DONG_Y, addr=ADDR_Y)
    _official(db, "502")
    _cpx(db, "503")                                     # 같은 동 C 뿐
    body = client.get("/api/complexes/501/public-summary").json()
    assert body["nearby_scope"] == "sigungu"
    assert [c["complex_no"] for c in body["nearby"]] == ["502"]


def test_지역없는_단지는_빵부스러기_null_같은동_빈목록(db, client):
    _cpx(db, "601", cortar=None)
    _trade(db, "601")
    body = client.get("/api/complexes/601/public-summary").json()
    assert body["has_region"] is False and body["indexable"] is False
    assert body["breadcrumb"] is None and body["nearby"] == [] and body["nearby_scope"] is None


# ── 5. 같은 이름 ─────────────────────────────────────────────────────────────


def test_같은이름_범위_3종(db, client):
    _cpx(db, "701", name="현대")
    _cpx(db, "702", name="현대")                         # 같은 동
    _cpx(db, "703", name="삼성")
    _cpx(db, "704", name="삼성", cortar=DONG_Y, addr=ADDR_Y)  # 같은 시군구 다른 동
    _cpx(db, "705", name="혼자")
    _cpx(db, "706", name="혼자", cortar="1168010100", addr="서울특별시 강남구 역삼동")  # 다른 시군구
    scope = {no: client.get(f"/api/complexes/{no}/public-summary").json()["name_dup_scope"]
             for no in ("701", "703", "705")}
    assert scope == {"701": "dong", "703": "sigungu", "705": "none"}


# ── 10. 캐시 ─────────────────────────────────────────────────────────────────


def _count_sql(db):
    counter = {"n": 0}

    def _on(*_a, **_k):
        counter["n"] += 1

    event.listen(db.get_bind(), "before_cursor_execute", _on)
    return counter, _on


def test_공개요약_두번째_호출은_DB_0회(db, client):
    _cpx(db, "801")
    _trade(db, "801")
    assert client.get("/api/complexes/801/public-summary").status_code == 200
    counter, fn = _count_sql(db)
    try:
        assert client.get("/api/complexes/801/public-summary").status_code == 200
    finally:
        event.remove(db.get_bind(), "before_cursor_execute", fn)
    assert counter["n"] == 0


def test_허브_두번째_호출은_DB_0회(db, client):
    _cpx(db, "802")
    _trade(db, "802")
    assert client.get(f"/api/regions/{SGG}/hub").status_code == 200
    counter, fn = _count_sql(db)
    try:
        assert client.get(f"/api/regions/{SGG}/hub").status_code == 200
    finally:
        event.remove(db.get_bind(), "before_cursor_execute", fn)
    assert counter["n"] == 0


# ── 8. 허브·동 페이지 ────────────────────────────────────────────────────────


def _dong_with_ab(db, dong, addr, n, start):
    for i in range(n):
        no = str(start + i)
        _cpx(db, no, cortar=dong, addr=addr, hh=100 + i)
        _official(db, no)


def test_허브_모양_C포함_has_page_경계_9_10(db, client):
    _dong_with_ab(db, DONG_X, ADDR_X, 10, 9000)          # 10곳 → 동 페이지
    _dong_with_ab(db, DONG_Y, ADDR_Y, 9, 9100)           # 9곳 → 없음
    _cpx(db, "9200", type_="OPST", cortar=DONG_Y, addr=ADDR_Y)   # C 도 목록엔
    _cpx(db, "9300")
    _trade(db, "9300")                                    # A 1곳 → indexable
    res = client.get(f"/api/regions/{SGG}/hub")
    assert res.status_code == 200
    assert res.headers["cache-control"] == "public, max-age=3600"
    body = res.json()
    assert (body["sigungu_code"], body["sido"], body["sigungu_name"]) == (SGG, "대전", "유성구")
    assert body["indexable"] is True and body["complex_count"] == 21
    assert set(body["region_trend"]) == {"region_code", "region_name", "source", "items"}
    dongs = {d["dong_code"]: d for d in body["dongs"]}
    assert dongs[DONG_X]["has_page"] is True and dongs[DONG_X]["complex_count"] == 11
    assert dongs[DONG_Y]["has_page"] is False and dongs[DONG_Y]["complex_count"] == 10
    assert [d["dong_code"] for d in body["dongs"]] == [DONG_X, DONG_Y]   # 단지 많은 동 먼저
    assert dongs[DONG_X]["dong_name"] == "봉명동"
    y_nos = [c["complex_no"] for c in dongs[DONG_Y]["complexes"]]
    assert "9200" in y_nos and y_nos[-1] == "9200"                       # C 는 맨 뒤
    assert dongs[DONG_X]["complexes"][0]["complex_no"] == "9300"          # A 먼저
    assert set(dongs[DONG_X]["complexes"][0]) == CARD_KEYS | {"use_approve_year"}
    assert client.get(f"/api/regions/{SGG}/dongs/{DONG_X}").status_code == 200
    assert client.get(f"/api/regions/{SGG}/dongs/{DONG_Y}").status_code == 404


def test_허브_A없으면_indexable_false(db, client):
    _dong_with_ab(db, DONG_X, ADDR_X, 2, 9500)
    assert client.get(f"/api/regions/{SGG}/hub").json()["indexable"] is False


@pytest.mark.parametrize("path", [
    "/api/regions/3020/hub", "/api/regions/abcde/hub", "/api/regions/99999/hub", f"/api/regions/{SGG}/hub",
    f"/api/regions/{SGG}/dongs/1168010100", f"/api/regions/{SGG}/dongs/302001230", "/api/regions/3020/dongs/3020012300",
])
def test_허브_동_404_조건(client, path):
    res = client.get(path)                               # 단지 0 인 DB — 유성구 허브도 404
    assert res.status_code == 404
    assert "cache-control" not in res.headers


def test_동페이지_모양과_다른동_그리고_동네자료_없으면_null(db, client):
    _dong_with_ab(db, DONG_X, ADDR_X, 10, 9000)
    _dong_with_ab(db, DONG_Y, ADDR_Y, 10, 9100)
    res = client.get(f"/api/regions/{SGG}/dongs/{DONG_X}")
    assert res.status_code == 200 and res.headers["cache-control"] == "public, max-age=3600"
    body = res.json()
    assert set(body) == {"dong_code", "dong_name", "sido", "sigungu_code", "sigungu_name", "complexes",
                         "neighborhood", "sibling_dongs"}
    assert body["dong_name"] == "봉명동" and len(body["complexes"]) == 10
    assert body["sibling_dongs"] == [{"dong_code": DONG_Y, "dong_name": "궁동"}]
    assert body["neighborhood"] == []                     # sgis_emd_cd 칸 없는 DB → 500 아니고 빈 목록


def _emd_fixture(db, codes_by_no: dict[str, str]):
    db.execute(text("ALTER TABLE complexes ADD COLUMN sgis_emd_cd TEXT"))
    db.commit()
    _dong_with_ab(db, DONG_X, ADDR_X, 10, 9000)
    for no, cd in codes_by_no.items():
        db.execute(text("UPDATE complexes SET sgis_emd_cd = :cd WHERE complex_no = :no"), {"cd": cd, "no": no})
    for cd, name, pop in (("25050510", "온천2동", "23116"), ("25050520", "온천3동", "8400")):
        db.add(SgisAreaStats(adm_cd=cd, year=2024, item_code="to_in_001", value=Decimal(pop)))
        db.add(SgisAreaStats(adm_cd=cd, year=2024, item_code="adm_nm", value_text=name))
    db.commit()


def test_동페이지_행정동_0개면_빈목록(db, client):
    _emd_fixture(db, {})
    assert client.get(f"/api/regions/{SGG}/dongs/{DONG_X}").json()["neighborhood"] == []


def test_동페이지_행정동_1개면_길이1(db, client):
    _emd_fixture(db, {str(9000 + i): "25050510" for i in range(10)})
    hoods = client.get(f"/api/regions/{SGG}/dongs/{DONG_X}").json()["neighborhood"]
    assert len(hoods) == 1
    assert (hoods[0]["emd_cd"], hoods[0]["emd_name"], hoods[0]["population"]) == ("25050510", "온천2동", 23116)


def test_동페이지_행정동_2개면_단지많은_행정동부터_둘다(db, client):
    codes = {str(9000 + i): "25050520" for i in range(7)} | {str(9007 + i): "25050510" for i in range(3)}
    _emd_fixture(db, codes)
    hoods = client.get(f"/api/regions/{SGG}/dongs/{DONG_X}").json()["neighborhood"]
    assert [(h["emd_cd"], h["emd_name"], h["population"]) for h in hoods] == [
        ("25050520", "온천3동", 8400), ("25050510", "온천2동", 23116)]


def test_기존_지역_라우트는_그대로(client):
    assert client.get("/api/regions").status_code == 200
    res = client.get("/api/regions/서울특별시")
    assert res.status_code == 200 and res.json()["sido"] == "서울특별시"
    res = client.get("/api/regions/서울특별시/강남구")            # 두 조각 라우트도 그대로
    assert res.status_code == 200 and res.json()["sigungu"] == "강남구"


# ── 6. 서버 렌더 열쇠 통 ─────────────────────────────────────────────────────

KEY = "test-ssr-key-zq81"


def _hit(client, n, headers=None):
    last = None
    for _ in range(n):
        last = client.get("/api/regions", headers=headers or {})
    return last


def test_열쇠_꺼짐이면_머리가_있어도_IP당_60(client, monkeypatch):
    monkeypatch.delenv("SSR_SHARED_KEY", raising=False)
    assert _hit(client, 60, {"X-SSR-Key": KEY}).status_code == 200
    assert _hit(client, 1, {"X-SSR-Key": KEY}).status_code == 429


def test_맞는_열쇠는_IP무관_한통_300(client, monkeypatch, caplog):
    monkeypatch.setenv("SSR_SHARED_KEY", KEY)
    for i in range(300):
        res = client.get("/api/regions", headers={"X-SSR-Key": KEY, "cf-connecting-ip": f"10.0.{i % 7}.1"})
        assert res.status_code == 200, i
    res = client.get("/api/regions", headers={"X-SSR-Key": KEY, "cf-connecting-ip": "10.9.9.9"})
    assert res.status_code == 429
    assert KEY not in caplog.text
    assert KEY not in res.text


def test_틀린_열쇠는_일반_통_60(client, monkeypatch, caplog):
    monkeypatch.setenv("SSR_SHARED_KEY", KEY)
    assert _hit(client, 60, {"X-SSR-Key": "wrong"}).status_code == 200
    res = _hit(client, 1, {"X-SSR-Key": "wrong"})
    assert res.status_code == 429
    assert KEY not in caplog.text and "wrong" not in caplog.text


def test_열쇠_없음은_일반_통_60(client, monkeypatch):
    monkeypatch.setenv("SSR_SHARED_KEY", KEY)
    assert _hit(client, 60).status_code == 200
    assert _hit(client, 1).status_code == 429


# ── 9. X-Robots-Tag ──────────────────────────────────────────────────────────


def test_X_Robots_Tag_가_아무_응답에나(client, monkeypatch):
    monkeypatch.delenv("SSR_SHARED_KEY", raising=False)
    for path in ("/api/regions", "/health", "/api/complexes/99999999/public-summary", "/api/없는길"):
        assert client.get(path).headers.get("x-robots-tag") == "noindex", path
    res = _hit(client, 61)
    assert res.status_code == 429 and res.headers.get("x-robots-tag") == "noindex"
