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

    ⚠ 마지막에 **행수 정합성(len(rows) == totalCount)** 을 반드시 확인한다. 페이지 하나가
    통째로 실패하는 경우(위)는 잡히지만, **"성공처럼 보이는데 살짝 모자란 응답"** 은 여기서만
    잡힌다 — 2026-08-09 첫 전국 수집에서 대치동 은마(4,424세대)가 미매칭된 실사고의 원인이
    이것이다(사후 재조회로는 48,928행 전량 수신 · ho 비율 0.9851 로 정상 매칭). 대형 단지가
    뒷 페이지에 몰려 있어, 몇 행만 모자라도 그 단지의 호수가 부족해지고 세대수 ±5% 게이트에서
    조용히 탈락한다. 불완전 스냅샷은 부분 매칭보다 **통째 포기**가 안전하다.
    """
    first = _fetch_page(pnu, stdr_year, 1)
    if first is None:
        return None

    rows, total_count = first
    if not rows:
        # 0건은 정상(빈 동) — 아래 행수 정합성 가드의 대상이 아니다.
        # (totalCount 가 0 이 아닌데 1페이지가 비어 오는 건 애초에 수집할 게 없는 상태라
        #  여기서 끊는 편이 뒤에서 0 != totalCount 로 걸리는 것보다 의미가 분명하다.)
        return []

    full_last_page = (total_count + PAGE_SIZE - 1) // PAGE_SIZE
    last_page = min(full_last_page, MAX_PAGES)
    for page_no in range(2, last_page + 1):
        page = _fetch_page(pnu, stdr_year, page_no)
        if page is None:
            # 중간 페이지 실패 = 불완전 수집. 부분 결과로 매칭하면 세대수 게이트가
            # 통째로 어긋나므로(위 ⚠ 참조) 실패로 올려 이 동을 통째 건너뛴다.
            logger.warning("[official_price] 페이지 %d/%d 실패 — 동 %s 수집 포기",
                           page_no, last_page, pnu)
            return None
        rows.extend(page[0])

    # MAX_PAGES 캡에 걸린 경우엔 len(rows) < total_count 가 **정상**이라 아래 정합성 가드가
    # 오발한다. 그래도 결과는 같은 "불완전 스냅샷"이므로 동일하게 포기하되, 원인이 다르니
    # 로그를 분리한다(가드 오발이 아니라 캡 부족이라는 신호 — MAX_PAGES 를 올려야 한다).
    # 실측상 최대 동이 대치동 48,928행(49페이지)이라 200페이지=20만행 캡에는 4배 여유가
    # 있어 현재 도달 사례는 없다.
    if full_last_page > MAX_PAGES:
        logger.warning(
            "[official_price] 동 %s 총 %d행이 MAX_PAGES(%d=%d행) 캡을 초과 — 수집 포기 "
            "(캡 상향 검토 필요)",
            pnu, total_count, MAX_PAGES, MAX_PAGES * PAGE_SIZE,
        )
        return None

    # 행수 정합성 가드 — 기대치와 1행이라도 다르면 불완전 스냅샷으로 보고 포기한다.
    # `!=` 인 이유: 모자란 경우(은마 사고)뿐 아니라 **초과**도 비정상이다(마지막 페이지
    # 반복 반환 등으로 중복 누적된 상태라 중위값이 왜곡된다).
    # totalCount 파싱 실패로 0 인데 rows 는 있는 기형 응답도 여기 걸려 None 이 되는데,
    # 그게 **의도**다 — 총량을 모르는 응답은 완전성을 증명할 수 없으므로 신뢰하지 않는다.
    if len(rows) != total_count:
        logger.warning(
            "[official_price] 동 %s 행수 불일치 — 기대 %d행 / 수신 %d행. 불완전 스냅샷이라 "
            "수집 포기 (부분 데이터로 매칭하면 대형 단지가 세대수 게이트에서 탈락)",
            pnu, total_count, len(rows),
        )
        return None

    return rows
