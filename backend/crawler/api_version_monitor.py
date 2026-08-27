"""data.go.kr API 버전 격변 자동 감시 — 폐기된 엔드포인트를 주 1회 프로브해 조기 경보.

배경 (2026-08-19 실사고)
------------------------
data.go.kr 이 "인증 예외 처리"를 종료하면서 구버전 엔드포인트(AptListService3,
AptBasisInfoServiceV4 등)가 **체감할 공지 없이** 한꺼번에 죽었다. 응답은
``NO_OPENAPI_SERVICE_ERROR``("해당 오픈API 서비스가 없거나 폐기됨",
returnReasonCode "12"). 이 프로젝트와 자매 프로젝트(mibunyang) 둘 다 수집기 장애를
겪었고, 다음 정기 수집이 돌 때까지 아무도 몰랐다.

감지 원리 (라이브 실측 확정)
----------------------------
- **살아있는 서비스**: 필수 파라미터가 없어도 ``NO_MANDATORY_REQUEST_PARAMETERS_ERROR``
  (코드 11) 또는 정상 응답을 준다 → 서비스 실존 증거.
- **폐기된 서비스**: ``NO_OPENAPI_SERVICE_ERROR`` + returnReasonCode ``"12"``
  (HTTP 400) → 죽음 확정.
- 따라서 **유효한 파라미터 없이 serviceKey 만** 넣고 호출해도 생사 판별이 된다.
  numOfRows=1 수준의 최소 호출이라 일일 쿼터(10,000회 mibunyang 공유) 영향 무시 가능.
- ``SERVICE_KEY_IS_NOT_REGISTERED_ERROR``(코드 30)·``SERVICETIMEOUT_ERROR``(코드 05)
  같은 간헐 오류는 **폐기가 아니다** — ``degraded`` 로 분류해 로그만 남기고 알림하지
  않는다(간헐 오류로 새벽에 알림이 울리는 오탐 방지).

네이버 API 는 0건이라 IP 차단 무관(.claude/rules/infra.md §IP 차단 방지 대상 아님).
"""

import logging
import os
import time

import requests

from crawler.env_common import _complete_job, _fail_job, _record_job
from db.database import SessionLocal

logger = logging.getLogger(__name__)

# ⚠ 새 data.go.kr API 를 코드에 도입하면 **여기 1줄 추가가 의무**다.
#   그러지 않으면 그 API 만 감시 사각지대로 남아 2026-08-19 사고가 그대로 재현된다.
#   name = 사람이 텔레그램에서 읽을 이름, url = 실제 코드가 호출하는 엔드포인트.
#   (url 은 각 API 모듈의 상수와 동일해야 한다 — 변경 시 양쪽 답습)
PROBE_REGISTRY: list[dict[str, str]] = [
    # crawler/public_data_api.py BASE_URL
    {
        "name": "국토교통부 아파트 매매 실거래가",
        "url": "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade",
    },
    # crawler/emergency_api.py EMERGENCY_LIST_URL
    {
        "name": "응급의료기관 목록",
        "url": "https://apis.data.go.kr/B552657/ErmctInfoInqireService/getEgytListInfoInqire",
    },
    # crawler/air_quality_api.py NEARBY_STATION_URL
    {
        "name": "에어코리아 근접 측정소",
        "url": "https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getNearbyMsrstnList",
    },
    # crawler/air_quality_api.py REALTIME_AIR_URL
    {
        "name": "에어코리아 실시간 대기질",
        "url": "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty",
    },
    # K-apt 공동주택 연동 4종 — 2026-08-19 격변으로 구버전(3·V4)이 죽어 신버전으로 이동한 것들.
    # 같은 격변이 재발하면(V5 → V6 등) 여기서 가장 먼저 잡힌다.
    {
        "name": "K-apt 시도별 단지 목록 (AptListService4)",
        "url": "https://apis.data.go.kr/1613000/AptListService4/getSidoAptList4",
    },
    {
        "name": "K-apt 단지 기본정보 (AptBasisInfoServiceV5)",
        "url": "https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusBassInfoV5",
    },
    {
        "name": "K-apt 개별사용료 (AptIndvdlzManageCostServiceV2)",
        "url": "https://apis.data.go.kr/1613000/AptIndvdlzManageCostServiceV2/getHsmpHeatCostInfoV2",
    },
    {
        "name": "K-apt 공용관리비 (AptCmnuseManageCostServiceV3)",
        "url": "https://apis.data.go.kr/1613000/AptCmnuseManageCostServiceV3/getHsmpGuardCostInfoV3",
    },
]

REQUEST_TIMEOUT = 15
# 호출 간 간격 — data.go.kr TPS 제한 보호 (public_data_api.MIN_REQUEST_INTERVAL 0.3 보다 여유).
PROBE_INTERVAL_SECONDS = 0.5

# 폐기 확정 신호. returnReasonCode "12" 또는 에러 문자열 어느 쪽으로 와도 잡는다
# (data.go.kr 은 같은 상황을 XML/JSON·본문/헤더로 제각각 표현한다).
DEAD_REASON_CODE = "12"
DEAD_ERROR_TOKEN = "NO_OPENAPI_SERVICE_ERROR"

STATUS_ALIVE = "alive"
STATUS_DEAD = "dead"
STATUS_DEGRADED = "degraded"


def _extract_reason_code(body: str) -> str | None:
    """응답 본문에서 returnReasonCode 값 추출 — XML/JSON 양쪽 포맷 대응.

    XML:  ``<returnReasonCode>12</returnReasonCode>``
    JSON: ``"returnReasonCode": "12"`` (공백·따옴표 유무가 응답마다 다르다)

    정규식 없이 토큰 뒤 첫 숫자 뭉치를 읽는다 — 포맷 변덕에 둔감한 최소 구현.
    """
    idx = body.find("returnReasonCode")
    if idx < 0:
        return None
    tail = body[idx + len("returnReasonCode") : idx + len("returnReasonCode") + 40]
    digits = ""
    for ch in tail:
        if ch.isdigit():
            digits += ch
        elif digits:
            break
    return digits or None


def classify_response(body: str) -> str:
    """응답 본문 → alive / dead / degraded 분류.

    dead 판정은 **폐기 신호가 명시적으로 보일 때만** — 그 외는 전부 alive 또는
    degraded 다. "확신이 없으면 알림하지 않는다"가 이 감시기의 기본 태도(오탐이
    반복되면 진짜 경보까지 무시하게 된다).
    """
    if body is None:
        return STATUS_DEGRADED

    if DEAD_ERROR_TOKEN in body or _extract_reason_code(body) == DEAD_REASON_CODE:
        return STATUS_DEAD

    # 파라미터 부족(코드 11)은 "서비스가 살아서 요청을 검증했다"는 증거다.
    if "NO_MANDATORY_REQUEST_PARAMETERS_ERROR" in body:
        return STATUS_ALIVE

    # 서비스키 미등록(30)·타임아웃(05)·트래픽 초과(22) 등 — 폐기 아님, 로그만.
    for token in (
        "SERVICE_KEY_IS_NOT_REGISTERED_ERROR",
        "SERVICETIMEOUT_ERROR",
        "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR",
        "SERVICE_ACCESS_DENIED_ERROR",
        "UNKNOWN_ERROR",
        "APPLICATION_ERROR",
        "HTTP_ERROR",
    ):
        if token in body:
            return STATUS_DEGRADED

    reason = _extract_reason_code(body)
    if reason is not None:
        # 알 수 없는 에러코드 — 폐기로 단정하지 않는다. 00 계열이면 정상 응답.
        return STATUS_ALIVE if reason.strip("0") == "" else STATUS_DEGRADED

    # ⚠ "죽음 신호가 없다"는 곧 "살아있다"가 아니다. 빈 응답·HTML 502 게이트웨이 페이지
    #   처럼 **생존 근거가 하나도 없는** 본문을 alive 로 세면, 감시기가 오히려 안심을
    #   파는 최악의 경우가 된다(폐기 사고를 못 잡는 건 아니지만, 인프라 장애를 정상으로
    #   보고). 그래서 alive 는 data.go.kr 응답 구조가 실제로 보일 때만 인정한다.
    if "resultCode" in body or "<response" in body or '"response"' in body:
        return STATUS_ALIVE

    return STATUS_DEGRADED


def _probe_one(url: str, service_key: str) -> tuple[str, str]:
    """엔드포인트 1건 프로브 → (status, 진단용 요약 문자열).

    파라미터는 serviceKey + numOfRows=1 뿐 — 유효 파라미터 없이도 생사가 갈린다
    (모듈 docstring §감지 원리). 네트워크 예외는 degraded (폐기 아님).
    """
    try:
        resp = requests.get(
            url,
            params={"serviceKey": service_key, "numOfRows": "1", "pageNo": "1"},
            timeout=REQUEST_TIMEOUT,
        )
    except Exception as e:  # 타임아웃·DNS·연결 끊김 — 서비스 폐기의 증거가 아니다
        return STATUS_DEGRADED, f"요청 예외 {type(e).__name__}"

    body = resp.text or ""
    status = classify_response(body)
    return status, f"HTTP {resp.status_code} / {body[:120].strip()}"


def _build_alert_message(dead: list[dict]) -> str:
    """폐기 감지 텔레그램 본문 — 평문(parse_mode 없음, HTML 이스케이프 불필요)."""
    lines = [
        "🔴 data.go.kr API 폐기 감지",
        "",
        f"아래 {len(dead)}개 엔드포인트가 폐기 응답(NO_OPENAPI_SERVICE_ERROR)을 반환합니다.",
        "버전 개편 가능성 — data.go.kr 공지를 확인하고 신버전 엔드포인트로 교체하세요.",
        "",
    ]
    for item in dead:
        lines.append(f"• {item['name']}")
        lines.append(f"  {item['url']}")
    return "\n".join(lines)


def _alert_api_version(message: str) -> None:
    """운영 텔레그램 알림 — 실패해도 감시를 죽이지 않는다(best-effort, lazy import).

    service_official_price._alert_official_price 패턴 답습. TELEGRAM_ENABLED 토글을
    공유하며, 테스트에서는 conftest 가 그 토글을 false 로 강제해 실발송이 0 이다
    (세션 325 사고 답습).
    """
    try:
        from services.telegram import send_telegram

        send_telegram(message)
    except Exception:
        logger.warning("[api_version] 텔레그램 알림 발송 실패", exc_info=True)


def probe_api_versions(scheduler_job_id: str = "api_version_probe") -> dict:
    """레지스트리 전체를 프로브하고, 폐기(dead)가 있으면 텔레그램 1건으로 묶어 알린다.

    Returns:
        {"alive": [...], "dead": [...], "degraded": [...]} — 각 원소는
        {"name", "url", "detail"} dict. 스케줄러는 반환값을 쓰지 않지만
        수동 실행·테스트에서 결과를 직접 볼 수 있게 돌려준다.

    ⚠ dead 발견은 **잡 실패가 아니다** — 감시기는 제 할 일을 다 한 것이므로
    CrawlJob 은 completed 로 남기고, 알림으로 사람에게 넘긴다.
    """
    service_key = os.getenv("PUBLIC_DATA_API_KEY", "")
    if not service_key:
        logger.warning("[api_version] PUBLIC_DATA_API_KEY 미설정 — 프로브 건너뜀")
        return {"alive": [], "dead": [], "degraded": []}

    result: dict[str, list[dict]] = {STATUS_ALIVE: [], STATUS_DEAD: [], STATUS_DEGRADED: []}

    db = SessionLocal()
    job = None
    try:
        job = _record_job(db, "api_version_probe", scheduler_job_id)

        for i, entry in enumerate(PROBE_REGISTRY):
            if i > 0:
                time.sleep(PROBE_INTERVAL_SECONDS)
            status, detail = _probe_one(entry["url"], service_key)
            result[status].append({"name": entry["name"], "url": entry["url"], "detail": detail})

            if status == STATUS_DEAD:
                logger.error(
                    "[api_version] 폐기 감지 — %s (%s) :: %s", entry["name"], entry["url"], detail
                )
            elif status == STATUS_DEGRADED:
                # 간헐 오류 — 알림 없이 기록만 (오탐 방지, 모듈 docstring §감지 원리)
                logger.warning(
                    "[api_version] 비정상 응답(폐기 아님) — %s :: %s", entry["name"], detail
                )
            else:
                logger.info("[api_version] 정상 — %s", entry["name"])

        dead = result[STATUS_DEAD]
        if dead:
            _alert_api_version(_build_alert_message(dead))

        logger.info(
            "[api_version] 프로브 완료 — 정상 %d / 폐기 %d / 비정상 %d",
            len(result[STATUS_ALIVE]),
            len(dead),
            len(result[STATUS_DEGRADED]),
        )
        _complete_job(db, job, collected=len(result[STATUS_ALIVE]), failed=len(dead))
        return result

    except Exception as e:
        logger.error("[api_version] 프로브 실패: %s", e, exc_info=True)
        if job is not None:
            _fail_job(db, job, str(e))
        raise
    finally:
        db.close()
