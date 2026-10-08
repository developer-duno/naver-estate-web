"""단지 → SGIS 행정동 매핑 스크립트(scripts/map_complex_sgis.py) 회귀 — V071, 세션 453.

외부 호출 0 — 가장 낮은 경계 `http_get_json` 만 가짜로 바꾸고, 응답 해석·8글자 조립·토큰 캐시·
실패 집계는 진짜 함수를 지나간다. complexes 의 두 칸(sgis_emd_cd·sgis_mapped_at)은 Complex 모델에
아직 없으므로(V071 운영 적용 전 재시작 대비) 픽스처에서 SQLite 표에 직접 더한다.
"""

import pytest
from sqlalchemy import text

from db.models import Complex
from scripts import map_complex_sgis as mc

AUTH_URL = mc.BASE_URL + mc.AUTH_PATH
RGEO_URL = mc.BASE_URL + mc.RGEO_PATH
HOUR_MS = 60 * 60 * 1000
BASE_MS = 1_800_000_000_000   # 실측처럼 밀리초 시각


@pytest.fixture
def cdb(db):
    db.execute(text("ALTER TABLE complexes ADD COLUMN sgis_emd_cd TEXT"))
    db.execute(text("ALTER TABLE complexes ADD COLUMN sgis_mapped_at TIMESTAMP"))
    db.commit()
    return db


def _seed(db, no: str, lat=37.5006, lon=127.0364):
    db.add(Complex(complex_no=no, complex_name=f"단지{no}", latitude=lat, longitude=lon))
    db.commit()


def _ok(sido="11", sgg="230", emd="640"):
    return {"errCd": 0, "errMsg": "Success",
            "result": [{"sido_cd": sido, "sgg_cd": sgg, "emdong_cd": emd, "emdong_nm": "역삼1동"}]}


class FakeHttp:
    """URL 별로 응답(dict) 또는 예외를 차례로 돌려준다. 호출 기록을 남긴다."""

    def __init__(self, rgeo, auth=None):
        self.rgeo = list(rgeo)
        self.auth = list(auth) if auth else None
        self.calls: list[tuple[str, dict]] = []
        self.issued = 0

    def __call__(self, url, params):
        self.calls.append((url, dict(params)))
        if url == AUTH_URL:
            self.issued += 1
            if self.auth:
                item = self.auth.pop(0)
            else:
                item = {"errCd": 0, "result": {"accessToken": f"tok{self.issued}", "accessTimeout": BASE_MS + 4 * HOUR_MS}}
        else:
            item = self.rgeo.pop(0) if len(self.rgeo) > 1 else self.rgeo[0]
        if isinstance(item, Exception):
            raise item
        return item


def _tokens(now=lambda: BASE_MS):
    return mc.TokenCache("k", "s", now_ms=now)


def _emd(db, no):
    return db.execute(text("SELECT sgis_emd_cd, sgis_mapped_at FROM complexes WHERE complex_no = :n"),
                      {"n": no}).one()


# ── 응답 → 8글자 ─────────────────────────────────────────────────────


def test_응답_조각을_이어_8글자로_저장(cdb, monkeypatch):
    _seed(cdb, "A1")
    fake = FakeHttp([_ok()])
    monkeypatch.setattr(mc, "http_get_json", fake)
    st = mc.run(cdb, _tokens(), limit=10, sleep=lambda s: None)
    assert (st.ok, st.failed, st.calls) == (1, 0, 1)
    code, at = _emd(cdb, "A1")
    assert code == "11230640" and at is not None
    # 경도 → x_coor, 위도 → y_coor, addr_type 20, 토큰 동반
    _, params = [c for c in fake.calls if c[0] == RGEO_URL][0]
    assert params["x_coor"] == 127.0364 and params["y_coor"] == 37.5006
    assert params["addr_type"] == 20 and params["accessToken"] == "tok1"


def test_조각이_빠진_응답은_실패로_센다(cdb, monkeypatch):
    _seed(cdb, "A1")
    monkeypatch.setattr(mc, "http_get_json", FakeHttp([{"errCd": 0, "result": [{"sido_cd": "11", "sgg_cd": "230"}]}]))
    st = mc.run(cdb, _tokens(), limit=10, sleep=lambda s: None)
    assert (st.ok, st.failed) == (0, 1)
    assert _emd(cdb, "A1")[0] is None


def test_결과없음_100_은_NULL_유지_그리고_실패가_아니다(cdb, monkeypatch):
    _seed(cdb, "A1")
    _seed(cdb, "A2")
    monkeypatch.setattr(mc, "http_get_json", FakeHttp([{"errCd": -100, "errMsg": "검색결과가 존재하지 않습니다"}, _ok()]))
    st = mc.run(cdb, _tokens(), limit=10, sleep=lambda s: None)
    assert (st.no_result, st.ok, st.failed) == (1, 1, 0)
    code, at = _emd(cdb, "A1")
    assert code is None and at is not None          # 물어본 시각만 찍힌다
    assert _emd(cdb, "A2")[0] == "11230640"


def test_결과없음_단지는_다음_실행에서_다시_묻지_않는다(cdb, monkeypatch):
    _seed(cdb, "A1")
    fake = FakeHttp([{"errCd": -100, "errMsg": "결과 없음"}])
    monkeypatch.setattr(mc, "http_get_json", fake)
    mc.run(cdb, _tokens(), limit=10, sleep=lambda s: None)
    st2 = mc.run(cdb, _tokens(), limit=10, sleep=lambda s: None)
    assert st2.targets == 0 and st2.calls == 0
    # sgis_mapped_at 을 비우면 다시 대상이 된다
    cdb.execute(text("UPDATE complexes SET sgis_mapped_at = NULL WHERE complex_no = 'A1'"))
    cdb.commit()
    assert mc.run(cdb, _tokens(), limit=10, sleep=lambda s: None).targets == 1


def test_실패한_단지는_아무것도_안_찍고_다음_실행에_다시_묻는다(cdb, monkeypatch):
    _seed(cdb, "A1")
    monkeypatch.setattr(mc, "http_get_json", FakeHttp([mc.SgisRequestError("HTTP 503")]))
    mc.run(cdb, _tokens(), limit=10, sleep=lambda s: None)
    assert _emd(cdb, "A1") == (None, None)
    assert mc.run(cdb, _tokens(), limit=10, sleep=lambda s: None).targets == 1


def test_묻는_사이에_다른_쪽이_채운_값은_덮지_않는다(cdb, monkeypatch):
    """대상 목록을 읽은 뒤 다른 프로세스(같은 날 두 번째 실행 등)가 먼저 채우면 그 값을 지킨다."""
    from db.database import SessionLocal

    _seed(cdb, "A1")

    def fake(url, params):
        if url == AUTH_URL:
            return {"errCd": 0, "result": {"accessToken": "t", "accessTimeout": BASE_MS + 4 * HOUR_MS}}
        with SessionLocal() as other:
            other.execute(text("UPDATE complexes SET sgis_emd_cd = '99999999' WHERE complex_no = 'A1'"))
            other.commit()
        return _ok()

    monkeypatch.setattr(mc, "http_get_json", fake)
    st = mc.run(cdb, _tokens(), limit=10, sleep=lambda s: None)
    assert st.ok == 1
    cdb.expire_all()
    assert _emd(cdb, "A1")[0] == "99999999"


def test_이미_채운_단지와_좌표없는_단지는_고르지_않는다(cdb, monkeypatch):
    _seed(cdb, "A1")
    _seed(cdb, "A2", lat=None, lon=None)
    _seed(cdb, "A3")
    cdb.execute(text("UPDATE complexes SET sgis_emd_cd = '11230650' WHERE complex_no = 'A3'"))
    cdb.commit()
    monkeypatch.setattr(mc, "http_get_json", FakeHttp([_ok()]))
    st = mc.run(cdb, _tokens(), limit=10, sleep=lambda s: None)
    assert st.targets == 1 and st.calls == 1
    assert _emd(cdb, "A3")[0] == "11230650"   # 덮어쓰지 않음


def test_dry_run_은_부르지만_DB_는_안_쓴다(cdb, monkeypatch):
    _seed(cdb, "A1")
    monkeypatch.setattr(mc, "http_get_json", FakeHttp([_ok()]))
    st = mc.run(cdb, _tokens(), limit=10, dry_run=True, sleep=lambda s: None)
    assert st.ok == 1 and st.calls == 1
    assert _emd(cdb, "A1") == (None, None)


# ── 실패 집계 (error-propagation 룰 5) ───────────────────────────────


def test_429_가_연속_20회면_멈춘다(cdb, monkeypatch):
    for i in range(25):
        _seed(cdb, f"B{i:02d}")
    fake = FakeHttp([mc.SgisRequestError("HTTP 429")])
    monkeypatch.setattr(mc, "http_get_json", fake)
    st = mc.run(cdb, _tokens(), limit=100, sleep=lambda s: None)
    assert st.stop_reason == "consecutive_failures"
    assert st.failed == 20 and st.ok == 0 and st.no_result == 0
    assert len([c for c in fake.calls if c[0] == RGEO_URL]) == 20     # 21번째부터 안 부른다
    assert cdb.execute(text("SELECT count(*) FROM complexes WHERE sgis_emd_cd IS NOT NULL")).scalar() == 0


def test_실패_사이에_성공이_끼면_연속_횟수가_풀린다(cdb, monkeypatch):
    for i in range(30):
        _seed(cdb, f"C{i:02d}")
    seq = ([mc.SgisRequestError("HTTP 503")] * 15 + [_ok()]) + [mc.SgisRequestError("HTTP 503")] * 14
    monkeypatch.setattr(mc, "http_get_json", FakeHttp(seq))
    st = mc.run(cdb, _tokens(), limit=100, sleep=lambda s: None)
    assert st.stop_reason == "done" and st.failed == 29 and st.ok == 1


def test_진짜_HTTP_경계도_429_를_실패로_바꾼다(monkeypatch):
    """http_get_json 자체 — requests 응답 429 는 None 이 아니라 SgisRequestError."""
    import requests

    class R:
        status_code = 429

        def json(self):
            return {}

    monkeypatch.setattr(requests, "get", lambda *a, **k: R())
    with pytest.raises(mc.SgisRequestError, match="429"):
        mc.http_get_json(RGEO_URL, {})


def test_호출_상한에_닿으면_멈춘다(cdb, monkeypatch):
    for i in range(5):
        _seed(cdb, f"D{i}")
    monkeypatch.setattr(mc, "http_get_json", FakeHttp([_ok()]))
    st = mc.run(cdb, _tokens(), limit=5, call_cap=3, sleep=lambda s: None)
    assert st.stop_reason == "daily_cap" and st.calls == 3 and st.ok == 3


def test_결과없음이_연속_상한이면_멈춘다(cdb, monkeypatch):
    assert mc.MAX_CONSECUTIVE_NO_RESULT == 200
    monkeypatch.setattr(mc, "MAX_CONSECUTIVE_NO_RESULT", 5)
    cdb.add_all([Complex(complex_no=f"N{i}", complex_name="n", latitude=37.5, longitude=127.0) for i in range(8)])
    cdb.commit()
    fake = FakeHttp([{"errCd": -100, "errMsg": "결과 없음"}])
    monkeypatch.setattr(mc, "http_get_json", fake)
    st = mc.run(cdb, _tokens(), limit=100, sleep=lambda s: None)
    assert st.stop_reason == "consecutive_no_result" and st.no_result == 5 and st.calls == 5


def test_결과없음_사이에_성공이나_실패가_끼면_연속_횟수가_풀린다(cdb, monkeypatch):
    monkeypatch.setattr(mc, "MAX_CONSECUTIVE_NO_RESULT", 5)
    cdb.add_all([Complex(complex_no=f"N{i:02d}", complex_name="n", latitude=37.5, longitude=127.0) for i in range(13)])
    cdb.commit()
    none = {"errCd": -100, "errMsg": "결과 없음"}
    seq = [none] * 4 + [_ok()] + [none] * 4 + [mc.SgisRequestError("HTTP 503")] + [none] * 3
    monkeypatch.setattr(mc, "http_get_json", FakeHttp(seq))
    st = mc.run(cdb, _tokens(), limit=100, sleep=lambda s: None)
    assert st.stop_reason == "done" and st.no_result == 11 and st.ok == 1 and st.failed == 1


def test_main_은_결과없음_연속이면_종료코드_2(cdb, monkeypatch, capsys):
    monkeypatch.setattr(mc, "MAX_CONSECUTIVE_NO_RESULT", 2)
    monkeypatch.setenv("SGIS_CONSUMER_KEY", "k")
    monkeypatch.setenv("SGIS_CONSUMER_SECRET", "s")
    monkeypatch.setattr("dotenv.load_dotenv", lambda *a, **k: False)
    _seed(cdb, "A1")
    _seed(cdb, "A2")
    monkeypatch.setattr(mc, "http_get_json", FakeHttp([{"errCd": -100, "errMsg": "결과 없음"}]))
    assert mc.main(["--interval", "0"]) == 2
    assert "좌표 칸" in capsys.readouterr().out


# ── 조각 자리 수 ─────────────────────────────────────────────────────


@pytest.mark.parametrize("pieces,expected", [
    (("11", "230", "640"), "11230640"),
    ((11, 230, 640), "11230640"),             # 숫자형 조각
    ((31, 10, 510), "31010510"),              # sgg 010 이 숫자 10 으로 와도 앞 0 을 채운다
    (("31", "010", "510"), "31010510"),
    (("11", "2300", "640"), None),            # 조각 길이가 틀리면 저장 안 함
    (("1", "2300", "640"), None),             # 합치면 8글자지만 조각이 틀림
    (("11", "23a", "640"), None),
    ((True, "230", "640"), None),
    (("11", "230", ""), None),                # 빈 조각을 0 으로 채워 가짜 코드(11230000)를 만들지 않는다
    (("11", "  ", "640"), None),              # 공백 조각도 같다
])
def test_조각별로_자리_수를_채우고_검사한다(pieces, expected):
    sido, sgg, emd = pieces
    assert mc.build_emd_cd([{"sido_cd": sido, "sgg_cd": sgg, "emdong_cd": emd}]) == expected


def test_조각_길이가_틀린_응답은_저장하지_않는다(cdb, monkeypatch):
    _seed(cdb, "A1")
    monkeypatch.setattr(mc, "http_get_json", FakeHttp([_ok(sgg="2300")]))
    st = mc.run(cdb, _tokens(), limit=10, sleep=lambda s: None)
    assert st.failed == 1 and _emd(cdb, "A1") == (None, None)


# ── 토큰 ─────────────────────────────────────────────────────────────


def test_토큰은_만료_전까지_다시_쓰고_만료되면_새로_받는다(monkeypatch):
    now = {"ms": BASE_MS}
    fake = FakeHttp([_ok()])
    monkeypatch.setattr(mc, "http_get_json", fake)
    tokens = mc.TokenCache("k", "s", now_ms=lambda: now["ms"])
    assert tokens.get() == "tok1"
    now["ms"] = BASE_MS + 3 * HOUR_MS                      # 4시간짜리 — 아직 여유
    assert tokens.get() == "tok1" and fake.issued == 1
    now["ms"] = BASE_MS + 4 * HOUR_MS - mc.TOKEN_MARGIN_MS  # 만료 5분 전 → 새로 받는다
    assert tokens.get() == "tok2" and fake.issued == 2


def test_accessTimeout_이_초_단위여도_밀리초로_본다():
    assert mc._timeout_ms(1_800_000_000) == 1_800_000_000_000
    assert mc._timeout_ms(1_800_000_000_000) == 1_800_000_000_000
    assert mc._timeout_ms("x") is None


def test_모르는_오류코드면_토큰을_새로_받아_한_번만_다시_묻는다(cdb, monkeypatch):
    _seed(cdb, "A1")
    _seed(cdb, "A2")
    fake = FakeHttp([{"errCd": -401, "errMsg": "인증 실패"}, _ok(),          # A1: 재발급 뒤 성공
                     {"errCd": -999, "errMsg": "?"}, {"errCd": -999, "errMsg": "?"}])  # A2: 두 번 다 오류
    monkeypatch.setattr(mc, "http_get_json", fake)
    st = mc.run(cdb, _tokens(), limit=10, sleep=lambda s: None)
    assert (st.ok, st.failed, st.calls) == (1, 1, 4)
    assert fake.issued == 3                       # 처음 1 + 다시 묻기 2
    assert _emd(cdb, "A1")[0] == "11230640" and _emd(cdb, "A2")[0] is None


def test_인증이_429_로_막혀도_실패로_센다(cdb, monkeypatch):
    _seed(cdb, "A1")
    monkeypatch.setattr(mc, "http_get_json", FakeHttp([_ok()], auth=[mc.SgisRequestError("HTTP 429")]))
    st = mc.run(cdb, _tokens(), limit=10, sleep=lambda s: None)
    assert st.failed == 1 and st.ok == 0
