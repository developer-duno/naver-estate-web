"""V-WORLD 공동주택 공시가격 조회 API 클라이언트 (국가중점 API).

보유세 계산기 자동입력·단지 상세 표시에 쓰는 국토교통부 공동주택가격을 가져온다.

- 요청주소: https://api.vworld.kr/ned/data/getApartHousingPriceAttr
- 인증: VWORLD_API_KEY + VWORLD_DOMAIN (vworld_client.py 와 같은 키를 공유).
  서버사이드는 domain 파라미터 필수 — 없으면 INCORRECT_KEY (vworld_client.py 주석 답습).
- pnu: **법정동코드 10자리만** 넣으면 그 동 전체가 반환된다(19자리 PNU 불필요).
  cortar_no 와 동일 체계 — 대치동(1168010600) 2026년 = 48,928행 실측.

응답 구조 (2026-08-09 라이브 프로브 실측 — 아래 3가지가 전부 다르다):
  · 정상:   {"apartHousingPrices": {"field":[...], "pageNo","totalCount","numOfRows",
                                     "resultCode":"", "resultMsg":""}}
  · 인증실패: {"apartHousingPrices": {"resultCode":"INVALID_KEY", "resultMsg":"..."}}  (field 없음)
  · 0건:    {"response": {"pageNo","resultCode":"","totalCount":"0",...}}
            ⚠ 래퍼 키가 apartHousingPrices 가 아니라 **response** 다. 이걸 모르면
            "결과 없음"을 파싱 실패로 오인한다.

행 필드(실측 19종): stdrYear · stdrMt · aphusCode · aphusNm · aphusSeCode/Nm ·
  dongNm · hoNm · floorNm · prvuseAr(전용면적 ㎡, 문자열) · pblntfPc(공시가격 원, 문자열) ·
  ldCode/ldCodeNm · pnu · mnnmSlno · regstrSeCode/Nm · spclLandNm · lastUpdtDt.
"""

import logging
import os
import threading
import time

import requests as std_requests

logger = logging.getLogger(__name__)

APART_HOUSING_PRICE_URL = "https://api.vworld.kr/ned/data/getApartHousingPriceAttr"
REQUEST_TIMEOUT = 10

# 한 페이지 최대 행수 — V-WORLD 허용 상한(1000). 대치동 48,928행 = 49페이지.
PAGE_SIZE = 1000

# 페이지 루프 안전 상한 — totalCount 로 계산한 마지막 페이지에 더해 두는 여유분이 아니라,
# totalCount 가 비정상(빈 문자열 등)일 때의 폭주 방지용 하드 리밋.
MAX_PAGES = 200

# 429 재시도 횟수 — throttle 이 감속한 뒤 재시도한다.
MAX_RETRIES = 3


class _PriceApiThrottle:
    """공시가격 API 전용 적응형 쓰로틀 (429 대응).

    ⚠ crawler/utils.py 의 AdaptiveThrottle·get_shared_throttle 을 공유하지 않는다 —
    그쪽은 네이버 IP 차단 방지용 전역 브레이크라, 네이버와 무관한 V-WORLD 호출이
    같은 인스턴스를 잡으면 네이버 크롤링까지 같이 느려진다(반대도 마찬가지).
    클래스 변수 3종(_lock/_last_request_time/_session)을 여기서 자체 선언한다.
    """

    _lock = threading.Lock()
    _last_request_time = 0.0
    _interval = 0.2  # 기본 200ms — 쿼터 사실상 무제한이라 과도한 감속 불필요
    _max_interval = 5.0
    _session: std_requests.Session | None = None

    @classmethod
    def wait(cls) -> None:
        """다음 요청 전 필요한 만큼 대기."""
        with cls._lock:
            elapsed = time.monotonic() - cls._last_request_time
            wait_time = max(0.0, cls._interval - elapsed)
        if wait_time > 0:
            time.sleep(wait_time)
        with cls._lock:
            cls._last_request_time = time.monotonic()

    @classmethod
    def on_rate_limit(cls) -> None:
        """429 응답 시 간격 2배 증가 (상한 5초)."""
        with cls._lock:
            cls._interval = min(cls._interval * 2.0, cls._max_interval)
            logger.warning("[official_price] 429 Rate Limit — 간격 %.0fms", cls._interval * 1000)

    @classmethod
    def session(cls) -> std_requests.Session:
        """커넥션 재사용 세션 (동 하나에 수십 페이지를 연속 호출하므로)."""
        with cls._lock:
            if cls._session is None:
                cls._session = std_requests.Session()
            return cls._session


def _extract_wrapper(data: dict) -> dict:
    """응답 봉투 추출 — 정상/에러는 apartHousingPrices, 0건은 response 로 온다(실측)."""
    if not isinstance(data, dict):
        return {}
    return data.get("apartHousingPrices") or data.get("response") or {}


def _fetch_page(pnu: str, stdr_year: str, page_no: int) -> tuple[list[dict], int] | None:
    """한 페이지 조회 → (행 목록, totalCount). 실패 시 None.

    에러 3분기:
      1) 네트워크·타임아웃·HTTP 오류 → None (호출 실패)
      2) API 에러코드(resultCode 가 비어있지 않고 field 도 없음) → None
      3) 파싱 실패(JSON 아님) → None
    "0건"은 실패가 아니라 정상 → ([], 0) 을 반환한다.
    """
    api_key = os.getenv("VWORLD_API_KEY")
    domain = os.getenv("VWORLD_DOMAIN")
    if not api_key or not domain:
        logger.warning("[official_price] VWORLD_API_KEY/VWORLD_DOMAIN 미설정")
        return None

    params = {
        "key": api_key,
        "domain": domain,
        "format": "json",
        "pnu": pnu,
        "stdrYear": stdr_year,
        "numOfRows": str(PAGE_SIZE),
        "pageNo": str(page_no),
    }

    for attempt in range(MAX_RETRIES):
        _PriceApiThrottle.wait()
        try:
            resp = _PriceApiThrottle.session().get(
                APART_HOUSING_PRICE_URL, params=params, timeout=REQUEST_TIMEOUT
            )
        except std_requests.Timeout:
            logger.warning("[official_price] 타임아웃 (pnu=%s p=%d)", pnu, page_no)
            return None
        except Exception as e:
            logger.warning("[official_price] 요청 실패 (pnu=%s): %s", pnu, type(e).__name__)
            return None

        if resp.status_code == 429:
            _PriceApiThrottle.on_rate_limit()
            if attempt < MAX_RETRIES - 1:
                continue
            logger.warning("[official_price] 429 재시도 소진 (pnu=%s p=%d)", pnu, page_no)
            return None
        if resp.status_code != 200:
            logger.warning("[official_price] HTTP %d (pnu=%s p=%d)", resp.status_code, pnu, page_no)
            return None

        try:
            data = resp.json()
        except Exception:
            logger.warning("[official_price] JSON 파싱 실패 (pnu=%s p=%d)", pnu, page_no)
            return None

        wrapper = _extract_wrapper(data)
        if not wrapper:
            logger.warning("[official_price] 알 수 없는 응답 구조 (pnu=%s p=%d)", pnu, page_no)
            return None

        fields = wrapper.get("field") or []
        if isinstance(fields, dict):  # 1건이면 dict 로 오는 V-WORLD 관례
            fields = [fields]

        # 에러코드 판정 — 정상 응답의 resultCode 는 빈 문자열("")이다.
        result_code = (wrapper.get("resultCode") or "").strip()
        if result_code and not fields:
            logger.warning(
                "[official_price] resultCode=%s (pnu=%s) %s",
                result_code, pnu, wrapper.get("resultMsg") or "",
            )
            return None

        try:
            total_count = int(wrapper.get("totalCount") or 0)
        except (TypeError, ValueError):
            total_count = 0

        return fields, total_count

    return None


def fetch_official_prices(pnu: str, stdr_year: str) -> list[dict] | None:
    """법정동 하나의 공시가격 **전 페이지**를 모아서 반환. 실패 시 None.

    Args:
        pnu: 법정동코드 10자리 (cortar_no 그대로)
        stdr_year: 기준연도 4자리 문자열 ("2026")

    Returns:
        성공: 행 dict 리스트 (0건이면 빈 리스트)
        실패: None — 호출자는 "빈 동"과 "조회 실패"를 반드시 구분해야 한다.

    ⚠ 페이지 끝 판정은 **totalCount 기준**이다. `len(page) < PAGE_SIZE` 로 끊으면 안 된다 —
    V-WORLD 는 범위를 넘은 pageNo 를 받으면 400/빈응답이 아니라 **마지막 페이지를 그대로
    반복 반환**한다(2026-08-09 실측: 대치동 last_page=49(928건)인데 p50·p999 도 동일한
    928건 반환). 총행수가 정확히 PAGE_SIZE 배수인 동에서는 종료 조건이 영영 참이 되지
    않아 무한 루프 + 같은 데이터 중복 누적이 된다.

    ⚠ 전 페이지를 다 받은 뒤에만 매칭해야 한다 — V-WORLD 는 소형 빌라를 앞 페이지,
    대형 아파트를 뒷 페이지에 배치해(대치동은 48페이지에야 대형 단지 등장) 부분 수집 시
    매칭률이 3%로 왜곡된다(플랜 §3-2-5 실측).
    """
    first = _fetch_page(pnu, stdr_year, 1)
    if first is None:
        return None

    rows, total_count = first
    if not rows:
        return []

    last_page = min((total_count + PAGE_SIZE - 1) // PAGE_SIZE, MAX_PAGES)
    for page_no in range(2, last_page + 1):
        page = _fetch_page(pnu, stdr_year, page_no)
        if page is None:
            # 중간 페이지 실패 = 불완전 수집. 부분 결과로 매칭하면 세대수 게이트가
            # 통째로 어긋나므로(위 ⚠ 참조) 실패로 올려 이 동을 통째 건너뛴다.
            logger.warning("[official_price] 페이지 %d/%d 실패 — 동 %s 수집 포기",
                           page_no, last_page, pnu)
            return None
        rows.extend(page[0])

    return rows
