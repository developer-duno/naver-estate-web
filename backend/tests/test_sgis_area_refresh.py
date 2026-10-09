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
    names = {"11": "서울특별시", "21": "부산광역시"}
    return {"errCd": 0, "result": [{"sido_cd": c[:2], "sido_nm": names.get(c[:2]), "base_year": "2025", "adm_cd": c,
                                    "adm_nm": "동"} for c in adm_cds]}


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
    assert _val(db, "11050650", "api_corp_1001_per") is None                         # 1006 만 저장(F5)
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


def test_실패19_성공1_실패19는_연속이_풀려_계속_간다(db, monkeypatch):
    """성공 한 번이 연속 수를 되돌리는지 — 되돌리지 않으면 38번째에서 멈춘다. 400곳 중 38곳(9.5%)이라 completed."""
    dongs = [f"11{i:06d}" for i in range(400)]
    _seed_dongs(db, *dongs)
    seq = {"n": 0}

    def route(p):
        seq["n"] += 1
        bad = seq["n"] <= 19 or 21 <= seq["n"] <= 39
        return sc.SgisRequestError("HTTP 429") if bad else _house(p["adm_cd"])
    fake = FakeHttp({HOUSE_URL: route})
    st = ss.refresh_sgis_area(db, _client(fake, monkeypatch), only="house")
    assert (st.stop_reason, st.failed, st.done) == ("done", 38, 400)
    job = _job(db)
    assert job.status == "completed"
    assert job.error_message == "동 38곳은 자료를 못 받아 비워 뒀어요(다시 돌리면 채워집니다)."
    assert _val(db, dongs[18], "api_officetel_cnt") is None          # 실패한 동은 '자료 없음'으로도 안 쓴다
    assert _val(db, dongs[19], "api_officetel_cnt")[0] == Decimal("155")


def test_정상_응답인데_그_동의_행이_없음이_20번이면_failed(db, monkeypatch):
    """ok 응답이라는 이유만으로 연속 수를 되돌리면 모양이 바뀐 창구에서 영영 안 멈춘다(검사관 B 🔴-1)."""
    dongs = [f"11{i:06d}" for i in range(30)]
    _seed_dongs(db, *dongs)
    fake = FakeHttp({HOUSE_URL: lambda p: _house("99999999")})
    st = ss.refresh_sgis_area(db, _client(fake, monkeypatch), only="house")
    assert (st.stop_reason, st.failed) == ("consecutive_failures", 20)
    assert len(fake.urls(HOUSE_URL)) == 20
    assert _job(db).status == "failed"


def test_실패_비율_10퍼센트_경계():
    assert ss.too_many_failures(99, 1000) is False      # 9.9%
    assert ss.too_many_failures(100, 1000) is True      # 10%
    assert ss.too_many_failures(0, 0) is False


@pytest.mark.parametrize("n_dongs, status", [(10, "failed"), (11, "completed")])
def test_실패한_동이_10퍼센트_이상이면_failed_미만이면_사유만(db, monkeypatch, n_dongs, status):
    dongs = [f"11{i:06d}" for i in range(n_dongs)]
    _seed_dongs(db, *dongs)
    fake = FakeHttp({HOUSE_URL: lambda p: sc.SgisRequestError("HTTP 500") if p["adm_cd"] == dongs[3] else _house(p["adm_cd"])})
    ss.refresh_sgis_area(db, _client(fake, monkeypatch), only="house")
    job = _job(db)
    assert job.status == status
    assert job.error_message.startswith("동 1곳은 자료를 못 받아 비워 뒀어요(다시 돌리면 채워집니다).")
    assert ("대상의 10% 이상이라 실패로 끝냈어요." in job.error_message) == (status == "failed")


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
    fake = FakeHttp({HOUSE_URL: lambda p: _house(p["adm_cd"]), CORP_URL: lambda p: _corp(p["adm_cd"])})
    client = _client(fake, monkeypatch)
    st = ss.refresh_sgis_area(db, client, call_cap=4)
    assert (st.stop_reason, client.calls, st.done) == ("daily_cap", 4, 2)
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
    lists = {"11": _flood_list("11050650"), "21": sc.SgisRequestError("HTTP 500")}
    fake = FakeHttp({FLOOD_LIST_URL: lambda p: lists[p["adm_cd"]], FLOOD_BOARD_URL: lambda p: _board()})
    st = ss.refresh_sgis_area(db, _client(fake, monkeypatch), only="flood")
    assert [p["adm_cd"] for p in fake.urls(FLOOD_LIST_URL)] == ["11", "21"]
    assert [p["adm_cd"] for p in fake.urls(FLOOD_BOARD_URL)] == ["11050650"]   # 목록 밖(11050660) 상세 금지
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
    assert st.failed_dongs == {"21010510"}                           # 실패 동은 목록이 실패한 그 시도 동만
    assert _job(db).status == "failed"                              # 목록 실패 시도의 동 1곳/3곳 = 10% 이상(C8)
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


# ── 보완(검사관 지적) F4·F5·F7·F8·F9·F10·F11 ───────────────────────────────


def test_재해_목록에_대상에_없는_코드가_있는_시도는_0을_안_쓴다(db, monkeypatch):
    """목록(2025 경계)의 코드가 대상(2024 통계)에 없으면 동 번호가 바뀐 곳이 있다 → 그 시도는 '영향 없음' 보류."""
    _seed_dongs(db, "11050650", "11050660", "21010510", "21010520")
    lists = {"11": _flood_list("11050650", "11999999"), "21": _flood_list("21010510")}
    fake = FakeHttp({FLOOD_LIST_URL: lambda p: lists[p["adm_cd"]], FLOOD_BOARD_URL: lambda p: _board()})
    ss.refresh_sgis_area(db, _client(fake, monkeypatch), only="flood")
    assert [p["adm_cd"] for p in fake.urls(FLOOD_BOARD_URL)] == ["11050650", "21010510"]   # 상세는 그대로
    assert _val(db, "11050650", "ndsm_flood_affected")[0] == 1
    assert _val(db, "11050660", "ndsm_flood_affected") is None        # 어긋남 1개 시도 → 0 안 씀
    assert _val(db, "21010520", "ndsm_flood_affected")[0] == 0        # 어긋남 0 시도 → 지금처럼 0
    job = _job(db)
    assert job.status == "completed"
    assert job.error_message == "서울특별시 홍수 목록은 동 번호가 바뀐 곳 1개가 있어 '영향 없음'을 쓰지 않았어요."


def test_어긋남_판정은_limit_과_무관하게_전체_대상으로(db, monkeypatch):
    _seed_dongs(db, "11050650", "11050660")
    fake = FakeHttp({FLOOD_LIST_URL: lambda p: _flood_list("11050660"), FLOOD_BOARD_URL: lambda p: _board()})
    ss.refresh_sgis_area(db, _client(fake, monkeypatch), only="flood", limit=1)
    assert _val(db, "11050650", "ndsm_flood_affected")[0] == 0        # 11050660 은 대상(전체)에 있어 어긋남 아님


def test_기본_실행은_ppl을_부르지_않는다(db, monkeypatch):
    _seed_dongs(db, "11050650")
    fake = FakeHttp({HOUSE_URL: lambda p: _house(p["adm_cd"]), CORP_URL: lambda p: _corp(p["adm_cd"]),
                     FLOOD_LIST_URL: lambda p: _flood_list(),
                     sc.BASE_URL + ss.DISASTER_PATHS["lndsld"][0]: lambda p: _flood_list()})
    ss.refresh_sgis_area(db, _client(fake, monkeypatch))
    assert fake.urls(PPL_URL) == []
    assert "ppl" not in ss.DEFAULT_KINDS and "ppl" in ss.KINDS
    assert _val(db, "11050650", "ndsm_lndsld_affected")[0] == 0


def test_외부_호출_순간에_트랜잭션이_열려_있지_않다(db, monkeypatch):
    _seed_dongs(db, "11050650", "11050660")
    states = []
    routes = {HOUSE_URL: lambda p: _house(p["adm_cd"]), CORP_URL: lambda p: _corp(p["adm_cd"]),
              FLOOD_LIST_URL: lambda p: _flood_list("11050650"), FLOOD_BOARD_URL: lambda p: _board(),
              sc.BASE_URL + ss.DISASTER_PATHS["lndsld"][0]: lambda p: _flood_list()}
    fake = FakeHttp({u: (lambda f: lambda p: states.append(db.in_transaction()) or f(p))(f) for u, f in routes.items()})
    ss.refresh_sgis_area(db, _client(fake, monkeypatch))
    assert len(states) == 7 and not any(states)


def test_코드_오류_동은_따로_세고_회차는_계속(db, monkeypatch):
    dongs = [f"11{i:06d}" for i in range(10)]
    _seed_dongs(db, *dongs)
    code_err = {"errCd": -200, "errMsg": "행정동 코드를 확인하세요"}
    fake = FakeHttp({HOUSE_URL: lambda p: code_err if p["adm_cd"] in dongs[:8] else _house(p["adm_cd"])})
    client = _client(fake, monkeypatch)
    st = ss.refresh_sgis_area(db, client, only="house")
    assert (st.stop_reason, st.code_error, st.failed, client.calls, fake.issued) == ("done", 8, 0, 10, 1)  # 재발급·재시도 0
    job = _job(db)
    assert job.status == "completed"
    assert job.error_message == "창구가 동 번호를 모른다고 한 8곳은 비워 뒀어요."
    assert _val(db, dongs[9], "api_officetel_cnt")[0] == Decimal("155")


def test_코드_오류가_200번_이어지면_failed(db, monkeypatch):
    _seed_dongs(db, *[f"11{i:06d}" for i in range(205)])
    fake = FakeHttp({HOUSE_URL: lambda p: {"errCd": -200, "errMsg": "x"}})
    st = ss.refresh_sgis_area(db, _client(fake, monkeypatch), only="house")
    assert (st.stop_reason, st.code_error) == ("consecutive_code_errors", 200)
    assert _job(db).status == "failed"


def test_쉼표_숫자와_모양_이상_값(db, monkeypatch):
    _seed_dongs(db, "11050650")
    body = _house("11050650")
    body["result"][0].update(officetel_cnt="1,234", apart_cnt={"x": 1}, etc_cnt="")
    fake = FakeHttp({HOUSE_URL: lambda p: body})
    st = ss.refresh_sgis_area(db, _client(fake, monkeypatch), only="house")
    assert _val(db, "11050650", "api_officetel_cnt")[0] == Decimal("1234")
    assert _val(db, "11050650", "api_apart_cnt") == (None, None)       # dict → 그 칸만 NULL
    assert _val(db, "11050650", "api_etc_cnt") == (None, None)         # 빈 문자열 → NULL(이상 아님)
    assert (st.bad_values, st.failed) == (1, 0)


def test_토큰은_만료_5분_전에_새로_받는다(monkeypatch):
    now = {"ms": BASE_MS}
    fake = FakeHttp({HOUSE_URL: lambda p: _house(p["adm_cd"])})
    monkeypatch.setattr(sc, "http_get_json", fake)
    client = sc.SgisClient(sc.TokenCache("k", "s", now_ms=lambda: now["ms"]), sleep=lambda s: None)
    client.get(ss.SUMMARY_PATHS["house"], adm_cd="11050650")
    now["ms"] = BASE_MS + 4 * 3600_000 - 6 * 60_000       # 만료 6분 전 — 그대로
    client.get(ss.SUMMARY_PATHS["house"], adm_cd="11050650")
    now["ms"] = BASE_MS + 4 * 3600_000 - 4 * 60_000       # 만료 4분 전 — 새로 받는다
    client.get(ss.SUMMARY_PATHS["house"], adm_cd="11050650")
    assert [p["accessToken"] for p in fake.urls(HOUSE_URL)] == ["tok1", "tok1", "tok2"]


def test_재해_상세가_실패한_동은_지난_회차_그_종류_행을_지운다(db, monkeypatch):
    _seed_dongs(db, "11050650", "21010510")
    for cd in ("11050650", "21010510"):
        for code, v in (("ndsm_flood_affected", "0"), ("ndsm_flood_affc_pop", "5"), ("ndsm_lndsld_affected", "0")):
            db.add(SgisAreaStats(adm_cd=cd, year=2024, item_code=code, value=Decimal(v)))
    db.commit()
    lists = {"11": _flood_list("11050650"), "21": sc.SgisRequestError("HTTP 500")}   # 21 은 이번에 아무것도 안 씀
    fake = FakeHttp({FLOOD_LIST_URL: lambda p: lists[p["adm_cd"]],
                     FLOOD_BOARD_URL: lambda p: sc.SgisRequestError("HTTP 500")})
    ss.refresh_sgis_area(db, _client(fake, monkeypatch), only="flood")
    assert _val(db, "11050650", "ndsm_flood_affected") is None
    assert _val(db, "11050650", "ndsm_flood_affc_pop") is None
    assert _val(db, "11050650", "ndsm_lndsld_affected")[0] == 0        # 다른 종류는 그대로
    assert _val(db, "11050650", "to_in_001")[0] == Decimal("1000")
    # 다른 동의 같은 종류 행은 남는다(지우기는 실패한 그 동만)
    assert _val(db, "21010510", "ndsm_flood_affected")[0] == 0
    assert _val(db, "21010510", "ndsm_flood_affc_pop")[0] == Decimal("5")


# ── 후속(PR ② 검사관 🟡) C6·C7·C8 ─────────────────────────────────────────


def test_저장할_값이_0개인_요약은_실패로_센다(db, monkeypatch):
    """corp 에 1006 이 없거나 house 칸이 비면 저장 0행 — 성공으로 세면 업종 코드가 바뀌어도 조용히 빈 값이 된다."""
    _seed_dongs(db, "11050650", "11050660")
    corp_no_1006 = _corp("11050650")
    corp_no_1006["result"][0]["theme_list"] = [t for t in corp_no_1006["result"][0]["theme_list"] if t["theme_cd"] != "1006"]
    fake = FakeHttp({CORP_URL: lambda p: corp_no_1006 if p["adm_cd"] == "11050650" else _corp(p["adm_cd"]),
                     HOUSE_URL: lambda p: {"errCd": 0, "result": [{"adm_cd": p["adm_cd"], "adm_nm": "빈 동"}]}})
    st = ss.refresh_sgis_area(db, _client(fake, monkeypatch), only="corp")
    assert (st.failed, st.failed_dongs) == (1, {"11050650"})
    assert _val(db, "11050660", "api_corp_1006_per")[0] == Decimal("2.89")
    st2 = ss.refresh_sgis_area(db, _client(fake, monkeypatch), only="house")
    assert (st2.failed, st2.failed_dongs, st2.saved) == (2, {"11050650", "11050660"}, 0)


def test_재해_상세가_결과없음이면_지난_회차_그_종류_행을_지운다(db, monkeypatch):
    _seed_dongs(db, "11050650", "11050660")
    for cd in ("11050650", "11050660"):
        db.add(SgisAreaStats(adm_cd=cd, year=2024, item_code="ndsm_flood_affected", value=Decimal("0")))
        db.add(SgisAreaStats(adm_cd=cd, year=2024, item_code="ndsm_flood_affc_pop", value=Decimal("5")))
    db.commit()
    fake = FakeHttp({FLOOD_LIST_URL: lambda p: _flood_list("11050650", "11050660"),
                     FLOOD_BOARD_URL: lambda p: {"errCd": -100, "errMsg": "결과 없음"} if p["adm_cd"] == "11050650"
                     else _board()})
    st = ss.refresh_sgis_area(db, _client(fake, monkeypatch), only="flood")
    assert (st.failed, st.no_result) == (0, 1)
    assert _val(db, "11050650", "ndsm_flood_affected") is None       # 옛 '영향 없음(0)'이 남지 않는다
    assert _val(db, "11050650", "ndsm_flood_affc_pop") is None
    assert _val(db, "11050660", "ndsm_flood_affected")[0] == 1       # 이웃 동은 이번 상세 값


def test_재해_목록이_시도_17곳_다_실패면_failed(db, monkeypatch):
    """목록 실패는 연속 17회(20 미만)라 연속 실패로는 안 멈춘다 — 그 시도 동을 실패 동으로 세어 10% 판정으로 잡는다."""
    sidos = ["11", "21", "22", "23", "24", "25", "26", "29", "31", "32", "33", "34", "35", "36", "37", "38", "39"]
    _seed_dongs(db, *[f"{s}010510" for s in sidos])
    fake = FakeHttp({FLOOD_LIST_URL: lambda p: sc.SgisRequestError("HTTP 500"),
                     FLOOD_BOARD_URL: lambda p: pytest.fail("목록이 실패한 시도는 상세를 부르지 않는다")})
    st = ss.refresh_sgis_area(db, _client(fake, monkeypatch), only="flood")
    assert (st.stop_reason, len(st.failed_sidos), len(st.failed_dongs)) == ("done", 17, 17)
    job = _job(db)
    assert job.status == "failed"
    assert "목록을 못 받은 시도가 17곳" in job.error_message


def test_재해_목록이_정상코드인데_모양이_이상하면_그_시도는_0을_안_쓴다(db, monkeypatch):
    """errCd 0 + result 가 dict — 빈 목록으로 읽으면 그 시도 동 전부에 '위험 없음(0)'을 쓰게 된다(검사관 🟡-1)."""
    _seed_dongs(db, "11050650", "11050660")
    fake = FakeHttp({FLOOD_LIST_URL: lambda p: {"errCd": 0, "result": {}},
                     FLOOD_BOARD_URL: lambda p: pytest.fail("목록 모양이 이상한 시도는 상세를 부르지 않는다")})
    st = ss.refresh_sgis_area(db, _client(fake, monkeypatch), only="flood")
    assert _val(db, "11050650", "ndsm_flood_affected") is None
    assert _val(db, "11050660", "ndsm_flood_affected") is None
    assert st.failed_sidos == ["flood:11"]


def test_업종_1006_비율이_0이면_실패가_아니고_0을_저장한다(db, monkeypatch):
    """중개업 0% 동(시골 등)은 정상 값이다 — '값 0개' 실패(C6)를 '값이 0'까지 넓히면 안 된다(검사관 🟡-4)."""
    _seed_dongs(db, "11050650")
    body = _corp("11050650")
    for t in body["result"][0]["theme_list"]:
        if t["theme_cd"] == "1006":
            t["dist_per"] = "0"
    fake = FakeHttp({CORP_URL: lambda p: body})
    st = ss.refresh_sgis_area(db, _client(fake, monkeypatch), only="corp")
    assert (st.failed, st.failed_dongs) == (0, set())
    assert _val(db, "11050650", "api_corp_1006_per")[0] == Decimal("0")
    assert _job(db).status == "completed"
