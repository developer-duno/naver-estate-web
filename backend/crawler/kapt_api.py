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

⚠ 쿼터: 목록·기본정보는 운영계정 10만/일이지만, 관리비 두 서비스는 아직 **개발계정**
이고 한도는 **서비스당 5,000/일 (오퍼레이션 합산)** 이다 — 오퍼레이션마다 따로
1,000 이 아니다(공개 페이지 실측 2026-08-29). 한 단지당 공용 17콜 + 개별 5콜이라
배치 500 이면 공용만 8,500콜로 한도를 넘긴다 → 운영은 `KAPT_COST_BATCH_SIZE=250`.

⚠ 3상태 구분 (이 모듈의 핵심 계약): 관리비 호출 결과는 반드시
  (a) 성공 + 데이터 있음   → item dict
  (b) 성공 + 데이터 없음   → None ("정상 미공개" — 이 달·이 항목은 원래 없다)
  (c) 호출 실패           → `KaptApiError` 예외 (쿼터 초과·키 오류·점검·파싱 실패)
셋으로 갈린다. (b)와 (c)를 둘 다 None 으로 뭉개면, 공용이 통째로 실패하고
개별만 성공한 회차에서 "공용관리비 0원" 인 반쪽 총액이 사실처럼 저장되고
그 달 행이 생겨 다음 달까지 재수집도 안 된다 — 그래서 (c)는 예외로 올린다.
"""

import logging

from crawler.public_data_base import BasePublicDataAPI

logger = logging.getLogger(__name__)

_LIST_URL = "https://apis.data.go.kr/1613000/AptListService4"
_BASIS_URL = "https://apis.data.go.kr/1613000/AptBasisInfoServiceV5"
_CMNUSE_URL = "https://apis.data.go.kr/1613000/AptCmnuseManageCostServiceV3"
_INDVDLZ_URL = "https://apis.data.go.kr/1613000/AptIndvdlzManageCostServiceV3"

# 공용관리비 V3 오퍼레이션 17종. 각 응답의 금액 필드명이 op 마다 다르므로
# (guardCost·cleanCost·…) 이름을 하드코딩하지 않고 `_extract_amount` 로 뽑는다.
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

# 응답 dict 에서 금액이 아닌 필드 — 금액 추출 시 건너뛴다.
#
# ⚠ 여기에 빠진 "숫자형 메타"는 그대로 금액이 된다. `_extract_amount` 가 필드명을
# 안 믿고 "첫 숫자 필드"를 쓰는 방어적 파서라, 금액이 아닌 숫자가 응답 앞쪽에
# 오면 그게 관리비로 저장되기 때문이다(예: searchDate "202605" → 20만원대 금액).
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
        """
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
            logger.warning("[kapt] 예상과 다른 응답 구조 — op=%s", op or url)
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


def fetch_cost_item(base_url: str, op: str, kapt_code: str, search_date: str) -> dict | None:
    """관리비 오퍼레이션 1건 호출 → item dict.

    (b) 정상 미공개면 None, (c) 호출 실패면 `KaptApiError` — 둘을 절대 뭉개지 않는다.
    """
    body = KaptAPI._body_or_raise(
        f"{base_url}/{op}", {"kaptCode": kapt_code, "searchDate": search_date}, op=op
    )
    if not body:
        return None
    item = body.get("item")
    return item if isinstance(item, dict) else None


def fetch_common_cost(kapt_code: str, search_date: str) -> dict[str, int]:
    """공용관리비 17항목 — {op: 금액}. 미공개 항목은 키 자체를 넣지 않는다.

    "전 항목 없음"(빈 dict)과 "전 항목 0원"을 호출자가 구분할 수 있도록,
    값이 None 인 항목은 아예 제외한다.

    ⚠ 한 op 라도 호출 실패면 `KaptApiError` 를 올린다(부분 dict 반환 금지) —
    17항목 중 하나만 빠져도 총액이 조용히 줄어들기 때문.
    """
    return _collect_ops(_CMNUSE_URL, COMMON_COST_OPS, kapt_code, search_date, _extract_amount)


def fetch_individual_cost(kapt_code: str, search_date: str) -> dict[str, int]:
    """개별사용료 5항목 — {op: 공용(C)+전용(P) 합계}. 미공개 항목은 키 제외.

    `fetch_common_cost` 와 동일하게, 한 op 라도 실패하면 `KaptApiError`.
    """
    return _collect_ops(
        _INDVDLZ_URL, INDIVIDUAL_COST_OPS, kapt_code, search_date, _extract_paired_amount
    )


def _collect_ops(base_url, ops, kapt_code, search_date, extractor) -> dict[str, int]:
    """op 목록을 순회해 {op: 금액}. 실패는 즉시 전파(부분 결과 반환 금지).

    `fetch_cost_item` 이 `KaptApiError` 를 올리면 그대로 위로 통과시킨다 —
    여기서 잡아 `continue` 하면 "17항목 중 3개만 성공한 반쪽 dict" 가 만들어지고,
    그게 곧 이 PR 이 고치는 결함이다. 남은 op 를 더 부르지 않고 즉시 빠져나오므로
    쿼터가 이미 바닥난 상황에서 헛호출을 쌓지도 않는다.
    """
    result: dict[str, int] = {}
    for op in ops:
        item = fetch_cost_item(base_url, op, kapt_code, search_date)
        if not item:
            continue  # (b) 정상 미공개 — 이 항목만 건너뛴다
        amount = extractor(item)
        if amount is not None:
            result[op] = amount
    return result


def _extract_amount(item: dict) -> int | None:
    """응답 dict 에서 금액 1개 추출 — op 마다 필드명이 달라 이름을 안 믿는다.

    `_NON_AMOUNT_KEYS`(식별·메타 필드)를 제외한 **첫 번째 숫자 변환 가능 필드**를
    금액으로 본다. (guardCost·cleanCost·laborCost… 17개 이름을 하드코딩하면 API 가
    필드명을 바꾸거나 op 가 추가될 때 조용히 0원이 된다 — 방어적 파서를 택한 이유.)
    dict 는 파이썬 3.7+ 삽입 순서를 보존하므로 "첫 필드"가 결정론적이다.

    ⚠ 순서 의존이라 제외 목록이 곧 정확도다 — 응답에 새 숫자형 메타가 늘면
    그게 금액으로 둔갑한다. 새 오퍼레이션을 추가할 때 응답 키를 실측해
    `_NON_AMOUNT_KEYS` 를 함께 보강할 것.
    """
    for key, value in item.items():
        if key in _NON_AMOUNT_KEYS:
            continue
        amount = _safe_int(value)
        if amount is not None:
            return amount
    return None


def _extract_paired_amount(item: dict) -> int | None:
    """개별사용료 응답의 공용(C)+전용(P) 합산.

    한쪽만 값이 있으면 그 한쪽만 (둘 다 없으면 None — "미공개"로 취급).
    필드명(heatC/heatP…)을 하드코딩하지 않고 `_NON_AMOUNT_KEYS` 를 뺀 나머지
    숫자를 전부 더한다 — `_extract_amount` 와 같은 이유의 방어적 파싱.

    ⚠ 여기선 "전부 더하기"라 메타 오염이 더 나쁘다 — 첫 필드만 쓰는
    `_extract_amount` 와 달리, 제외 목록에 없는 숫자 메타는 순서와 무관하게
    무조건 요금에 얹힌다.
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
