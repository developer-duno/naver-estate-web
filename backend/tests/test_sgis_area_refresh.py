"""SGIS 동네 통계 보조 수집(crawler/service_sgis.py) 회귀 — PR ②, 세션 456.

외부 호출 0 — 대부분은 SgisClient.get 바로 아래 경계(`sgis_client.http_get_json`)만 가짜로 바꾸고
토큰 캐시·오류코드 판정·응답 해석·실패 집계·저장은 진짜 함수를 지나간다.
응답 모양은 2026-10-09 탐침 원문(자양2동 11050650·서울 재해 목록) 칸 이름 그대로다.
"""

from decimal import Decimal

import pytest

from crawler import service_sgis as ss
from crawler import sgis_client as sc
from db.models import CrawlJob, SgisAreaStats

AUTH_URL = sc.BASE_URL + sc.AUTH_PATH
HOUSE_URL = sc.BASE_URL + ss.SUMMARY_PATHS["house"]
PPL_URL = sc.BASE_URL + ss.SUMMARY_PATHS["ppl"]
CORP_URL = sc.BASE_URL + ss.SUMMARY_PATHS["corp"]
FLOOD_LIST_URL = sc.BASE_URL + ss.DISASTER_PATHS["flood"][0]
FLOOD_BOARD_URL = sc.BASE_URL + ss.DISASTER_PATHS["flood"][1]
BASE_MS = 1_800_000_000_000


# ── 응답 팩토리 (탐침 원문 칸 이름) ──────────────────────────────────────


def _house(adm_cd):
    own = {"dom_soc_fac_per": "0", "officetel_cnt": 155, "row_house_per": "34.68", "adm_cd": adm_cd,
           "adm_nm": "자양2동", "dom_soc_fac_cnt": 0, "detach_house_cnt": 3416, "officetel_per": "1.5",
           "apart_per": "27.22", "row_house_cnt": 3586, "etc_per": "N/A", "etc_cnt": 369, "apart_cnt": 2815,
           "detach_house_per": "33.03"}
    sgg = dict(own, adm_cd=adm_cd[:5], adm_nm="광진구", officetel_cnt=9999)
    return {"errCd": 0, "errMsg": "Success", "result": [own, sgg]}


def _ppl(adm_cd):
    return {"errCd": 0, "result": [{"adm_cd": adm_cd, "adm_nm": "자양2동", "thirty_cnt": "3700", "thirty_per": "16.01"}]}


def _corp(adm_cd):
    themes = [{"dist_per": "2.89", "s_theme_cd_nm": "부동산중개업", "theme_cd": "1006", "b_theme_cd": "D"},
              {"dist_per": "0.07", "s_theme_cd_nm": "인테리어", "theme_cd": "1001", "b_theme_cd": "C"}]
    return {"errCd": 0, "result": [{"b_theme_list": ["C", "D"], "adm_cd": adm_cd, "theme_list": themes, "adm_nm": "x"}]}


def _flood_list(*adm_cds):
    return {"errCd": 0, "result": [{"sido_cd": c[:2], "base_year": "2025", "adm_cd": c, "adm_nm": "동"} for c in adm_cds]}


def _board():
    def item(name, yr, affc, adm):
        return {"iem_nm": name, "crtr_yr": yr, "unit": "명",
                "data_list": [{"div_nm": "20세미만", "affc_zone": "1", "administ_zone": "2"},
                              {"div_nm": "총합", "affc_zone": affc, "administ_zone": adm}]}
    return {"errCd": 0, "result": [item("인구", "2024", "7115", "10317"), item("가구", "2024", "2781", "4204"),
                                   item("주택", "2024", "2401", "3579"), item("지하건물", "2025", "553", "936"),
                                   item("농경지면적", "2024", None, None)]}


class FakeHttp:
    """URL → 응답 함수(params → dict 또는 예외). 인증은 tok1·tok2… 로 자동."""

    def __init__(self, routes):
        self.routes = routes
        self.calls: list[tuple[str, dict]] = []
        self.issued = 0

    def __call__(self, url, params):
        self.calls.append((url, dict(params)))
        if url == AUTH_URL:
            self.issued += 1
            return {"errCd": 0, "result": {"accessToken": f"tok{self.issued}", "accessTimeout": BASE_MS + 4 * 3600_000}}
        out = self.routes[url](params)
        if isinstance(out, Exception):
            raise out
        return out

    def urls(self, url):
        return [p for u, p in self.calls if u == url]


def _client(fake, monkeypatch):
    monkeypatch.setattr(sc, "http_get_json", fake)
    return sc.SgisClient(sc.TokenCache("k", "s", now_ms=lambda: BASE_MS), sleep=lambda s: None)


def _seed_dongs(db, *adm_cds):
    for cd in adm_cds:
        db.add(SgisAreaStats(adm_cd=cd, year=2024, item_code="to_in_001", value=Decimal("1000")))
    db.commit()


def _val(db, adm_cd, item):
    """(value, value_text) 또는 행이 없으면 None — ORM 으로 읽어야 SQLite 에서도 Decimal 로 온다."""
    db.expire_all()
    row = db.get(SgisAreaStats, (adm_cd, 2024, item))
    return None if row is None else (row.value, row.value_text)


def _job(db):
    return db.query(CrawlJob).filter(CrawlJob.job_type == "sgis_area").one()


# ── 대상 동 ───────────────────────────────────────────────────────────


def test_대상은_2024_총인구_행이_있는_8글자_동만(db):
    _seed_dongs(db, "11050650", "11050660", "11050")          # 5글자 시군구는 빠진다
    db.add(SgisAreaStats(adm_cd="21010510", year=2024, item_code="adm_nm", value_text="이름만"))
    db.add(SgisAreaStats(adm_cd="21010520", year=2023, item_code="to_in_001", value=Decimal("5")))
    db.commit()
    assert ss.select_target_dongs(db) == ["11050650", "11050660"]
    assert ss.select_target_dongs(db, limit=1) == ["11050650"]


# ── 요약 3종 ──────────────────────────────────────────────────────────


def test_요약3종_원문_칸이름으로_저장_NA는_NULL_정상완료(db, monkeypatch):
    _seed_dongs(db, "11050650")
    fake = FakeHttp({HOUSE_URL: lambda p: _house(p["adm_cd"]), PPL_URL: lambda p: _ppl(p["adm_cd"]),
                     CORP_URL: lambda p: _corp(p["adm_cd"])})
    st = ss.refresh_sgis_area(db, _client(fake, monkeypatch), only="house")
    st2 = ss.refresh_sgis_area(db, _client(fake, monkeypatch), only="ppl")
    st3 = ss.refresh_sgis_area(db, _client(fake, monkeypatch), only="corp")
    assert (st.stop_reason, st2.stop_reason, st3.stop_reason) == ("done", "done", "done")
    assert _val(db, "11050650", "api_officetel_cnt") == (Decimal("155"), None)     # 시군구 행(9999)이 아니라 그 동
    assert _val(db, "11050650", "api_apart_per")[0] == Decimal("27.22")
    assert _val(db, "11050650", "api_etc_per") == (None, None)                      # "N/A" → NULL
    assert _val(db, "11050650", "api_adm_nm") is None                               # 이름 칸은 안 넣는다
    assert _val(db, "11050650", "api_thirty_cnt")[0] == Decimal("3700")
    assert _val(db, "11050650", "api_corp_1006_per")[0] == Decimal("2.89")          # 설계서 §8 이름
    assert _val(db, "11050650", "api_corp_1001_per")[0] == Decimal("0.07")
    jobs = db.query(CrawlJob).filter(CrawlJob.job_type == "sgis_area").all()
    assert [(j.status, j.total_items, j.processed_items, j.error_message) for j in jobs] == [("completed", 1, 1, None)] * 3


def test_요약_응답에_그_동의_행이_없으면_실패로_세고_안_쓴다(db, monkeypatch):
    _seed_dongs(db, "11050650")
    fake = FakeHttp({HOUSE_URL: lambda p: _house("11050999")})
    st = ss.refresh_sgis_area(db, _client(fake, monkeypatch), only="house")
    assert (st.failed, st.saved) == (1, 0)
    assert _val(db, "11050650", "api_officetel_cnt") is None


def test_결과없음은_실패가_아니고_아무것도_안_쓴다(db, monkeypatch):
    _seed_dongs(db, "11050650")
    fake = FakeHttp({HOUSE_URL: lambda p: {"errCd": -100, "errMsg": "검색결과가 존재하지 않습니다"}})
    st = ss.refresh_sgis_area(db, _client(fake, monkeypatch), only="house")
    assert (st.failed, st.no_result, st.saved, st.stop_reason) == (0, 1, 0, "done")


# ── 실패 집계 (연속 20) ─────────────────────────────────────────────────


def _fail_then_ok(n_fail):
    state = {"n": 0}

    def route(p):
        state["n"] += 1
        return sc.SgisRequestError("HTTP 429") if state["n"] <= n_fail else _house(p["adm_cd"])
    return route


def test_연속_실패_19번은_계속_간다(db, monkeypatch):
    dongs = [f"110506{i:02d}" for i in range(21)]
    _seed_dongs(db, *dongs)
    fake = FakeHttp({HOUSE_URL: _fail_then_ok(19)})
    st = ss.refresh_sgis_area(db, _client(fake, monkeypatch), only="house")
    assert (st.stop_reason, st.failed, st.done) == ("done", 19, 21)
    assert _job(db).status == "completed"
    assert _val(db, dongs[18], "api_officetel_cnt") is None          # 실패한 동은 '자료 없음'으로도 안 쓴다
    assert _val(db, dongs[19], "api_officetel_cnt")[0] == Decimal("155")


def test_연속_실패_20번이면_회차_failed_우리말_사유(db, monkeypatch):
    dongs = [f"110506{i:02d}" for i in range(25)]
    _seed_dongs(db, *dongs)
    fake = FakeHttp({HOUSE_URL: _fail_then_ok(20)})
    st = ss.refresh_sgis_area(db, _client(fake, monkeypatch), only="house")
    assert (st.stop_reason, st.failed, st.done) == ("consecutive_failures", 20, 19)   # 20번째 동은 도중에 멈춤
    assert len(fake.urls(HOUSE_URL)) == 20                          # 21번째 동은 묻지 않는다
    job = _job(db)
    assert job.status == "failed" and job.completed_at is not None
    assert "실패가 20번 이어져 멈췄어요" in job.error_message
    assert "HTTP" not in job.error_message and "429" not in job.error_message


def test_오류코드는_토큰을_새로_받아_한번만_다시_묻는다(db, monkeypatch):
    _seed_dongs(db, "11050650")
    replies = [{"errCd": -401, "errMsg": "인증 정보가 존재하지 않습니다"}, _house("11050650")]
    fake = FakeHttp({HOUSE_URL: lambda p: replies.pop(0)})
    client = _client(fake, monkeypatch)
    st = ss.refresh_sgis_area(db, client, only="house")
    assert (st.failed, client.calls, fake.issued) == (0, 2, 2)
    assert [p["accessToken"] for p in fake.urls(HOUSE_URL)] == ["tok1", "tok2"]


def test_하루_상한에_닿으면_멈추고_완료로_사유를_남긴다(db, monkeypatch):
    _seed_dongs(db, "11050650", "11050660", "11050670")
    fake = FakeHttp({HOUSE_URL: lambda p: _house(p["adm_cd"]), PPL_URL: lambda p: _ppl(p["adm_cd"]),
                     CORP_URL: lambda p: _corp(p["adm_cd"])})
    client = _client(fake, monkeypatch)
    st = ss.refresh_sgis_area(db, client, call_cap=4)
    assert (st.stop_reason, client.calls, st.done) == ("daily_cap", 4, 1)
    job = _job(db)
    assert job.status == "completed" and "하루 호출 상한(4번)" in job.error_message
    assert fake.urls(FLOOD_LIST_URL) == []                          # 상한 뒤 재해로 넘어가지 않는다


def test_동_N개마다_넣고_커밋한다(db, monkeypatch):
    from scripts import load_sgis_stats

    _seed_dongs(db, *[f"110506{i:02d}" for i in range(5)])
    monkeypatch.setattr(ss, "FLUSH_EVERY", 2)
    sizes = []
    real = load_sgis_stats.upsert_rows
    monkeypatch.setattr(load_sgis_stats, "upsert_rows", lambda d, rows: sizes.append(len(rows)) or real(d, rows))
    fake = FakeHttp({PPL_URL: lambda p: _ppl(p["adm_cd"])})
    ss.refresh_sgis_area(db, _client(fake, monkeypatch), only="ppl")
    assert sizes == [4, 4, 2]                                        # 동 2·2·1 × 칸 2개


# ── 홍수·산사태 ────────────────────────────────────────────────────────


def test_재해_목록에_든_동만_상세_목록_밖은_0_목록_실패_시도는_안_쓴다(db, monkeypatch):
    _seed_dongs(db, "11050650", "11050660", "21010510")
    lists = {"11": _flood_list("11050650", "11999999"), "21": sc.SgisRequestError("HTTP 500")}
    fake = FakeHttp({FLOOD_LIST_URL: lambda p: lists[p["adm_cd"]], FLOOD_BOARD_URL: lambda p: _board()})
    st = ss.refresh_sgis_area(db, _client(fake, monkeypatch), only="flood")
    assert [p["adm_cd"] for p in fake.urls(FLOOD_LIST_URL)] == ["11", "21"]
    assert [p["adm_cd"] for p in fake.urls(FLOOD_BOARD_URL)] == ["11050650"]   # 목록 밖(11050660)·대상 밖(11999999) 상세 금지
    assert _val(db, "11050650", "ndsm_flood_affected")[0] == 1
    assert _val(db, "11050650", "ndsm_flood_affc_pop")[0] == Decimal("7115")
    assert _val(db, "11050650", "ndsm_flood_adm_pop")[0] == Decimal("10317")
    assert _val(db, "11050650", "ndsm_flood_affc_hh")[0] == Decimal("2781")
    assert _val(db, "11050650", "ndsm_flood_affc_house")[0] == Decimal("2401")
    assert _val(db, "11050650", "ndsm_flood_affc_basement")[0] == Decimal("553")
    assert _val(db, "11050650", "ndsm_flood_year")[0] == Decimal("2024")
    assert _val(db, "11050660", "ndsm_flood_affected")[0] == 0
    # 목록 호출이 실패한 시도(21)는 '안 위험(0)'으로 남기지 않는다
    assert _val(db, "21010510", "ndsm_flood_affected") is None
    assert st.failed_sidos == ["flood:21"]
    assert _job(db).status == "completed"
    assert "1곳" in _job(db).error_message


def test_재해_목록_결과없음은_영향_동_0곳(db, monkeypatch):
    _seed_dongs(db, "29010510")
    fake = FakeHttp({FLOOD_LIST_URL: lambda p: {"errCd": -100, "errMsg": "결과 없음"},
                     FLOOD_BOARD_URL: lambda p: pytest.fail("상세를 부르면 안 된다")})
    ss.refresh_sgis_area(db, _client(fake, monkeypatch), only="flood")
    assert _val(db, "29010510", "ndsm_flood_affected")[0] == 0


def test_재해_상세가_500이면_실패로_세고_그_동은_비운다(db, monkeypatch):
    _seed_dongs(db, "11050650")
    fake = FakeHttp({FLOOD_LIST_URL: lambda p: _flood_list("11050650"),
                     FLOOD_BOARD_URL: lambda p: sc.SgisRequestError("HTTP 500")})
    st = ss.refresh_sgis_area(db, _client(fake, monkeypatch), only="flood")
    assert st.failed == 1
    assert _val(db, "11050650", "ndsm_flood_affected") is None


# ── 연결부: 진짜 클라이언트 + 가장 낮은 HTTP 받기만 가짜 ─────────────────────


def test_연결부_진짜_클라이언트가_부른_주소_인자와_고른_값(db, monkeypatch):
    _seed_dongs(db, "11050650")
    seen = []

    class Resp:
        status_code = 200

        def __init__(self, body):
            self._body = body

        def json(self):
            return self._body

    def fake_get(url, params, timeout):
        seen.append((url, dict(params)))
        if url == AUTH_URL:
            return Resp({"errCd": 0, "result": {"accessToken": "TOKEN-A", "accessTimeout": str(BASE_MS + 4 * 3600_000)}})
        return Resp(_house(params["adm_cd"]))

    import requests
    monkeypatch.setattr(requests, "get", fake_get)
    client = sc.SgisClient(sc.TokenCache("KEY", "SECRET", now_ms=lambda: BASE_MS), sleep=lambda s: None)
    ss.refresh_sgis_area(db, client, only="house")
    assert seen == [
        (AUTH_URL, {"consumer_key": "KEY", "consumer_secret": "SECRET"}),
        (HOUSE_URL, {"adm_cd": "11050650", "accessToken": "TOKEN-A"}),
    ]
    assert _val(db, "11050650", "api_officetel_cnt")[0] == Decimal("155")
    assert _val(db, "11050650", "api_detach_house_per")[0] == Decimal("33.03")


def test_연결부_HTTP_오류는_실패(monkeypatch):
    class Resp:
        status_code = 429

    import requests
    monkeypatch.setattr(requests, "get", lambda url, params, timeout: Resp())
    with pytest.raises(sc.SgisRequestError, match="HTTP 429"):
        sc.http_get_json(HOUSE_URL, {})


def test_only_값이_틀리면_거부(db):
    with pytest.raises(ValueError):
        ss.refresh_sgis_area(db, None, only="air")
