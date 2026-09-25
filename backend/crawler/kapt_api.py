"""K-apt(공동주택관리정보시스템) 단지·관리비 API 클라이언트.

data.go.kr 1613000 계열 3개 서비스를 한 모듈에서 다룬다 (전부 기존
`PUBLIC_DATA_API_KEY` 로 승인됨 — 2026-08-27 운영계정 전환·활용신청 완료, 라이브 실측):

- `AptListService4`            단지 목록 (kaptCode ↔ 법정동·단지명)
- `AptBasisInfoServiceV5`      단지 기본정보 (세대수·복도유형·사용승인일)
- `AptCmnuseManageCostServiceV3`  공용관리비 17개 오퍼레이션
- `AptIndvdlzManageCostServiceV3` 개별사용료 5개 오퍼레이션

`BasePublicDataAPI`(air_quality_api.py·applyhome_officetel_api.py 와 동일 기반)를
상속해 공유 일일 쿼터 추적·throttle(0.3초)·429 재시도를 그대로 재사용한다 —
재시도·세션 관리를 새로 만들지 않는다 (`oss-first.md` 답습).

⚠ 쿼터: 관리비 두 서비스도 **운영계정(10만/일) 전환 완료** — 목록·기본정보와 같다.
배치 500(기본값)으로 하루 kapt 32,035콜이 실패 0·쿼터 에러 0 으로 완주함을 확인했다
(2026-08-31 첫 정기 실행 실측). 한 단지당 공용 17콜 + 개별 5콜.

  (과거) 개발계정 시절엔 한도가 **서비스당 5,000/일 (오퍼레이션 합산)** 이라
  — 오퍼레이션마다 따로 1,000 이 아니다(공개 페이지 실측 2026-08-29) — 배치 500 이면
  공용만 8,500콜로 넘겨서 `KAPT_COST_BATCH_SIZE=250` 으로 낮춰 돌렸었다. 운영계정
  전환으로 그 오버라이드는 제거됐고 지금은 기본 500 이다.

⚠ 3상태 구분 (이 모듈의 핵심 계약): 관리비 호출 결과는 반드시
  (a) 성공 + 데이터 있음   → item dict
  (b) 성공 + 데이터 없음   → None ("정상 미공개" — 이 달·이 항목은 원래 없다.
                             실제 응답은 빈 body 가 아니라 **값이 전부 null 인 item**
                             이다 — `_is_blank_item` 참조)
  (c) 호출 실패           → `KaptApiError` 예외 (쿼터 초과·키 오류·점검·파싱 실패)
셋으로 갈린다. (b)와 (c)를 둘 다 None 으로 뭉개면, 공용이 통째로 실패하고
개별만 성공한 회차에서 "공용관리비 0원" 인 반쪽 총액이 사실처럼 저장되고
그 달 행이 생겨 다음 달까지 재수집도 안 된다 — 그래서 (c)는 예외로 올린다.
"""

import logging
import time

from crawler.public_data_base import BasePublicDataAPI

logger = logging.getLogger(__name__)

_LIST_URL = "https://apis.data.go.kr/1613000/AptListService4"
_BASIS_URL = "https://apis.data.go.kr/1613000/AptBasisInfoServiceV5"
_CMNUSE_URL = "https://apis.data.go.kr/1613000/AptCmnuseManageCostServiceV3"
_INDVDLZ_URL = "https://apis.data.go.kr/1613000/AptIndvdlzManageCostServiceV3"

# 공용관리비 V3 오퍼레이션 17종. 각 op 의 금액 칸 이름·개수는 `_COST_AMOUNT_FIELDS` 에
# 명시돼 있고 `_extract_amount` 가 그 칸들을 **전부 더한다**(세션 417 정정).
COMMON_COST_OPS: tuple[str, ...] = (
    "getHsmpLaborCostInfoV3",
    "getHsmpTaxdueInfoV3",
    "getHsmpVhcleMntncCostInfoV3",
    "getHsmpEtcCostInfoV3",
    "getHsmpOfcrkCostInfoV3",
    "getHsmpClothingCostInfoV3",
    "getHsmpEduTraingCostInfoV3",
    "getHsmpCleaningCostInfoV3",
    "getHsmpGuardCostInfoV3",
    "getHsmpDisinfectionCostInfoV3",
    "getHsmpElevatorMntncCostInfoV3",
    "getHsmpHomeNetworkMntncCostInfoV3",
    "getHsmpRepairsCostInfoV3",
    "getHsmpFacilityMntncCostInfoV3",
    "getHsmpSafetyCheckUpCostInfoV3",
    "getHsmpDisasterPreventionCostInfoV3",
    "getHsmpConsignManageFeeInfoV3",
)

# 개별사용료 V3 오퍼레이션 5종. 응답이 "공용(C) + 전용(P)" 두 필드로 쪼개져 오므로
# (예: {"heatC": "0", "heatP": "0"}) 둘을 더해 항목 금액으로 쓴다.
INDIVIDUAL_COST_OPS: tuple[str, ...] = (
    "getHsmpHeatCostInfoV3",
    "getHsmpHotWaterCostInfoV3",
    "getHsmpGasRentalFeeInfoV3",
    "getHsmpElectricityCostInfoV3",
    "getHsmpWaterCostInfoV3",
)

# 공용관리비 op → 그 op 의 **금액 칸 전부**. `_extract_amount` 가 이 칸들을 더한다.
#
# ⚠ 세션 417 이전엔 "식별 칸을 뺀 첫 숫자 칸 하나"만 저장했다. 1칸 op 는 그래도 맞았지만
# 다칸 op 5종은 첫 칸만 남아 월 관리비가 과소 집계됐다 — 인건비는 급여(pay) 하나만,
# 제세공과금은 전기료(electCost, 대개 0) 하나만 저장돼 통신료·우편료가 통째로 빠졌다.
# 실측 원문(A50630215 · 202606, 2026-09-24): 인건비 9칸 합 10,262,010 인데 7,190,420 저장.
#
# 칸 이름은 그 원문 17건에서 그대로 옮겼다. 전 칸이 원 단위 금액이다(건수·비율·코드 칸 0):
#   인건비       급여·제수당·상여금·퇴직금·산재보험·고용보험·국민연금·건강보험·식대 등 복리후생
#   제세공과금   전기료·통신료·우편료·세금 등
#   차량유지비   연료비·수리비·보험료·기타 차량유지비
#   그밖의부대비용 관리용품 구입비·회계감사비(전문가 자문)·잡비
#   사무비       일반사무용품비·도서인쇄비·교통통신비
# 사전에 없는 op 는 저장하지 않고 경고한다(조용히 추측하지 않는다) — op 를 새로 붙이면
# 원문을 한 번 받아 이 표부터 채울 것. 가드 = tests/test_kapt.py 의 전 op 등록 확인.
_COST_AMOUNT_FIELDS: dict[str, tuple[str, ...]] = {
    "getHsmpLaborCostInfoV3": (
        "pay", "sundryCost", "bonus", "pension", "accidentPremium",
        "employPremium", "nationalPension", "healthPremium", "welfareBenefit",
    ),
    "getHsmpTaxdueInfoV3": ("electCost", "telCost", "postageCost", "taxrestCost"),
    "getHsmpVhcleMntncCostInfoV3": ("fuelCost", "refairCost", "carInsurance", "carEtc"),
    "getHsmpEtcCostInfoV3": ("careItemCost", "accountingCost", "hiddenCost"),
    "getHsmpOfcrkCostInfoV3": ("officeSupply", "bookSupply", "transportCost"),
    "getHsmpClothingCostInfoV3": ("clothesCost",),
    "getHsmpEduTraingCostInfoV3": ("eduCost",),
    "getHsmpCleaningCostInfoV3": ("cleanCost",),
    "getHsmpGuardCostInfoV3": ("guardCost",),
    "getHsmpDisinfectionCostInfoV3": ("disinfCost",),
    "getHsmpElevatorMntncCostInfoV3": ("elevCost",),
    "getHsmpHomeNetworkMntncCostInfoV3": ("hnetwCost",),
    "getHsmpRepairsCostInfoV3": ("lrefCost1",),
    "getHsmpFacilityMntncCostInfoV3": ("lrefCost2",),
    "getHsmpSafetyCheckUpCostInfoV3": ("lrefCost3",),
    "getHsmpDisasterPreventionCostInfoV3": ("lrefCost4",),
    "getHsmpConsignManageFeeInfoV3": ("manageCost",),
}

# 응답 dict 에서 금액이 아닌 필드 — 금액 추출 시 건너뛴다.
#
# ⚠ 개별사용료 `_extract_paired_amount` 는 칸 이름을 안 믿고 "이 목록을 뺀 숫자 전부"를
# 더하므로, 여기에 빠진 숫자형 메타는 그대로 요금에 얹힌다(예: searchDate "202605").
# 공용 `_extract_amount` 는 `_COST_AMOUNT_FIELDS` 의 칸만 읽으므로 메타가 섞일 수 없고,
# 이 목록은 거기선 "모르는 칸 경고"에서 빼는 용도로만 쓴다.
# kaptCode/kaptName 은 문자열이라 애초에 위험이 낮았고, 진짜 위험한 건
# **숫자로 변환되는 메타**다:
#   - searchDate  요청 조회월(YYYYMM)을 응답이 그대로 되돌려주는 관행
#   - kaptdaCnt   세대수 (basis 응답 계열과 필드명을 공유)
#   - resultCode / totalCount / pageNo / numOfRows  래퍼가 body 로 새어들 때
# 금액 필드는 전부 "…Cost"·"…Fee"·"…C"/"…P" 계열이라 이 목록과 겹치지 않는다.
_NON_AMOUNT_KEYS = frozenset({
    "kaptCode",
    "kaptName",
    "searchDate",
    "kaptdaCnt",
    "resultCode",
    "resultMsg",
    "totalCount",
    "pageNo",
    "numOfRows",
})


# data.go.kr 이 "한도 초과"를 알리는 신호. 에러 응답은 정상 응답과 구조가 완전히
# 달라서(`{"response":{"header":{"resultCode":...}}}` 가 아니라 `cmmMsgHeader`)
# XML/JSON 양쪽으로 오며, JSON 을 요청해도 XML 로 오는 엔드포인트가 있다.
# 코드와 문자열 어느 쪽으로 와도 잡는다 — api_version_monitor 의 실측 픽스처
# (tests/test_api_version_monitor.py BODY_DEGRADED_* 2026-08-19 사고 당시 원문) 답습.
QUOTA_REASON_CODE = "22"
QUOTA_ERROR_TOKEN = "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR"

# 오류 봉투 중 **기다리면 풀릴 수 있는** 사유 코드 — 같은 호출을 다시 해 본다.
# 분류는 세션 417 메인 결정(04 = 09-25 실측 간헐 오류). 01·02·05·99 의 공식 뜻은
# `_error_envelope` 표대로 출처 미확인이라, "설정 오류가 아니라 서버 쪽 사정" 으로 묶은 운용 판단이다.
# 쿼터(22)·설정 오류(10·11·12·20·21·30·31·32·33)는 기다려도 안 바뀌므로 재시도하지 않는다.
_TRANSIENT_REASON_CODES = frozenset({"01", "02", "04", "05", "99"})
# 재시도 전 대기(초) — 길이 = 재시도 횟수. 호출 1건 최악 대기 = 합 43초. 테스트가 patch 한다.
_TRANSIENT_RETRY_DELAYS: tuple[int, ...] = (3, 10, 30)

# 일시 오류 **재시도로 더 나간** 호출 수(프로세스 누적). `_cost_call_count`(논리 호출 수)와
# 따로 센다 — 회차 요약 로그가 "재시도 N콜" 을 따로 찍는다. 차이값으로만 쓴다.
_retry_call_count = 0


def retry_calls_made() -> int:
    """지금까지 일시 오류 재시도로 더 나간 호출 수(프로세스 누적)."""
    return _retry_call_count


class KaptApiError(RuntimeError):
    """K-apt API **호출 실패** — "데이터 없음"과 구분되는 (c) 상태.

    쿼터 초과·키 오류·서비스 점검·HTTP 실패·파싱 실패가 전부 여기로 온다.
    호출자는 이 예외를 받으면 그 단지를 **저장하지 않고** 실패로 계수해야 한다
    (부분 breakdown 저장 금지 — 모듈 docstring §3상태 구분).

    Attributes:
        code: data.go.kr 사유 코드 문자열 (알 수 없으면 None).
        op:   실패한 오퍼레이션 이름 (진단용).
        is_quota: 일일 한도 초과(22) 여부 — True 면 호출자가 배치를 즉시 중단한다.
    """

    def __init__(self, message: str, code: str | None = None,
                 op: str | None = None, is_quota: bool = False):
        super().__init__(message)
        self.code = code
        self.op = op
        self.is_quota = is_quota


def _looks_like_quota_exceeded(payload) -> bool:
    """응답(dict 또는 문자열)이 '일일 한도 초과' 신호를 담고 있나.

    문자열화해서 토큰·코드를 찾는다 — 포맷(XML/JSON)·중첩 위치가 응답마다 달라
    구조 파싱은 오히려 놓치기 쉽다(api_version_monitor `_extract_reason_code` 와 같은 결).
    """
    if payload is None:
        return False
    text = payload if isinstance(payload, str) else str(payload)
    if QUOTA_ERROR_TOKEN in text:
        return True
    # returnReasonCode / resultCode 어느 쪽에 22 가 실려도 잡는다.
    for token in ("returnReasonCode", "resultCode"):
        idx = text.find(token)
        while idx >= 0:
            tail = text[idx + len(token): idx + len(token) + 40]
            digits = ""
            for ch in tail:
                if ch.isdigit():
                    digits += ch
                elif digits:
                    break
            if digits and digits.lstrip("0") == QUOTA_REASON_CODE:
                return True
            idx = text.find(token, idx + 1)
    return False


def _error_envelope(data) -> tuple[str | None, str | None] | None:
    """data.go.kr 표준 **오류 봉투**면 (사유 코드, 사유 문구), 아니면 None.

    정상 응답은 `{"response": {"header": ..., "body": ...}}` 인데, 오류는 게이트웨이가
    가로채 전혀 다른 모양으로 준다. 2026-09-25 실측 원문(K-apt 공용관리비 첫 op):
      {"OpenAPI_ServiceResponse": {"cmmMsgHeader": {"errMsg": "HTTP_ERROR",
        "returnAuthMsg": "HTTP 에러", "returnReasonCode": "04"}}}
    `OpenAPI_ServiceResponse` 로 감싸지 않고 최상위에 `cmmMsgHeader` 만 오는 변형도
    받는다(tests 의 쿼터 픽스처 모양). 사유 문구는 `returnAuthMsg` 우선, 없으면 `errMsg`.

    ⚠ 09-25 이전엔 이 봉투를 `data["response"]` KeyError 로 뭉개 "예상과 다른 응답 구조"
    로만 남겼다 — 로그·잡 기록·텔레그램 어디에도 사유 코드(04)가 없어 원인을 1콜 재현으로
    되짚어야 했다.

    사유 코드 뜻 (data.go.kr 공통 코드 — **공식 표 출처 미확인**, 2026-09-25 WebSearch 2회·
    WebFetch 1회로 data.go.kr 안에서 공식 표를 찾지 못했다. 아래 "실측" 표기는 이 레포가
    실제 응답 원문으로 본 것이고, 나머지 번호는 뜻을 적지 않는다 — 추측 금지):
      | 코드 | 응답 문구(실측)                                   | 비고 |
      |------|---------------------------------------------------|------|
      | 00   | NORMAL SERVICE (정상 응답 header)                 | 실측 |
      | 01   | —                                                 | 출처 미확인 |
      | 02   | —                                                 | 출처 미확인 |
      | 03   | —                                                 | 출처 미확인 |
      | 04   | HTTP_ERROR / "HTTP 에러" — 제공기관 서버 쪽 오류  | 실측 2026-09-25 (자료 있는 조합도 받음 → "미공개" 아님) |
      | 05   | SERVICETIMEOUT_ERROR                              | 실측 (api_version_monitor) |
      | 10   | —                                                 | 출처 미확인 |
      | 11   | NO_MANDATORY_REQUEST_PARAMETERS_ERROR             | 실측 (api_version_monitor) |
      | 12   | NO_OPENAPI_SERVICE_ERROR — 서비스 없음·폐기       | 실측 2026-08-19 (api_version_monitor) |
      | 20   | —                                                 | 출처 미확인 |
      | 21   | —                                                 | 출처 미확인 |
      | 22   | LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR — 일일 한도 초과 | 실측 (쿼터 픽스처) |
      | 30   | SERVICE_KEY_IS_NOT_REGISTERED_ERROR               | 실측 (api_version_monitor) |
      | 31   | —                                                 | 출처 미확인 |
      | 32   | —                                                 | 출처 미확인 |
      | 33   | —                                                 | 출처 미확인 |
      | 99   | —                                                 | 출처 미확인 |
    """
    if not isinstance(data, dict):
        return None
    header = None
    wrapper = data.get("OpenAPI_ServiceResponse")
    if isinstance(wrapper, dict):
        header = wrapper.get("cmmMsgHeader")
    if header is None:
        header = data.get("cmmMsgHeader")
    if not isinstance(header, dict):
        return None
    code = header.get("returnReasonCode")
    reason = header.get("returnAuthMsg") or header.get("errMsg")
    return (
        str(code).strip() if code is not None else None,
        str(reason).strip() if reason is not None else None,
    )


class KaptAPI(BasePublicDataAPI):
    """K-apt 단지·관리비 API — BasePublicDataAPI 상속 (쿼터·throttle·재시도 공유)."""

    _api_name = "kapt"
    # 독립 쿼터 버킷 — data.go.kr 한도는 **활용신청(API)별**이라 전역 9,000 합산이 kapt 에겐
    # 틀린 모델이다. 전역 버킷에 묶으면 관리비 수집(500단지 x 22콜 = 11,000/일)이 9,000 에서
    # 잘리고, 매월 21일 매칭(목록 2.2만 + 확정분 basis)도 부분 실행되며 다른 수집기 쿼터까지
    # 잠식한다. 운영계정 실측 한도는 목록·기본정보 각 10만/일 (2026-08-27 활용신청 완료).
    # 60,000 은 그 10만에 대한 안전 상한일 뿐이고, 실제 일 사용량(1.1만~1.5만)은 배치 크기
    # (KAPT_COST_BATCH_SIZE)와 throttle 페이싱이 제어한다 — 이 값은 폭주 시 최후 차단선.
    _quota_name = "kapt"
    _quota_daily_limit = 60_000

    @classmethod
    def _body_or_raise(cls, url: str, params: dict, op: str | None = None) -> dict | None:
        """공통 호출 → response.body. **호출 실패는 `KaptApiError` 로 올린다.**

        반환값이 None 인 경우는 오직 (b) "성공했는데 body 가 비어있음" 하나뿐이다.
        나머지는 전부 예외 — 호출자가 (b)와 (c)를 구분할 수 있어야 반쪽 저장을 막는다.

        `call_api` 가 None 을 주는 경우는 전부 (c)다:
          · 키 미설정 · 버킷 일일 한도 도달(우리 쪽 카운터) · HTTP 실패 재시도 소진
          · 에러 응답이 XML(`cmmMsgHeader`)이라 `resp.json()` 이 터진 경우
        마지막 항목이 중요하다 — data.go.kr 은 `_type=json` 을 줘도 에러는 XML 로
        주는 엔드포인트가 있어, **쿼터 초과가 "그냥 None"으로 도착**한다. 그래서
        None 을 "데이터 없음"으로 해석하면 절대 안 된다.

        오류 봉투(`_error_envelope`)는 사유 코드째 `KaptApiError(code=…)` 로 올린다.
        그중 **일시성 코드**(`_TRANSIENT_REASON_CODES`)는 `_TRANSIENT_RETRY_DELAYS` 만큼
        쉬고 같은 호출을 다시 해 본다 — 2026-09-25 08:18 재실측에서 04 는 특정 단지에
        고정된 게 아니라 **호출마다 오락가락**했다(같은 단지·달이 08:05 엔 04, 08:18 엔
        정상). 한 단지 22콜 중 하나만 04 를 맞아도 그 단지 전체가 실패가 되므로, 재시도
        없이는 회차가 거의 못 모은다. 쿼터(22)·설정 오류는 기다려도 안 바뀌어 즉시 올린다.
        재시도도 `call_api` 를 거치므로 쿼터 카운터에 그대로 잡힌다(`retry_calls_made`).
        """
        global _retry_call_count
        attempt = 0
        while True:
            data = cls.call_api(url, params)
            if data is None:
                # call_api 는 실패 사유를 안 돌려준다(공유 기반 클래스라 시그니처 불변).
                # 코드 미상의 실패로 올리고, 쿼터 여부는 아래 정상-구조 경로에서 판정한다.
                raise KaptApiError(
                    f"호출 실패 — 응답 없음 (op={op or url})", code=None, op=op
                )

            # 에러 응답은 `{"response": ...}` 구조가 아니라 `cmmMsgHeader` 로 온다.
            if _looks_like_quota_exceeded(data):
                raise KaptApiError(
                    f"일일 한도 초과(22) — op={op or url}",
                    code=QUOTA_REASON_CODE, op=op, is_quota=True,
                )

            # 쿼터가 아닌 오류 봉투 — 사유 코드째 올린다(쿼터 22 는 바로 위에서 먼저 잡혀
            # 여기 닿지 않는다. 순서를 바꾸면 22 가 is_quota 없이 올라가 배치가 안 멈춘다).
            envelope = _error_envelope(data)
            if envelope is None:
                break
            reason_code, reason_msg = envelope
            if reason_code in _TRANSIENT_REASON_CODES and attempt < len(_TRANSIENT_RETRY_DELAYS):
                delay = _TRANSIENT_RETRY_DELAYS[attempt]
                attempt += 1
                logger.info(
                    "[kapt] data.go.kr 일시 오류 코드 %s — %s초 뒤 재시도 %d/%d (op=%s)",
                    reason_code, delay, attempt, len(_TRANSIENT_RETRY_DELAYS), op or url,
                )
                time.sleep(delay)
                _retry_call_count += 1
                continue
            message = (
                f"data.go.kr 오류 코드 {reason_code or '미상'}({reason_msg or '사유 문구 없음'})"
                + (f" 재시도 {attempt}회 후" if attempt else "")
                + f" — op={op or url}"
            )
            logger.warning("[kapt] %s", message)
            raise KaptApiError(message, code=reason_code, op=op)

        try:
            response = data["response"]
            header = response.get("header", {})
            code = header.get("resultCode")
            if code not in ("00", "0"):
                logger.warning(
                    "[kapt] 비정상 resultCode=%s msg=%s", code, header.get("resultMsg")
                )
                # ⚠ is_quota 는 여기서 다시 보지 않는다 — 한도 초과(22)는 어느 포맷으로
                # 오든 위 `_looks_like_quota_exceeded` 가 먼저 잡아 이 줄에 닿지 않는다
                # (dict 를 통째로 문자열화해 보므로 resultCode 자리의 22 도 포함).
                # 여기서 한 번 더 판정하면 영원히 실행되지 않는 분기가 생겨,
                # 테스트로 검증할 수 없는 죽은 코드가 된다.
                raise KaptApiError(
                    f"비정상 resultCode={code} — op={op or url}",
                    code=str(code) if code is not None else None, op=op,
                )
            body = response.get("body")
        except (KeyError, TypeError, AttributeError) as exc:
            # 오류 봉투도 정상 구조도 아닌 **진짜 미지 모양**만 여기 온다. 다음에 원인을
            # 1콜 재현 없이 보이게 최상위 키와 앞 200자를 남긴다. `data` 는 call_api 가
            # 돌려준 **응답 본문**(resp.json())뿐이라 serviceKey 는 실리지 않는다 — 키는
            # 요청 params 에만 있다(public_data_base.call_api).
            logger.warning(
                "[kapt] 예상과 다른 응답 구조 — op=%s 최상위 키=%s 앞부분=%s",
                op or url,
                list(data) if isinstance(data, dict) else type(data).__name__,
                str(data)[:200],
            )
            raise KaptApiError(
                f"예상과 다른 응답 구조 — op={op or url}", code=None, op=op
            ) from exc
        return body if isinstance(body, dict) else None

    @classmethod
    def _body(cls, url: str, params: dict) -> dict | None:
        """`_body_or_raise` 의 비-예외 래퍼 — 실패도 None.

        단지 목록·기본정보 호출 전용이다. 이 둘은 실패해도 "그 단지를 이번 회차에
        못 붙인다" 로 끝나고(다음 달 매칭이 다시 시도), 관리비처럼 **틀린 값을
        저장할 위험이 없어** 기존 None 계약을 유지한다. 관리비 경로는 반드시
        `_body_or_raise` 를 쓴다.
        """
        try:
            return cls._body_or_raise(url, params)
        except KaptApiError as exc:
            logger.warning("[kapt] 호출 실패 — %s", exc)
            return None


def fetch_apt_list_page(page: int, num_of_rows: int = 1000) -> tuple[list[dict], int]:
    """전국 K-apt 단지 목록 1페이지. 반환 (items, totalCount).

    호출 실패 시 ([], 0) — 호출자는 items 가 비면 페이지네이션을 멈춘다.
    ⚠ 실패와 "마지막 페이지"가 같은 신호로 보이므로, 호출자는 totalCount 기준
    진행률도 함께 확인해 조용한 조기 종료를 감지해야 한다.
    """
    body = KaptAPI._body(
        f"{_LIST_URL}/getTotalAptList4",
        {"pageNo": str(page), "numOfRows": str(num_of_rows)},
    )
    if not body:
        return [], 0
    return _as_item_list(body.get("items")), _safe_int(body.get("totalCount")) or 0


def fetch_apt_basis_info(kapt_code: str) -> dict | None:
    """단지 기본정보 (getAphusBassInfoV5) — 세대수·복도유형·사용승인일 등."""
    body = KaptAPI._body(f"{_BASIS_URL}/getAphusBassInfoV5", {"kaptCode": kapt_code})
    if not body:
        return None
    item = body.get("item")
    return item if isinstance(item, dict) else None


def _is_blank_item(item: dict) -> bool:
    """item 의 값이 **전부** 비어 있나(None 또는 공백 문자열) — K-apt 의 실제 "미공개" 모양.

    ⚠ K-apt 관리비 API 는 미공개 (단지, 달)에 빈 body 를 주지 않는다. HTTP 200 +
    resultCode "00" + **키는 다 있고 값이 전부 null 인 item** 을 준다(kaptCode 도 null).
    2026-09-24 실측 원문(A10022507 · 202606/202605 · 공용 첫·둘째 op):
      {"item": {"kaptCode": null, "kaptName": null, "pay": null, "sundryCost": null, ...}}
    옛 판정 `if not item` 은 이 dict 를 "공개"로 봐, 첫 op 조기 이탈이 한 번도 서지 않고
    미공개 단지가 월마다 공용 17콜씩(3개월 51콜) 태웠다(09-24 회차 미공개 299단지 = 15,351콜).

    "전부" 비어야만 미공개다 — kaptCode 같은 값이 하나라도 있으면 공개로 본다
    (응답이 온 이상 금액 파싱 실패는 미공개가 아니다 — `_collect_ops` docstring).
    """
    for value in item.values():
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        return False
    return True


# 관리비 오퍼레이션 **호출 시도 수** 누적 — 회차 요약 로그가 "미공개 단지가 실제로 몇 콜을
# 썼나"를 찍기 위한 계측(설계값 월당 1콜이 실제로 지켜지는지 로그만으로 판정하려고).
# 호출 **직전**에 올리므로 실패한 호출도 센다 — 쿼터 카운터(call_api 당 1)와 같은 단위.
# 스케줄러 잡은 한 번에 하나만 돌아 동시성 문제는 없다. 차이값(전후 뺄셈)으로만 쓴다.
_cost_call_count = 0


def cost_calls_made() -> int:
    """지금까지 `fetch_cost_item` 이 시도한 관리비 호출 수(프로세스 누적)."""
    return _cost_call_count


def fetch_cost_item(base_url: str, op: str, kapt_code: str, search_date: str) -> dict | None:
    """관리비 오퍼레이션 1건 호출 → item dict.

    (b) 정상 미공개면 None, (c) 호출 실패면 `KaptApiError` — 둘을 절대 뭉개지 않는다.
    (b)는 빈 body 와 **값이 전부 null 인 item** 두 모양 모두다(`_is_blank_item`).
    """
    global _cost_call_count
    _cost_call_count += 1
    body = KaptAPI._body_or_raise(
        f"{base_url}/{op}", {"kaptCode": kapt_code, "searchDate": search_date}, op=op
    )
    if not body:
        return None
    item = body.get("item")
    if not isinstance(item, dict) or _is_blank_item(item):
        return None
    return item


def fetch_common_cost(kapt_code: str, search_date: str) -> dict[str, int]:
    """공용관리비 17항목 — {op: 금액}. 미공개 항목은 키 자체를 넣지 않는다.

    "전 항목 없음"(빈 dict)과 "전 항목 0원"을 호출자가 구분할 수 있도록,
    값이 None 인 항목은 아예 제외한다.

    ⚠ 한 op 라도 호출 실패면 `KaptApiError` 를 올린다(부분 dict 반환 금지) —
    17항목 중 하나만 빠져도 총액이 조용히 줄어들기 때문.
    """
    return _collect_ops(_CMNUSE_URL, COMMON_COST_OPS, kapt_code, search_date, _extract_amount)


def fetch_common_cost_probe(kapt_code: str, search_date: str) -> dict | None:
    """공용관리비 **첫 op 1콜만** — 그 (단지, 달)이 공개돼 있나 확인용.

    `_collect_ops` 의 조기 이탈이 "첫 op 유무 = 그 서비스·월 전체 공개 여부"를 전제로
    하므로(같은 함수 docstring 의 전수 실측 근거), 생사 확인도 같은 op 하나로 충분하다.
    17콜을 다 태우면 확인 비용이 수집 비용과 같아져 카나리의 의미가 사라진다.

    (b) 미공개면 None, (c) 호출 실패면 `KaptApiError` — 3상태 계약은 그대로다.
    """
    return fetch_cost_item(_CMNUSE_URL, COMMON_COST_OPS[0], kapt_code, search_date)


def fetch_individual_cost(kapt_code: str, search_date: str) -> dict[str, int]:
    """개별사용료 5항목 — {op: 공용(C)+전용(P) 합계}. 미공개 항목은 키 제외.

    `fetch_common_cost` 와 동일하게, 한 op 라도 실패하면 `KaptApiError`.
    """
    return _collect_ops(
        _INDVDLZ_URL, INDIVIDUAL_COST_OPS, kapt_code, search_date,
        lambda _op, item: _extract_paired_amount(item),
    )


def _collect_ops(base_url, ops, kapt_code, search_date, extractor) -> dict[str, int]:
    """op 목록을 순회해 {op: 금액}. 실패는 즉시 전파(부분 결과 반환 금지).

    `fetch_cost_item` 이 `KaptApiError` 를 올리면 그대로 위로 통과시킨다 —
    여기서 잡아 `continue` 하면 "17항목 중 3개만 성공한 반쪽 dict" 가 만들어지고,
    그게 곧 이 PR 이 고치는 결함이다. 남은 op 를 더 부르지 않고 즉시 빠져나오므로
    쿼터가 이미 바닥난 상황에서 헛호출을 쌓지도 않는다.

    ⚠ **첫 op 가 (b) 정상 미공개면 나머지 op 를 부르지 않고 즉시 빈 dict** —
    미공개 단지의 헛호출 차단. 근거 = 저장된 breakdown 전수 실측(2026-09-19,
    8,023행): **모든 행이 22키(공용 17 + 개별 5)** 이고 한 서비스가 부분만 실린
    행은 0건이다 — 즉 API 는 서비스·월 단위로 전부 아니면 전무라, 첫 op 유무가
    그 서비스 공개 여부와 같다. (그중 932행은 개별 5키가 옛 op 이름 `…V2` 로
    저장돼 있다. V3 이름만 세면 "개별 0" 으로 잘못 보인다 — 세션 414 에 실제로
    그렇게 오독했다가 독립 감사에서 바로잡았다.)
    ⚠ 조기 이탈은 **첫 op 에만** 건다. 뒤쪽 op 가 비는 것은 기존대로 그 항목만
    건너뛴다(`continue`) — 위 전수 실측에 없는 조합이라도 값을 버리지 않기 위해.
    첫 op 가 item 은 줬는데 금액 파싱이 None 인 경우도 "공개"로 보고 계속한다
    (응답이 온 이상 미공개가 아니다). 단 **값이 전부 null 인 item** 은 K-apt 의 실제
    미공개 모양이라 `fetch_cost_item` 이 이미 None 으로 바꿔 준다 — 세션 417 전까지는
    이 변환이 없어 조기 이탈이 실전에서 한 번도 서지 않았다(`_is_blank_item`).

    `extractor(op, item)` — 공용은 op 마다 금액 칸이 달라 op 를 함께 넘긴다.
    """
    result: dict[str, int] = {}
    for index, op in enumerate(ops):
        item = fetch_cost_item(base_url, op, kapt_code, search_date)
        if not item:
            if index == 0:
                return {}  # (b) 첫 op 미공개 = 이 서비스·월 전체 미공개
            continue  # (b) 정상 미공개 — 이 항목만 건너뛴다
        amount = extractor(op, item)
        if amount is not None:
            result[op] = amount
    return result


def _extract_amount(op: str, item: dict) -> int | None:
    """공용관리비 op 1건의 금액 = `_COST_AMOUNT_FIELDS[op]` 칸의 **합**.

    - 사전에 없는 op → 경고 + None(저장 안 함). 옛 "첫 숫자 칸" 추측으로 돌아가지 않는다.
    - 값이 None(또는 숫자 아님)인 칸은 0 이 아니라 "없음"으로 건너뛴다.
      칸이 **전부** 없으면 None — 그 항목은 저장하지 않는다(전 칸 null item 은
      이미 `fetch_cost_item` 이 미공개로 걸러 주고, 여기 오는 것은 부분 null 뿐이다).
    - 사전에 없는 칸이 응답에 오면 경고만 남긴다 — K-apt 가 칸을 늘리거나 이름을 바꾸면
      그 금액이 빠진 채 저장되므로, 합계는 그대로 내되 로그로 드러낸다.
    """
    fields = _COST_AMOUNT_FIELDS.get(op)
    if fields is None:
        logger.warning("[kapt] 금액 칸 사전에 없는 op — 저장 안 함 (op=%s, 칸=%s)", op, list(item))
        return None
    unknown = [k for k in item if k not in fields and k not in _NON_AMOUNT_KEYS]
    if unknown:
        logger.warning("[kapt] 사전에 없는 응답 칸 — 합계에서 빠짐 (op=%s, 칸=%s)", op, unknown)
    total = None
    for field in fields:
        amount = _safe_int(item.get(field))
        if amount is None:
            continue
        total = amount if total is None else total + amount
    return total


def _extract_paired_amount(item: dict) -> int | None:
    """개별사용료 응답의 공용(C)+전용(P) 합산.

    한쪽만 값이 있으면 그 한쪽만 (둘 다 없으면 None — "미공개"로 취급).
    필드명(heatC/heatP…)을 하드코딩하지 않고 `_NON_AMOUNT_KEYS` 를 뺀 나머지
    숫자를 전부 더한다(5 op 모두 원문 실측 결과 C·P 두 칸뿐이라 결과가 같다 —
    세션 417, A50630215 · 202606).

    ⚠ "전부 더하기"라 제외 목록에 없는 숫자 메타는 순서와 무관하게 무조건 요금에
    얹힌다 — 공용 `_extract_amount` 처럼 칸 사전을 쓰지 않는 쪽의 대가.
    """
    total = None
    for key, value in item.items():
        if key in _NON_AMOUNT_KEYS:
            continue
        amount = _safe_int(value)
        if amount is None:
            continue
        total = amount if total is None else total + amount
    return total


def _safe_int(value) -> int | None:
    """API 가 숫자를 int·float·문자열("2210072") 로 섞어 준다 — 전부 int 로.

    bool 은 int 서브클래스라 명시적으로 배제한다(금액이 True/False 일 리 없다).
    """
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        text = value.strip().replace(",", "")
        if not text:
            return None
        try:
            return int(float(text))
        except ValueError:
            return None
    return None


def _as_item_list(items) -> list[dict]:
    """items 정규화 — 공공데이터 API 는 1건일 때 dict, 여러 건일 때 list 를 준다.

    `{"item": [...]}` 래핑 형태도 함께 흡수한다.
    """
    if items is None:
        return []
    if isinstance(items, dict):
        inner = items.get("item")
        if inner is not None:
            items = inner
        else:
            return [items]
    if isinstance(items, dict):
        return [items]
    if isinstance(items, list):
        return [it for it in items if isinstance(it, dict)]
    return []
