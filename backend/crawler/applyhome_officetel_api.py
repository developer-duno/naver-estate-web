"""청약홈 오피스텔·도시형·공공지원 민간임대 API 클라이언트 (이슈 #323).

data.go.kr 카탈로그 15098547 (한국부동산원_청약홈 분양정보 조회 서비스) —
기존 PUBLIC_DATA_API_KEY 로 이미 승인된 서비스 안에 오피스텔·민간임대
오퍼레이션이 함께 포함돼 있다 (2026-08-08 실측, 승인 완료).

API 문서: https://www.data.go.kr/data/15098547/openapi.do
"""

import logging
import os
from datetime import date, datetime

from curl_cffi import requests as cffi_requests

logger = logging.getLogger(__name__)

BASE_URL = "https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1"
REQUEST_TIMEOUT = 15
MAX_RETRIES = 3
RETRY_DELAYS = [2, 5, 10]


def _get_api_key() -> str | None:
    return os.getenv("PUBLIC_DATA_API_KEY")


def _call(op: str, page: int, per_page: int) -> dict:
    """odcloud.kr 오퍼레이션 1페이지 호출 (재시도 내장)."""
    api_key = _get_api_key()
    session = cffi_requests.Session()
    last_exc: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            r = session.get(
                f"{BASE_URL}/{op}",
                params={
                    "serviceKey": api_key,
                    "page": page,
                    "perPage": per_page,
                    "returnType": "JSON",
                },
                timeout=REQUEST_TIMEOUT,
            )
            r.raise_for_status()
            return r.json()
        except Exception as e:  # noqa: BLE001 — 외부 API 예외 유형 다양, 재시도 목적
            last_exc = e
            if attempt < MAX_RETRIES - 1:
                import time

                time.sleep(RETRY_DELAYS[attempt])
    raise RuntimeError(f"{op} 호출 실패 ({MAX_RETRIES}회 재시도)") from last_exc


def fetch_officetel_detail(page: int = 1, per_page: int = 1000) -> dict:
    """오피스텔/도시형/생숙 공고 상세 (getUrbtyOfctlLttotPblancDetail)."""
    return _call("getUrbtyOfctlLttotPblancDetail", page, per_page)


def fetch_officetel_unit(page: int = 1, per_page: int = 1000) -> dict:
    """오피스텔/도시형/생숙 평형별 공급정보 (getUrbtyOfctlLttotPblancMdl)."""
    return _call("getUrbtyOfctlLttotPblancMdl", page, per_page)


def fetch_rental_detail(page: int = 1, per_page: int = 1000) -> dict:
    """공공지원 민간임대 공고 상세 (getPblPvtRentLttotPblancDetail)."""
    return _call("getPblPvtRentLttotPblancDetail", page, per_page)


def fetch_rental_unit(page: int = 1, per_page: int = 1000) -> dict:
    """공공지원 민간임대 평형별 공급정보 (getPblPvtRentLttotPblancMdl)."""
    return _call("getPblPvtRentLttotPblancMdl", page, per_page)


def parse_compact_date(v: str | None) -> date | None:
    """ISO("2026-08-06")·compact("20260804") 두 형식 모두 date 로. 그 외 None.

    mibunyang 실측(설계문서 §4-3 인용, 원 출처 applyhome-competition-8ch-design.md §3-2):
    같은 odcloud.kr 시스템 안에서도 오퍼레이션마다 날짜 형식이 다르다.
    """
    if not isinstance(v, str):
        return None
    t = v.strip()
    if not t:
        return None
    try:
        if len(t) == 10 and t[4] == "-" and t[7] == "-":
            return datetime.strptime(t, "%Y-%m-%d").date()
        if len(t) == 8 and t.isdigit():
            return datetime.strptime(t, "%Y%m%d").date()
    except ValueError:
        return None
    return None


def parse_comma_amount(v) -> int | None:
    """콤마 유무 상관없이 금액 문자열을 int 로. "-"·None·빈문자열은 None.

    mibunyang 실측: getOPTLttotPblancMdl 은 "62,342"(콤마 있음),
    getRemndrLttotPblancMdl 은 "134190"(콤마 없음) — 같은 필드가 오퍼레이션마다 다르다.
    """
    if v is None:
        return None
    s = str(v).strip().replace(",", "")
    if not s or s == "-":
        return None
    try:
        return int(float(s))
    except ValueError:
        return None
