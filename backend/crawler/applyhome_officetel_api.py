"""청약홈 오피스텔·도시형·공공지원 민간임대 API 클라이언트 (이슈 #323).

data.go.kr 카탈로그 15098547 (한국부동산원_청약홈 분양정보 조회 서비스) —
기존 PUBLIC_DATA_API_KEY 로 이미 승인된 서비스 안에 오피스텔·민간임대
오퍼레이션이 함께 포함돼 있다 (2026-08-08 실측, 승인 완료).

API 문서: https://www.data.go.kr/data/15098547/openapi.do

`BasePublicDataAPI`(crime_stats_api.py·air_quality_api.py 와 동일 기반 클래스)를
상속해 공유 일일 쿼터(9,000회, mibunyang 과 공유) 추적·throttle·재시도를
그대로 재사용한다 — 별도 재시도 로직을 새로 만들지 않는다 (`oss-first.md` 답습).
"""

import logging
from datetime import date, datetime

from crawler.public_data_base import BasePublicDataAPI

logger = logging.getLogger(__name__)

BASE_URL = "https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1"

_EMPTY_RESPONSE = {"data": [], "totalCount": 0}


class ApplyhomeOfficetelAPI(BasePublicDataAPI):
    """청약홈 오피스텔·도시형·공공지원 민간임대 API — odcloud 기반 (BasePublicDataAPI 상속)."""

    _api_name = "applyhome_officetel"

    @classmethod
    def _call(cls, op: str, page: int, per_page: int) -> dict:
        """odcloud.kr 오퍼레이션 1페이지 호출.

        BasePublicDataAPI.call_api() 가 None 을 반환할 수 있다(API 키 없음·
        쿼터초과·전체 재시도 실패) — 호출자(Task 4·5 collect_*)가
        `resp.get("data", [])` 형태로 방어 코드 없이 짜여 있으므로,
        여기서 빈 응답으로 변환해 `-> dict` 계약을 지킨다.
        """
        url = f"{BASE_URL}/{op}"
        data = cls.call_api(url, {
            "page": str(page),
            "perPage": str(per_page),
            "returnType": "JSON",
        })
        if data is None:
            logger.warning("[applyhome_officetel] %s 응답 없음 — 빈 결과로 대체", op)
            return dict(_EMPTY_RESPONSE)
        return data


def fetch_officetel_detail(page: int = 1, per_page: int = 1000) -> dict:
    """오피스텔/도시형/생숙 공고 상세 (getUrbtyOfctlLttotPblancDetail)."""
    return ApplyhomeOfficetelAPI._call("getUrbtyOfctlLttotPblancDetail", page, per_page)


def fetch_officetel_unit(page: int = 1, per_page: int = 1000) -> dict:
    """오피스텔/도시형/생숙 평형별 공급정보 (getUrbtyOfctlLttotPblancMdl)."""
    return ApplyhomeOfficetelAPI._call("getUrbtyOfctlLttotPblancMdl", page, per_page)


def fetch_rental_detail(page: int = 1, per_page: int = 1000) -> dict:
    """공공지원 민간임대 공고 상세 (getPblPvtRentLttotPblancDetail)."""
    return ApplyhomeOfficetelAPI._call("getPblPvtRentLttotPblancDetail", page, per_page)


def fetch_rental_unit(page: int = 1, per_page: int = 1000) -> dict:
    """공공지원 민간임대 평형별 공급정보 (getPblPvtRentLttotPblancMdl)."""
    return ApplyhomeOfficetelAPI._call("getPblPvtRentLttotPblancMdl", page, per_page)


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
