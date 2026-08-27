"""data.go.kr API 버전 격변 감시 단위 테스트 (2026-08-19 폐기 사고 재발방지).

검증 축 3개:
  ① 전부 alive → 텔레그램 알림 0
  ② 1건 dead(returnReasonCode 12) → 알림 1건 + 본문에 그 API 이름 포함
  ③ degraded(코드 30 서비스키 미등록 등) → 알림 0, 로그만 (간헐 오류 오탐 방지)

⚠ 실호출·실발송 봉쇄 (세션 325 텔레그램 실알림 사고 + 세션 375 V-WORLD flaky 답습):
  - ``crawler.api_version_monitor.requests.get`` 을 **직접** 목킹한다. 키 부재에 기대지
    않는다 — 로컬 .env 의 PUBLIC_DATA_API_KEY 가 crawler.scheduler 등의 load_dotenv() 로
    세션 전역에 로드되면, 단독 실행은 무해한데 전체 회귀에서만 실호출이 생기는 flaky 가
    된다(세션 375 실측 패턴). 그래서 키도 monkeypatch 로 고정 주입한다.
  - 텔레그램은 ``_alert_api_version`` 이 lazy import 하는 ``services.telegram.send_telegram``
    을 목킹해 호출 횟수를 센다. conftest 가 TELEGRAM_ENABLED=false 로 전역 봉쇄하고 있어
    이중 안전망이다.

실행: python -m pytest tests/test_api_version_monitor.py -q
"""

from unittest.mock import MagicMock, patch

import pytest

from crawler.api_version_monitor import (
    PROBE_REGISTRY,
    STATUS_ALIVE,
    STATUS_DEAD,
    STATUS_DEGRADED,
    classify_response,
    probe_api_versions,
)
from db.models import CrawlJob

# ── 응답 픽스처 (data.go.kr 실제 응답 형태 답습) ────────────────────────────

# 살아있음: 필수 파라미터 부족(코드 11) — 서비스가 요청을 검증했다는 증거
BODY_ALIVE_NO_PARAMS = (
    '{"response":{"header":{"resultCode":"11",'
    '"resultMsg":"NO_MANDATORY_REQUEST_PARAMETERS_ERROR"}}}'
)
# 살아있음: 정상 응답
BODY_ALIVE_OK = (
    '{"response":{"header":{"resultCode":"00","resultMsg":"NORMAL SERVICE."},'
    '"body":{"totalCount":1,"items":{"item":[{"aptNm":"테스트단지"}]}}}}'
)
# 폐기: 2026-08-19 사고 당시 실제 응답 형태 (HTTP 400 + returnReasonCode 12)
BODY_DEAD = (
    '{"cmmMsgHeader":{"errMsg":"SERVICE ERROR",'
    '"returnAuthMsg":"NO_OPENAPI_SERVICE_ERROR","returnReasonCode":"12"}}'
)
# 폐기(XML 변형) — 같은 상황을 XML 로 주는 엔드포인트 대응
BODY_DEAD_XML = (
    "<OpenAPI_ServiceResponse><cmmMsgHeader>"
    "<returnAuthMsg>NO_OPENAPI_SERVICE_ERROR</returnAuthMsg>"
    "<returnReasonCode>12</returnReasonCode>"
    "</cmmMsgHeader></OpenAPI_ServiceResponse>"
)
# 비정상이나 폐기 아님: 서비스키 미등록(코드 30) — 간헐 발생, 알림 금지
BODY_DEGRADED_KEY = (
    '{"cmmMsgHeader":{"returnAuthMsg":"SERVICE_KEY_IS_NOT_REGISTERED_ERROR",'
    '"returnReasonCode":"30"}}'
)
# 비정상이나 폐기 아님: 타임아웃(코드 05)
BODY_DEGRADED_TIMEOUT = (
    '{"cmmMsgHeader":{"returnAuthMsg":"SERVICETIMEOUT_ERROR","returnReasonCode":"05"}}'
)


def _resp(body: str, status_code: int = 200) -> MagicMock:
    m = MagicMock()
    m.status_code = status_code
    m.text = body
    return m


@pytest.fixture(autouse=True)
def _no_sleep_no_realkey(monkeypatch):
    """프로브 간 sleep 제거(테스트 속도) + API 키 고정 주입(실키 의존 제거)."""
    monkeypatch.setattr("crawler.api_version_monitor.time.sleep", lambda *_: None)
    monkeypatch.setenv("PUBLIC_DATA_API_KEY", "test-service-key")


# ── classify_response 단위 (분류 규칙 자체) ─────────────────────────────────


@pytest.mark.parametrize(
    "body,expected",
    [
        (BODY_ALIVE_NO_PARAMS, STATUS_ALIVE),
        (BODY_ALIVE_OK, STATUS_ALIVE),
        (BODY_DEAD, STATUS_DEAD),
        (BODY_DEAD_XML, STATUS_DEAD),
        (BODY_DEGRADED_KEY, STATUS_DEGRADED),
        (BODY_DEGRADED_TIMEOUT, STATUS_DEGRADED),
        # ⚠ "죽음 신호가 없다" ≠ "살아있다" — 생존 근거 0 인 본문은 alive 가 아니다.
        ("", STATUS_DEGRADED),
        ("<html><body>502 Bad Gateway</body></html>", STATUS_DEGRADED),
        # 트래픽 초과(22)도 폐기 아님
        ('{"cmmMsgHeader":{"returnReasonCode":"22"}}', STATUS_DEGRADED),
        # 정상 코드 변형 — RTMS 는 "000", K-apt 는 "00" 을 준다(라이브 실측)
        ("<response><header><resultCode>000</resultCode></header></response>", STATUS_ALIVE),
        ('{"response":{"header":{"resultCode":"00"}}}', STATUS_ALIVE),
    ],
)
def test_classify_response(body, expected):
    """응답 본문 → alive/dead/degraded 분류가 실제 data.go.kr 응답 형태에 맞는가."""
    assert classify_response(body) == expected


def test_empty_or_gateway_body_is_not_alive():
    """생존 근거가 없는 본문을 alive 로 세면 감시기가 '안심을 파는' 최악이 된다.

    빈 응답·HTML 502 는 폐기의 증거도 아니지만 생존의 증거도 아니다 → degraded.
    (알림은 안 나가되 로그로 남아 사람이 볼 수 있다)
    """
    for body in ("", "   ", "<html><body>502 Bad Gateway</body></html>"):
        assert classify_response(body) == STATUS_DEGRADED, f"alive 로 오분류: {body!r}"


# ── ① 전부 alive → 알림 0 ──────────────────────────────────────────────────


def test_all_alive_sends_no_alert(db):
    """레지스트리 전부 살아있으면 텔레그램 알림이 나가지 않는다."""
    with (
        patch(
            "crawler.api_version_monitor.requests.get",
            return_value=_resp(BODY_ALIVE_NO_PARAMS),
        ) as mock_get,
        patch("services.telegram.send_telegram") as mock_send,
    ):
        result = probe_api_versions()

    assert len(result[STATUS_ALIVE]) == len(PROBE_REGISTRY)
    assert result[STATUS_DEAD] == []
    assert mock_get.call_count == len(PROBE_REGISTRY)
    mock_send.assert_not_called()

    # 감시 잡은 정상 완료로 기록된다
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "api_version_probe").one()
    assert job.status == "completed"


# ── ② 1건 dead → 알림 1건 + 본문에 API 이름 ────────────────────────────────


def test_one_dead_sends_single_alert_with_api_name(db):
    """폐기 1건이면 알림 **1건으로 묶어** 발송하고, 본문에 죽은 API 이름·URL 이 담긴다."""
    dead_entry = PROBE_REGISTRY[0]

    def _fake_get(url, **kwargs):
        if url == dead_entry["url"]:
            return _resp(BODY_DEAD, status_code=400)
        return _resp(BODY_ALIVE_NO_PARAMS)

    with (
        patch("crawler.api_version_monitor.requests.get", side_effect=_fake_get),
        patch("services.telegram.send_telegram") as mock_send,
    ):
        result = probe_api_versions()

    assert len(result[STATUS_DEAD]) == 1
    assert result[STATUS_DEAD][0]["name"] == dead_entry["name"]
    assert len(result[STATUS_ALIVE]) == len(PROBE_REGISTRY) - 1

    # 알림은 여러 건이 아니라 묶어서 1건
    assert mock_send.call_count == 1
    message = mock_send.call_args.args[0]
    assert dead_entry["name"] in message
    assert dead_entry["url"] in message
    # 사람이 다음에 할 행동(공지 확인)이 안내되는가
    assert "data.go.kr" in message

    # dead 발견은 잡 실패가 아니다 — 감시기는 제 할 일을 다 했다
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "api_version_probe").one()
    assert job.status == "completed"


def test_multiple_dead_are_batched_into_one_alert():
    """폐기 여러 건이어도 알림은 1건(2026-08-19 처럼 전량 폐기 시 알림 폭탄 방지)."""
    with (
        patch(
            "crawler.api_version_monitor.requests.get",
            return_value=_resp(BODY_DEAD, status_code=400),
        ),
        patch("services.telegram.send_telegram") as mock_send,
    ):
        result = probe_api_versions()

    assert len(result[STATUS_DEAD]) == len(PROBE_REGISTRY)
    assert mock_send.call_count == 1
    message = mock_send.call_args.args[0]
    for entry in PROBE_REGISTRY:
        assert entry["name"] in message


# ── ③ degraded → 알림 0 (간헐 오류 오탐 방지) ──────────────────────────────


def test_degraded_sends_no_alert_and_logs_only(db, caplog):
    """서비스키 미등록(코드 30)은 폐기가 아니다 — 알림 0, 경고 로그만."""
    with (
        patch(
            "crawler.api_version_monitor.requests.get",
            return_value=_resp(BODY_DEGRADED_KEY, status_code=401),
        ),
        patch("services.telegram.send_telegram") as mock_send,
        caplog.at_level("WARNING", logger="crawler.api_version_monitor"),
    ):
        result = probe_api_versions()

    assert len(result[STATUS_DEGRADED]) == len(PROBE_REGISTRY)
    assert result[STATUS_DEAD] == []
    mock_send.assert_not_called()
    assert "폐기 아님" in caplog.text

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "api_version_probe").one()
    assert job.status == "completed"


def test_network_exception_is_degraded_not_dead():
    """타임아웃·연결 끊김은 폐기의 증거가 아니다 — degraded 로만 분류, 알림 0."""
    with (
        patch(
            "crawler.api_version_monitor.requests.get",
            side_effect=TimeoutError("connect timeout"),
        ),
        patch("services.telegram.send_telegram") as mock_send,
    ):
        result = probe_api_versions()

    assert len(result[STATUS_DEGRADED]) == len(PROBE_REGISTRY)
    assert result[STATUS_DEAD] == []
    mock_send.assert_not_called()


# ── 부수 가드 ──────────────────────────────────────────────────────────────


def test_no_api_key_skips_probe_entirely(monkeypatch):
    """PUBLIC_DATA_API_KEY 미설정이면 아무것도 호출하지 않고 조용히 건너뛴다."""
    monkeypatch.setenv("PUBLIC_DATA_API_KEY", "")

    with (
        patch("crawler.api_version_monitor.requests.get") as mock_get,
        patch("services.telegram.send_telegram") as mock_send,
    ):
        result = probe_api_versions()

    mock_get.assert_not_called()
    mock_send.assert_not_called()
    assert result == {STATUS_ALIVE: [], STATUS_DEAD: [], STATUS_DEGRADED: []}


def test_telegram_failure_does_not_break_probe(db):
    """텔레그램 발송이 터져도 감시 자체는 완료된다 (best-effort, 기존 관례)."""
    with (
        patch(
            "crawler.api_version_monitor.requests.get",
            return_value=_resp(BODY_DEAD, status_code=400),
        ),
        patch("services.telegram.send_telegram", side_effect=RuntimeError("bot down")),
    ):
        result = probe_api_versions()

    assert len(result[STATUS_DEAD]) == len(PROBE_REGISTRY)
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "api_version_probe").one()
    assert job.status == "completed"


def test_registry_covers_known_datagokr_endpoints():
    """레지스트리가 실사용 엔드포인트를 빠짐없이 담고 있는가 (새 API 추가 시 갱신 의무).

    2026-08-19 사고의 본질 = "코드가 쓰는데 아무도 안 보고 있던 엔드포인트". 레지스트리에서
    빠지면 그 사각지대가 그대로 재현되므로, 알려진 8개를 명시적으로 단언해 못 박는다.
    """
    urls = {entry["url"] for entry in PROBE_REGISTRY}
    expected = {
        "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade",
        "https://apis.data.go.kr/B552657/ErmctInfoInqireService/getEgytListInfoInqire",
        "https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getNearbyMsrstnList",
        "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty",
        "https://apis.data.go.kr/1613000/AptListService4/getSidoAptList4",
        "https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusBassInfoV5",
        "https://apis.data.go.kr/1613000/AptIndvdlzManageCostServiceV2/getHsmpHeatCostInfoV2",
        "https://apis.data.go.kr/1613000/AptCmnuseManageCostServiceV3/getHsmpGuardCostInfoV3",
    }
    assert expected <= urls, f"레지스트리 누락: {sorted(expected - urls)}"

    # 이름·URL 이 비어 있으면 알림 본문이 무의미해진다
    for entry in PROBE_REGISTRY:
        assert entry["name"].strip()
        assert entry["url"].startswith("https://")


def test_registry_urls_match_actual_collector_modules():
    """레지스트리 URL 이 실제 수집기 모듈 상수와 일치하는가 (drift 가드).

    수집기가 엔드포인트를 바꿨는데 레지스트리를 안 고치면, 감시는 옛 URL 만 찔러
    "정상"이라 보고하고 실제 수집기는 죽는다 — 감시가 오히려 안심을 파는 최악의 경우.
    """
    from crawler.air_quality_api import NEARBY_STATION_URL, REALTIME_AIR_URL
    from crawler.emergency_api import EMERGENCY_LIST_URL
    from crawler.public_data_api import BASE_URL

    urls = {entry["url"] for entry in PROBE_REGISTRY}
    for actual in (BASE_URL, EMERGENCY_LIST_URL, NEARBY_STATION_URL, REALTIME_AIR_URL):
        assert actual in urls, (
            f"수집기 모듈이 쓰는 {actual} 이 PROBE_REGISTRY 에 없다 — "
            "crawler/api_version_monitor.py PROBE_REGISTRY 에 추가할 것"
        )
