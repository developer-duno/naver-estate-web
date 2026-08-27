"""K-apt(공동주택관리정보시스템) 단지·관리비 API 클라이언트.

data.go.kr 1613000 계열 3개 서비스를 한 모듈에서 다룬다 (전부 기존
`PUBLIC_DATA_API_KEY` 로 승인됨 — 2026-08-27 운영계정 전환·활용신청 완료, 라이브 실측):

- `AptListService4`            단지 목록 (kaptCode ↔ 법정동·단지명)
- `AptBasisInfoServiceV5`      단지 기본정보 (세대수·복도유형·사용승인일)
- `AptCmnuseManageCostServiceV3`  공용관리비 17개 오퍼레이션
- `AptIndvdlzManageCostServiceV2` 개별사용료 5개 오퍼레이션

`BasePublicDataAPI`(air_quality_api.py·applyhome_officetel_api.py 와 동일 기반)를
상속해 공유 일일 쿼터 추적·throttle(0.3초)·429 재시도를 그대로 재사용한다 —
재시도·세션 관리를 새로 만들지 않는다 (`oss-first.md` 답습).

⚠ 쿼터: 목록·기본정보는 운영계정 10만/일이지만, 관리비 V2/V3 는 개발계정
(오퍼레이션당 일 1,000 추정)이다. 그래서 `collect_kapt_costs` 는 배치를 작게
가져가고, 기반 클래스의 전역 카운터(mibunyang 과 공유하는 9,000회)에도 함께
잡힌다 — 한 단지당 22콜이라 배치 크기가 곧 쿼터 소모량임을 유의.
"""

import logging

from crawler.public_data_base import BasePublicDataAPI

logger = logging.getLogger(__name__)

_LIST_URL = "https://apis.data.go.kr/1613000/AptListService4"
_BASIS_URL = "https://apis.data.go.kr/1613000/AptBasisInfoServiceV5"
_CMNUSE_URL = "https://apis.data.go.kr/1613000/AptCmnuseManageCostServiceV3"
_INDVDLZ_URL = "https://apis.data.go.kr/1613000/AptIndvdlzManageCostServiceV2"

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

# 개별사용료 V2 오퍼레이션 5종. 응답이 "공용(C) + 전용(P)" 두 필드로 쪼개져 오므로
# (예: {"heatC": "0", "heatP": "0"}) 둘을 더해 항목 금액으로 쓴다.
INDIVIDUAL_COST_OPS: tuple[str, ...] = (
    "getHsmpHeatCostInfoV2",
    "getHsmpHotWaterCostInfoV2",
    "getHsmpGasRentalFeeInfoV2",
    "getHsmpElectricityCostInfoV2",
    "getHsmpWaterCostInfoV2",
)

# 응답 dict 에서 금액이 아닌 식별 필드 — 금액 추출 시 건너뛴다.
_NON_AMOUNT_KEYS = frozenset({"kaptCode", "kaptName"})


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
    def _body(cls, url: str, params: dict) -> dict | None:
        """공통 호출 → response.body 반환. 실패·비정상 응답은 None.

        `call_api` 는 키 미설정·쿼터초과·전체 재시도 실패 시 None 을 준다.
        정상 응답이라도 resultCode 가 '00' 이 아니면(서비스 점검·키 오류 등)
        본문을 신뢰하지 않고 None 으로 떨어뜨린다 — 호출자가 "데이터 없음"과
        "호출 실패"를 구분하지 못하면 silent failure 가 되기 때문.
        """
        data = cls.call_api(url, params)
        if data is None:
            return None
        try:
            response = data["response"]
            header = response.get("header", {})
            code = header.get("resultCode")
            if code not in ("00", "0"):
                logger.warning(
                    "[kapt] 비정상 resultCode=%s msg=%s", code, header.get("resultMsg")
                )
                return None
            body = response.get("body")
        except (KeyError, TypeError, AttributeError):
            logger.warning("[kapt] 예상과 다른 응답 구조 — 건너뜀")
            return None
        return body if isinstance(body, dict) else None


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
    """관리비 오퍼레이션 1건 호출 → item dict (없으면 None)."""
    body = KaptAPI._body(
        f"{base_url}/{op}", {"kaptCode": kapt_code, "searchDate": search_date}
    )
    if not body:
        return None
    item = body.get("item")
    return item if isinstance(item, dict) else None


def fetch_common_cost(kapt_code: str, search_date: str) -> dict[str, int]:
    """공용관리비 17항목 — {op: 금액}. 미공개 항목은 키 자체를 넣지 않는다.

    "전 항목 없음"(빈 dict)과 "전 항목 0원"을 호출자가 구분할 수 있도록,
    값이 None 인 항목은 아예 제외한다.
    """
    return _collect_ops(_CMNUSE_URL, COMMON_COST_OPS, kapt_code, search_date, _extract_amount)


def fetch_individual_cost(kapt_code: str, search_date: str) -> dict[str, int]:
    """개별사용료 5항목 — {op: 공용(C)+전용(P) 합계}. 미공개 항목은 키 제외."""
    return _collect_ops(
        _INDVDLZ_URL, INDIVIDUAL_COST_OPS, kapt_code, search_date, _extract_paired_amount
    )


def _collect_ops(base_url, ops, kapt_code, search_date, extractor) -> dict[str, int]:
    result: dict[str, int] = {}
    for op in ops:
        item = fetch_cost_item(base_url, op, kapt_code, search_date)
        if not item:
            continue
        amount = extractor(item)
        if amount is not None:
            result[op] = amount
    return result


def _extract_amount(item: dict) -> int | None:
    """응답 dict 에서 금액 1개 추출 — op 마다 필드명이 달라 이름을 안 믿는다.

    kaptCode/kaptName 을 제외한 **첫 번째 숫자 변환 가능 필드**를 금액으로 본다.
    (guardCost·cleanCost·laborCost… 17개 이름을 하드코딩하면 API 가 필드명을
    바꾸거나 op 가 추가될 때 조용히 0원이 된다 — 방어적 파서를 택한 이유.)
    dict 는 파이썬 3.7+ 삽입 순서를 보존하므로 "첫 필드"가 결정론적이다.
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
    필드명(heatC/heatP…)을 하드코딩하지 않고 식별 필드를 뺀 나머지 숫자를 전부
    더한다 — `_extract_amount` 와 같은 이유의 방어적 파싱.
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
