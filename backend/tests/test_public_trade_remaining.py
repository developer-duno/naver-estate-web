"""정부 실거래가 창구 "오늘 남은 횟수" 기록·경보 회귀 테스트 (세션 421).

배경: 같은 열쇠를 naver-estate-web·mibunyang·KOSPI 세 프로젝트가 같이 쓴다. 2026-09-26 토요일
주간 수집이 05:40 부터 한도 초과(429)로 끝났는데, 우리 쪽 일일 게이트는 남의 사용분을 못 봐
미리 알 수 없었다. 창구는 응답 헤더(x-ratelimit-remaining·x-ratelimit-limit)로 남은 횟수를
200·429 모두에 알려준다(실측) — 그 값을 읽어 두고(추가 호출 0)
  (a) 클래스에 최신값 보관
  (b) 두 잡의 시작·끝 남은 횟수를 로그 한 줄로
  (c) 시작 때 남은 횟수가 이번 회차 예상 호출 수보다 적으면 텔레그램 1건

외부 호출 0 — 응답은 가짜(MagicMock + curl_cffi 진짜 Headers), 텔레그램은 patch.
"""
import logging
import re
from datetime import date as _real_date
from unittest.mock import MagicMock, patch

import pytest
from curl_cffi.requests import Headers

from db.models import Complex

_EMPTY_ENVELOPE = {
    "response": {
        "header": {"resultCode": "00"},
        "body": {"totalCount": 0, "items": ""},
    }
}

_SVC_LOGGER = "crawler.service_public"


def _response(status_code: int, headers: dict | None, payload: dict | None = None):
    """가짜 응답 — 헤더는 curl_cffi 가 실제로 돌려주는 Headers 클래스(대소문자 무시)로 만든다."""
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = payload or _EMPTY_ENVELOPE
    resp.headers = Headers(headers or {})
    return resp


def _rl_headers(remaining, limit="10000") -> dict:
    # 대문자 섞인 이름 — 창구가 보내는 모양(429 실측: X-RateLimit-Remaining)
    h = {"X-RateLimit-Remaining": str(remaining)}
    if limit is not None:
        h["X-RateLimit-Limit"] = str(limit)
    return h


@pytest.fixture
def _api_no_wait():
    """재시도 대기·스로틀·키·일일 게이트를 시험용으로 고정 (실 네트워크 0)."""
    from crawler.public_data_api import PublicDataAPI
    PublicDataAPI.reset()
    with patch("crawler.public_data_api.time.sleep"), \
         patch.object(PublicDataAPI, "_throttle"), \
         patch.object(PublicDataAPI, "_get_service_key", return_value="test-key"), \
         patch.object(PublicDataAPI, "_check_daily_limit", return_value=True), \
         patch.object(PublicDataAPI, "_get_session") as mock_session:
        yield PublicDataAPI, mock_session
    PublicDataAPI.reset()


# ── (a) 헤더 보관 ─────────────────────────────────────────────────────────


def test_a_200_헤더를_보관하고_429로_갱신되며_헤더없으면_이전값_유지(_api_no_wait):
    api, mock_session = _api_no_wait
    get = mock_session.return_value.get
    assert api.last_rate_limit() is None, "아직 응답을 본 적 없으면 None"

    # 200 — 남은 9,755 / 한도 10,000
    get.return_value = _response(200, _rl_headers(9755))
    assert api.get_apt_trades("11680", "202603") is not None
    rl = api.last_rate_limit()
    assert rl["remaining"] == 9755 and rl["limit"] == 10000
    assert rl["at"] is not None

    # 429 — 재시도가 다 429 여도 헤더(남은 0)는 읽는다
    get.return_value = _response(429, _rl_headers(0))
    assert api.get_apt_trades("11680", "202604") is None
    rl = api.last_rate_limit()
    assert rl["remaining"] == 0 and rl["limit"] == 10000

    # 헤더 없는 응답·숫자가 아닌 값은 이전 값을 지운다거나 덮지 않는다
    get.return_value = _response(200, {})
    api.get_apt_trades("11680", "202605")
    get.return_value = _response(200, {"x-ratelimit-remaining": "abc"})
    api.get_apt_trades("11680", "202606")
    rl = api.last_rate_limit()
    assert rl["remaining"] == 0 and rl["limit"] == 10000


def test_a_한도_헤더가_없으면_limit_None(_api_no_wait):
    api, mock_session = _api_no_wait
    mock_session.return_value.get.return_value = _response(500, _rl_headers(42, limit=None))
    assert api.get_apt_trades("11680", "202603") is None
    assert api.last_rate_limit()["remaining"] == 42
    assert api.last_rate_limit()["limit"] is None


# ── 잡 실행 도우미 (가짜 창구가 호출마다 남은 횟수 헤더를 흉내) ───────────


class _FakeDate(_real_date):
    """date.today() 고정 (test_public_trade_429.py 패턴 답습)"""

    _today = None

    @classmethod
    def today(cls):
        return cls._today


class _FakeWindow:
    """호출 한 번마다 남은 횟수를 1 줄이며 헤더를 보관시킨다. start=None 이면 헤더 없음."""

    def __init__(self, start: int | None):
        self.remaining = start
        self.calls = 0

    def hit(self):
        from crawler.public_data_api import PublicDataAPI
        self.calls += 1
        if self.remaining is None:
            return
        PublicDataAPI._remember_rate_limit(_response(200, _rl_headers(self.remaining)))
        self.last_seen = self.remaining
        self.remaining -= 1


def _add_regions(db, n: int):
    for k in range(n):
        code = f"{11000 + k * 10:05d}"
        db.add(Complex(complex_no=f"R{k}", complex_name=f"시험단지{k}", cortar_no=code + "00000"))
    db.commit()


def _run_weekly(window: _FakeWindow):
    from crawler.public_data_api import PublicDataAPI
    PublicDataAPI.reset()

    def _fake(lawd_cd, deal_ymd):
        window.hit()
        return []  # 정상 빈 달

    _FakeDate._today = _real_date(2026, 3, 14)  # 토요일, 10일 아님
    with patch.dict("os.environ", {"PUBLIC_DATA_API_KEY": "test-key"}), \
         patch("datetime.date", _FakeDate), \
         patch("crawler.public_data_api.PublicDataAPI.get_all_apt_trades", side_effect=_fake), \
         patch("services.telegram.send_telegram") as tg:
        from crawler.service_public import collect_public_trade_data
        collect_public_trade_data(batch_size=50, scheduler_job_id="collect_public_trades")
    return tg


def _add_backfill_complexes(db, n: int):
    for k in range(n):
        db.add(Complex(
            complex_no=f"B{k}", complex_name=f"소급단지{k}", cortar_no="1168010300",
            total_household_count=1000 - k,
        ))
    db.commit()


def _run_backfill(window: _FakeWindow, calls_per_complex: int = 3):
    from crawler.public_data_api import PublicDataAPI
    from crawler.service_public import backfill_price_batch
    PublicDataAPI.reset()

    def _fake(cno, months_back=24):
        for _ in range(calls_per_complex):
            window.hit()
        return {"collected": 0}

    with patch("crawler.quota_db.get_api_quota_status",
               return_value={"remaining": 5000, "count": 0, "limit": 9000}), \
         patch("crawler.service_public.backfill_price_history", side_effect=_fake), \
         patch("services.telegram.send_telegram") as tg:
        backfill_price_batch(batch_size=20, scheduler_job_id="backfill_price")
    return tg


def _remaining_log_lines(caplog) -> list[str]:
    return [r.getMessage() for r in caplog.records if "창구 남은 횟수:" in r.getMessage()]


# ── (b) 시작·끝 로그 ─────────────────────────────────────────────────────


def test_b_주간_수집은_시작과_끝_남은_횟수를_로그_한줄로(db, caplog):
    caplog.set_level(logging.INFO, logger=_SVC_LOGGER)
    _add_regions(db, 2)
    window = _FakeWindow(9755)

    _run_weekly(window)

    lines = _remaining_log_lines(caplog)
    assert len(lines) == 1, lines
    assert "시작 9,755/10,000" in lines[0]
    assert f"끝 {window.last_seen:,}/10,000" in lines[0]
    assert window.last_seen == 9755 - (window.calls - 1)
    assert "정부 실거래가 받기" in lines[0]
    assert "KOSPI" in lines[0] and "mibunyang" in lines[0]


def test_b_소급_배치도_시작과_끝_남은_횟수를_로그로(db, caplog):
    caplog.set_level(logging.INFO, logger=_SVC_LOGGER)
    _add_backfill_complexes(db, 3)
    window = _FakeWindow(8000)

    _run_backfill(window, calls_per_complex=3)

    lines = _remaining_log_lines(caplog)
    assert len(lines) == 1, lines
    # 시작값 = 첫 단지(3콜) 뒤에 본 값
    assert "시작 7,998/10,000" in lines[0]
    assert "끝 7,992/10,000" in lines[0]
    assert "옛 시세 채워 넣기" in lines[0]


def test_b_헤더가_없으면_알_수_없음(db, caplog):
    caplog.set_level(logging.INFO, logger=_SVC_LOGGER)
    _add_regions(db, 1)

    _run_weekly(_FakeWindow(None))

    lines = _remaining_log_lines(caplog)
    assert len(lines) == 1
    assert "시작 알 수 없음" in lines[0] and "끝 알 수 없음" in lines[0]


def test_b_사유칸에는_넣지_않는다(db):
    """completed 행의 사유 칸은 관리자 화면에 보인다 — 남은 횟수는 로그에만(B3)."""
    from db.models import CrawlJob
    _add_regions(db, 1)

    _run_weekly(_FakeWindow(9755))

    db.expire_all()
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "public_trade_data").one()
    assert job.status == "completed"
    assert not job.error_message


# ── (c) 부족하면 알림 ────────────────────────────────────────────────────


def _assert_plain_alert(text: str):
    assert text.startswith("[서버 알림] ")
    # 허용 영문 = 프로젝트 이름 둘뿐(같은 열쇠를 쓰는 곳을 사장님이 알아보게)
    english = set(re.findall(r"[A-Za-z]{2,}", text)) - {"KOSPI", "mibunyang"}
    assert not english, f"영문이 섞였다: {english} — {text}"


def test_c_주간_남은_횟수가_예상보다_적으면_텔레그램_1회(db, caplog):
    caplog.set_level(logging.INFO, logger=_SVC_LOGGER)
    _add_regions(db, 3)
    window = _FakeWindow(10)  # 3시군구 × 약 24개월 ≫ 10

    tg = _run_weekly(window)

    assert tg.call_count == 1, "잡당 최대 1회 — 호출마다 다시 보내면 안 된다"
    text = tg.call_args[0][0]
    _assert_plain_alert(text)
    assert "10번뿐" in text and "하루 한도 10,000번" in text
    # 주간 = 실제 반복 대상 (시군구 × 월) — 가짜 창구가 받은 호출 수와 같다(전부 빈 달이라 1콜씩)
    assert f"약 {window.calls:,}번이 필요" in text
    assert "최대 약" not in text
    assert "정부 실거래가 받기" in text
    assert any(r.levelno == logging.WARNING and "남은 횟수 부족" in r.getMessage() for r in caplog.records)


def test_c_주간_남은_횟수가_충분하면_알림_없음(db):
    _add_regions(db, 3)

    tg = _run_weekly(_FakeWindow(9755))

    assert tg.call_count == 0


def test_c_남은_횟수를_모르면_알림_없음(db):
    _add_regions(db, 3)

    tg = _run_weekly(_FakeWindow(None))

    assert tg.call_count == 0


def test_c_소급_남은_횟수가_상한보다_적으면_최대_약_문구로_1회(db):
    _add_backfill_complexes(db, 2)  # 상한 = 2단지 × 24개월 = 48
    window = _FakeWindow(40)

    tg = _run_backfill(window, calls_per_complex=1)

    assert tg.call_count == 1
    text = tg.call_args[0][0]
    _assert_plain_alert(text)
    assert "40번뿐" in text  # 첫 단지 1콜의 응답에서 본 값
    assert "최대 약 48번이 필요" in text
    assert "옛 시세 채워 넣기" in text


def test_c_소급_남은_횟수가_충분하면_알림_없음(db):
    _add_backfill_complexes(db, 2)

    tg = _run_backfill(_FakeWindow(10000), calls_per_complex=1)

    assert tg.call_count == 0
