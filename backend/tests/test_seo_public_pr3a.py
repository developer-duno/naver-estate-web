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
    "parking_count", "rep_area_key", "grade", "indexable", "has_region", "breadcrumb", "name_dup_scope",
    "title_suffix", "basis_ym", "data_last_ym",
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
    assert body["nearby_scope"] == "dong" and body["nearby_total"] == 5   # 그 동 단지 수(C·자기 포함, 결정 27)
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
    assert len(body["nearby"]) == 12 and body["nearby_total"] == 15   # 그 동 단지 수(자기 포함)
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


def test_제목_꼬리_5종(db, client):
    _cpx(db, "711", name="가람", hh=300, ymd="20000101")
    _cpx(db, "712", name="가람", hh=500, ymd="20000101")                 # 같은 동 · 세대수 다름
    _cpx(db, "721", name="나래", hh=300, ymd="19990101")
    _cpx(db, "722", name="나래", hh=300, ymd="20050101")                 # 같은 동 · 세대수 같고 연도 다름
    _cpx(db, "731", name="다솜", hh=300, ymd="20000101")
    _cpx(db, "732", name="다솜", hh=300, ymd="20000601")                 # 세대수·연도 다 같음
    _cpx(db, "741", name="라온")
    _cpx(db, "742", name="라온", cortar=DONG_Y, addr=ADDR_Y)            # 같은 시군구 다른 동
    _cpx(db, "751", name="마루")                                         # 혼자
    suffix = {no: client.get(f"/api/complexes/{no}/public-summary").json()["title_suffix"]
              for no in ("711", "721", "731", "741", "751")}
    assert suffix == {"711": "dong_households", "721": "dong_year", "731": "dong_no", "741": "dong", "751": "none"}


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
    assert set(body) == {"dong_code", "dong_name", "sido", "sigungu_code", "sigungu_name", "indexable", "complexes",
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


# ══ 보완(세션 483 검사관 지적 F1~F11) ═══════════════════════════════════════

DIRECT_ONLY = [{"p": 50000, "g": "직거래"}, {"p": 60000, "g": " 직거래 "}]
MIXED = [{"p": 50000, "g": "직거래"}, {"p": 60000, "g": "중개거래"}]


# F1 — 직거래만 있는 달은 A 근거가 아니다


def test_F1_직거래만_있으면_A아님_B조건으로(db):
    _cpx(db, "1101")
    _trade(db, "1101", trades=DIRECT_ONLY)                                 # 직거래만 → C
    _cpx(db, "1102")
    _trade(db, "1102", trades=DIRECT_ONLY)
    _official(db, "1102")                                                  # 직거래만 + 공시가격 → B
    _cpx(db, "1103")
    _trade(db, "1103", trades=MIXED)                                       # 중개거래 1건 → A
    _cpx(db, "1104")
    _trade(db, "1104", trades=[])                                          # 옛 줄(목록 빔) + price_min → A
    got = {no: grade_of_complex(db, no)["grade"] for no in ("1101", "1102", "1103", "1104")}
    assert got == {"1101": "C", "1102": "B", "1103": "A", "1104": "A"}
    assert {no: g["grade"] for no, g in compute_grades(db).items()} == got
    assert sitemap_ids(db, "A") == ["1103", "1104"]


# F3 — 같은 동 카드 공시가격은 ±1㎡ 안만


def test_F3_카드_공시가격_면적차이_1제곱미터_넘으면_null(db, client):
    _cpx(db, "1301")
    _trade(db, "1301")
    _cpx(db, "1302", rep=59)
    _official(db, "1302", area="84.90")                                    # 대표 59 · 공시가격 84.9 만
    _cpx(db, "1303", rep=84)
    _official(db, "1303", area="84.90", price=500_000_000)                 # 0.9㎡ 차이 → 그 값
    cards = {c["complex_no"]: c for c in client.get("/api/complexes/1301/public-summary").json()["nearby"]}
    assert cards["1302"]["official_price"] is None
    assert cards["1303"]["official_price"] == 500_000_000


# F4 — 동 페이지 색인 여부


def test_F4_동페이지_indexable_A0_B12_는_false_A있으면_true(db, client):
    _dong_with_ab(db, DONG_X, ADDR_X, 12, 9000)                            # B 만 12곳
    _dong_with_ab(db, DONG_Y, ADDR_Y, 10, 9100)
    _cpx(db, "9150", cortar=DONG_Y, addr=ADDR_Y)
    _trade(db, "9150")                                                     # Y 동엔 A 1곳
    assert client.get(f"/api/regions/{SGG}/dongs/{DONG_X}").json()["indexable"] is False
    assert client.get(f"/api/regions/{SGG}/dongs/{DONG_Y}").json()["indexable"] is True


# F5 — DB 오류는 캐시에 굳히지 않고 503


def _op_error():
    from sqlalchemy.exc import OperationalError
    return OperationalError("SELECT 1", {}, Exception("canceling statement due to statement timeout"))


def test_F5_허브_지역추이_실패는_503_다음_호출은_정상(db, client, monkeypatch):
    import db.public_complex_queries as pcq
    db.add(seo_region_stat(SGG, CUTOFF24))
    db.commit()
    _cpx(db, "1501")
    _trade(db, "1501")
    real = pcq._trend_rows
    calls = {"n": 0}

    def flaky(*a, **k):
        calls["n"] += 1
        if calls["n"] == 1:
            raise _op_error()
        return real(*a, **k)

    monkeypatch.setattr(pcq, "_trend_rows", flaky)
    res = client.get(f"/api/regions/{SGG}/hub")
    assert res.status_code == 503 and "cache-control" not in res.headers
    res = client.get(f"/api/regions/{SGG}/hub")
    assert res.status_code == 200 and len(res.json()["region_trend"]["items"]) == 1


def test_F5_기존_지역추이_라우트는_실패를_그대로_삼킴(db, client, monkeypatch):
    import db.public_complex_queries as pcq
    _cpx(db, "1502")

    def boom(*a, **k):
        raise _op_error()

    monkeypatch.setattr(pcq, "_trend_rows", boom)
    res = client.get("/api/complexes/1502/region-trend")
    assert res.status_code == 200 and res.json()["items"] == []


def test_F5_동네자료_실패는_503_다음_호출은_정상(db, client, monkeypatch):
    import services.public_pages as pp
    _emd_fixture(db, {str(9000 + i): "25050510" for i in range(10)})
    real = pp.get_sgis_neighborhood_items
    calls = {"n": 0}

    def flaky(*a, **k):
        calls["n"] += 1
        if calls["n"] == 1:
            raise _op_error()
        return real(*a, **k)

    monkeypatch.setattr(pp, "get_sgis_neighborhood_items", flaky)
    res = client.get(f"/api/regions/{SGG}/dongs/{DONG_X}")
    assert res.status_code == 503 and "cache-control" not in res.headers
    res = client.get(f"/api/regions/{SGG}/dongs/{DONG_X}")
    assert res.status_code == 200 and len(res.json()["neighborhood"]) == 1


def seo_region_stat(code, period):
    from crawler.service_region_stats import STAT_JEONSE_RATIO
    from db.models import RegionStats
    return RegionStats(region_code=code, stat_code=STAT_JEONSE_RATIO, period=period, value=Decimal("61.2"),
                       source="시험")


# F6 — 요약 기본 면적(화면 defaultArea 와 같은 규칙)


def test_F6_대표면적에_범위있으면_그것(db, client):
    _cpx(db, "1601", rep=59)
    _trade(db, "1601", month=CUTOFF6, area=59)
    _trade(db, "1601", month=CUTOFF6, area=84, prices=(1, 2, 3, 4))
    assert client.get("/api/complexes/1601/public-summary").json()["rep_area_key"] == 59


def test_F6_대표면적에_범위없으면_거래많은_범위면적(db, client):
    _cpx(db, "1602", rep=59)
    _trade(db, "1602", month=CUTOFF6, area=59, prices=(50000,), trades=[{"p": 50000, "g": "직거래"}])
    _trade(db, "1602", month=CUTOFF6, area=74, prices=(60000,))
    _trade(db, "1602", month=CUTOFF6, area=84, prices=(70000, 71000))
    assert client.get("/api/complexes/1602/public-summary").json()["rep_area_key"] == 84


def test_F6_6개월_범위가_없으면_대표면적_그것도_없으면_null(db, client):
    _cpx(db, "1603", rep=59)
    _trade(db, "1603", month=CUTOFF24, area=84)                            # 24개월 전쯤만
    _cpx(db, "1604")
    assert client.get("/api/complexes/1603/public-summary").json()["rep_area_key"] == 59
    assert client.get("/api/complexes/1604/public-summary").json()["rep_area_key"] is None


# F7 — 자료 마지막 달


def test_F7_data_last_ym_은_그_단지_마지막_거래달(db, client):
    _cpx(db, "1701")
    _trade(db, "1701", month=CUTOFF24)
    _trade(db, "1701", month=CUTOFF6, area=84)
    _cpx(db, "1702")
    assert client.get("/api/complexes/1701/public-summary").json()["data_last_ym"] == CUTOFF6
    assert client.get("/api/complexes/1702/public-summary").json()["data_last_ym"] is None


# F8 — 사이트맵 코드


def test_F8_사이트맵코드_허브와_동페이지(db, client):
    _dong_with_ab(db, DONG_X, ADDR_X, 10, 9000)                            # 페이지 있음 · A 0
    _dong_with_ab(db, DONG_Y, ADDR_Y, 10, 9100)
    _cpx(db, "9150", cortar=DONG_Y, addr=ADDR_Y)
    _trade(db, "9150")                                                     # Y 만 색인 대상
    _cpx(db, "9160", cortar="1168010100", addr="서울특별시 강남구 역삼동")
    _official(db, "9160")                                                  # 강남구 = B 만 → 허브 색인 아님
    res = client.get("/api/regions/sitemap-codes")
    assert res.status_code == 200 and res.headers["cache-control"] == "public, max-age=3600"
    assert res.json() == {"hubs": [SGG], "dongs": [DONG_Y]}
    hub = client.get(f"/api/regions/{SGG}/hub").json()
    dong_idx = {d["dong_code"] for d in hub["dongs"] if d["indexable"]}
    assert dong_idx == set(res.json()["dongs"])                             # 허브 판정과 같다


# F9 — 요약의 동 페이지 표시는 동 페이지와 같은 캐시 판정


def test_F9_9에서_10곳이_돼도_요약과_동페이지가_같은값(db, client):
    from services.cache import get_cache
    _dong_with_ab(db, DONG_X, ADDR_X, 9, 9000)
    assert client.get("/api/complexes/9000/public-summary").json()["breadcrumb"]["dong_has_page"] is False
    assert client.get(f"/api/regions/{SGG}/dongs/{DONG_X}").status_code == 404
    _cpx(db, "9009")
    _official(db, "9009")                                                  # 10곳째
    get_cache("public_summary").delete_by_prefix("")                       # 요약만 수명이 끝난 상황
    has_page = client.get("/api/complexes/9000/public-summary").json()["breadcrumb"]["dong_has_page"]
    status = client.get(f"/api/regions/{SGG}/dongs/{DONG_X}").status_code
    assert (has_page, status) == (False, 404)                              # 둘 다 옛 판정 — 어긋나지 않음
    hub_has_page = {d["dong_code"]: d["has_page"] for d in client.get(f"/api/regions/{SGG}/hub").json()["dongs"]}
    assert hub_has_page[DONG_X] is False                                   # 허브도 같은 옛 판정
    get_cache("public_summary").delete_by_prefix("")
    get_cache("region_dong_flags").delete_by_prefix("")                    # 판정 캐시 수명이 끝남
    has_page = client.get("/api/complexes/9000/public-summary").json()["breadcrumb"]["dong_has_page"]
    status = client.get(f"/api/regions/{SGG}/dongs/{DONG_X}").status_code
    hub_has_page = {d["dong_code"]: d["has_page"] for d in client.get(f"/api/regions/{SGG}/hub").json()["dongs"]}
    assert (has_page, status, hub_has_page[DONG_X]) == (True, 200, True)   # 허브 몸통 캐시는 그대로여도 같이 바뀜


# F12 — 지역 추이 실패는 허브만 503, 요약·동 페이지는 정상


def test_F12_지역추이_실패해도_요약과_동페이지는_200_허브만_503(db, client, monkeypatch):
    import db.public_complex_queries as pcq
    db.add(seo_region_stat(SGG, CUTOFF24))
    db.commit()
    _dong_with_ab(db, DONG_X, ADDR_X, 10, 9000)
    real = pcq._trend_rows

    def boom(*a, **k):
        raise _op_error()

    monkeypatch.setattr(pcq, "_trend_rows", boom)
    res = client.get("/api/complexes/9000/public-summary")
    assert res.status_code == 200 and res.json()["breadcrumb"]["dong_has_page"] is True
    assert client.get(f"/api/regions/{SGG}/dongs/{DONG_X}").status_code == 200
    assert client.get(f"/api/regions/{SGG}/hub").status_code == 503
    monkeypatch.setattr(pcq, "_trend_rows", real)
    res = client.get(f"/api/regions/{SGG}/hub")
    assert res.status_code == 200 and len(res.json()["region_trend"]["items"]) == 1


# 재검사 🟡 — F3 정확히 1.0㎡ 경계 · F2 같은 동 동명 3곳 이상


def test_F3_면적차이_정확히_1제곱미터는_포함(db, client):
    _cpx(db, "1311")
    _trade(db, "1311")
    _cpx(db, "1312", rep=59)
    _official(db, "1312", area="60.00", price=420_000_000)
    cards = {c["complex_no"]: c for c in client.get("/api/complexes/1311/public-summary").json()["nearby"]}
    assert cards["1312"]["official_price"] == 420_000_000


def test_F2_같은동_동명_3곳이면_모두와_달라야_그_단계(db, client):
    _cpx(db, "761", name="바다", hh=300, ymd="20000101")
    _cpx(db, "762", name="바다", hh=500, ymd="20010101")
    _cpx(db, "763", name="바다", hh=300, ymd="20050101")                 # 세대수가 하나와 같음 → 연도로
    _cpx(db, "771", name="하늘", hh=300, ymd="20000101")
    _cpx(db, "772", name="하늘", hh=300, ymd="20000601")
    _cpx(db, "773", name="하늘", hh=300, ymd="20030101")                 # 연도도 하나와 같음 → 번호
    suffix = {no: client.get(f"/api/complexes/{no}/public-summary").json()["title_suffix"] for no in ("761", "771")}
    assert suffix == {"761": "dong_year", "771": "dong_no"}


# F10 — 열쇠 공백·로그


def test_F10_열쇠_앞뒤_공백은_떼고_비교(client, monkeypatch):
    monkeypatch.setenv("SSR_SHARED_KEY", f"  {KEY}\n")
    for _ in range(70):
        assert client.get("/api/regions", headers={"X-SSR-Key": f"{KEY} "}).status_code == 200


def test_F10_켜질때_한줄_그리고_시간당_일치_불일치_횟수(monkeypatch, caplog):
    import logging

    from auth import rate_limiter as rl
    monkeypatch.setenv("SSR_SHARED_KEY", KEY)
    with caplog.at_level(logging.INFO, logger="auth.rate_limiter"):
        rl.RateLimitMiddleware(app=lambda *a: None)
        monkeypatch.setattr(rl, "_SSR_TALLY_SEC", 0)
        monkeypatch.setattr(rl, "_ssr_tally", {"ok": 0, "bad": 2, "since": 0.0})
        rl._count_ssr(True)
    assert "서버 렌더 열쇠 설정됨" in caplog.text
    assert "서버 렌더 열쇠 일치 1 · 불일치 2" in caplog.text
    assert KEY not in caplog.text


# F11 — 시험 빈틈


def test_F11_허브는_지역칸이_온전한_단지만(db, client):
    _cpx(db, "1901")
    _trade(db, "1901")
    _cpx(db, "1902", cortar="30200")                                       # 앞 5자리는 맞지만 10자리가 아님
    _trade(db, "1902")
    body = client.get(f"/api/regions/{SGG}/hub").json()
    nos = [c["complex_no"] for d in body["dongs"] for c in d["complexes"]]
    assert nos == ["1901"] and body["complex_count"] == 1


def test_F11_요약_캐시키에_기준월(db, client, monkeypatch):
    import services.public_pages as pp
    _cpx(db, "1903")
    monkeypatch.setattr(pp, "basis_ym", lambda today=None: "2026-10")
    assert client.get("/api/complexes/1903/public-summary").json()["basis_ym"] == "2026-10"
    monkeypatch.setattr(pp, "basis_ym", lambda today=None: "2026-11")
    assert client.get("/api/complexes/1903/public-summary").json()["basis_ym"] == "2026-11"


def test_F11_허용목록의_DB칸_이름도_네이버칸_아님():
    from services.public_pages import SUMMARY_BASE_FIELDS
    db_cols = set(SUMMARY_BASE_FIELDS.values())
    assert db_cols & NAVER_FIELDS == set()
    assert db_cols & {"latitude", "longitude", "nearby_median_price", "jeonse_rate", "recent_trades_6m"} == set()


# 재검사 변이 N2·N4·N5 — 시험 보강


def test_N2_사이트맵코드는_판정캐시를_그대로_따른다(db, client):
    import services.public_pages as pp
    fake_dong = "3020099999"
    pp._flags_cache().set(f"{SGG}:{pp.basis_ym()}", {
        "indexable": True,
        "dongs": {fake_dong: {"dong_name": "가짜동", "has_page": True, "indexable": True, "complex_count": 10}},
    })
    body = client.get("/api/regions/sitemap-codes").json()                 # DB 에는 단지 0
    assert body == {"hubs": [SGG], "dongs": [fake_dong]}


def test_N4_동페이지_카드에_C단지도_있다(db, client):
    _dong_with_ab(db, DONG_X, ADDR_X, 10, 9000)
    _cpx(db, "9400", type_="OPST", hh=1)
    nos = [c["complex_no"] for c in client.get(f"/api/regions/{SGG}/dongs/{DONG_X}").json()["complexes"]]
    assert "9400" in nos and nos[-1] == "9400" and len(nos) == 11


def test_N5_다른동_목록은_페이지있는_동만(db, client):
    dong_z, addr_z = "3020012500", "대전광역시 유성구 어은동"
    _dong_with_ab(db, DONG_X, ADDR_X, 10, 9000)
    _dong_with_ab(db, DONG_Y, ADDR_Y, 11, 9100)
    _dong_with_ab(db, dong_z, addr_z, 3, 9200)                             # 페이지 없음
    body = client.get(f"/api/regions/{SGG}/dongs/{DONG_X}").json()
    assert body["sibling_dongs"] == [{"dong_code": DONG_Y, "dong_name": "궁동"}]


# ══ PR 3a-2 — 같은 시군구 가까운 순 12곳(결정 27) ══════════════════════════════

LAT, LON = 36.350, 127.340


def _near(db, no, dlat, grade="A", cortar=DONG_X, addr=ADDR_X, hh=None, type_="APT", coords=True):
    kw = {"latitude": LAT + dlat, "longitude": LON} if coords else {}
    _cpx(db, no, cortar=cortar, addr=addr, hh=hh, type_=type_, **kw)
    if grade == "A":
        _trade(db, no)
    elif grade == "B":
        _official(db, no)


def test_가까운순_자기_C_좌표없음_제외_그리고_거리(db, client):
    from crawler.utils import haversine_km
    from services.public_pages import round_10m
    _near(db, "2001", 0.0)                                                # 자기
    _near(db, "2002", 0.003, cortar=DONG_Y, addr=ADDR_Y)                  # 333m · 다른 동도 후보
    _near(db, "2003", 0.001, grade="B", hh=10)                            # 111m · B
    _near(db, "2004", 0.002, hh=5000)                                     # 222m · 세대수 가장 큼
    _near(db, "2005", 0.0005, grade="C")                                  # C → 제외
    _near(db, "2006", 0.0002, coords=False)                               # 좌표 없음 → 제외
    _near(db, "2007", 0.0001, type_="OPST")                               # 오피스텔(C) → 제외
    _cpx(db, "2008", cortar="1168010100", addr="서울특별시 강남구 역삼동", latitude=LAT, longitude=LON)
    _trade(db, "2008")                                                    # 다른 시군구 → 제외
    body = client.get("/api/complexes/2001/public-summary").json()
    assert body["nearby_scope"] == "near"
    assert [c["complex_no"] for c in body["nearby"]] == ["2003", "2004", "2002"]
    assert body["nearby"][0]["distance_m"] == round_10m(haversine_km(LAT, LON, LAT + 0.001, LON))
    assert set(body["nearby"][0]) == CARD_KEYS | {"distance_m"}
    assert body["nearby_total"] == 6                                      # 봉명동 단지 수(자기·C·좌표 없음 포함)


def test_가까운순_같은거리는_번호순_12개_상한(db, client):
    _near(db, "2101", 0.0)
    for i in range(14):
        _near(db, str(2110 + i), 0.0005 * (i + 1))
    _near(db, "2130", 0.0005)                                             # 2110 과 같은 거리 → 번호 뒤
    nos = [c["complex_no"] for c in client.get("/api/complexes/2101/public-summary").json()["nearby"]]
    assert len(nos) == 12 and nos[:3] == ["2110", "2130", "2111"]


def test_같은동_두단지의_가까운목록이_서로_다르다(db, client):
    for i, d in enumerate((0.0, 0.004, 0.0005, 0.0035, 0.001, 0.003)):
        _near(db, str(2201 + i), d)
    a = [c["complex_no"] for c in client.get("/api/complexes/2201/public-summary").json()["nearby"]]
    b = [c["complex_no"] for c in client.get("/api/complexes/2202/public-summary").json()["nearby"]]
    assert a[0] == "2203" and b[0] == "2204" and a != b


def test_자기_좌표_없으면_같은동_옛방식으로(db, client):
    _near(db, "2301", 0.0, coords=False)
    _near(db, "2302", 0.001, hh=10)
    _near(db, "2303", 0.003, hh=900)
    body = client.get("/api/complexes/2301/public-summary").json()
    assert body["nearby_scope"] == "dong"
    assert [c["complex_no"] for c in body["nearby"]] == ["2303", "2302"]  # 세대수 순
    assert all("distance_m" not in c for c in body["nearby"])


def test_10m_반올림():
    from services.public_pages import round_10m
    assert (round_10m(0.1149), round_10m(0.115), round_10m(0.0), round_10m(1.2345)) == (110, 120, 0, 1230)


def test_가까운_후보는_캐시되고_실패는_굳지_않는다(db, client, monkeypatch):
    import services.public_pages as pp
    _near(db, "2401", 0.0)
    _near(db, "2402", 0.001)
    real = pp.grade_rows
    calls = {"n": 0}

    def flaky(*a, **k):
        if k.get("extra") and len(k["extra"]) == len(pp._CARD_EXTRA) + 2:
            calls["n"] += 1
            if calls["n"] == 1:
                raise _op_error()
        return real(*a, **k)

    monkeypatch.setattr(pp, "grade_rows", flaky)
    assert client.get("/api/complexes/2401/public-summary").status_code == 503
    assert client.get("/api/complexes/2401/public-summary").status_code == 200
    assert client.get("/api/complexes/2402/public-summary").status_code == 200
    assert calls["n"] == 2                                                # 2402 는 캐시된 후보를 썼다
