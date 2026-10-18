"""한국부동산원 R-ONE 통계 열린 API 클라이언트 — 표 하나의 월간 자료를 쪽마다 받아 행 목록으로 (세션 473).

설계 = 메모리 design/s473_pr4-public-stats-plan.html 5절. 공식 주소 = reb.or.kr/r-one/openapi/SttsApiTblData.do
(공공데이터포털 15134761 은 링크형 — 포털 열쇠는 ERROR-290 으로 거부된다, 2026-10-18 실측).

호출 인자: KEY · Type=json · pIndex(1부터) · pSize · STATBL_ID · DTACYCLE_CD=MM · START_WRTTIME · END_WRTTIME(YYYYMM).
응답(정상) = {"SttsApiTblData": [{"head": [{"list_total_count": N}, {"RESULT": {"CODE": "INFO-000", …}}]},
                                 {"row": [{"CLS_FULLNM": "경기>경부1권>안양시>만안구", "WRTTIME_IDTFR_ID": "202601",
                                           "DTA_VAL": 65.03, "UI_NM": "%", …}, …]}]}
응답(오류·결과 없음) = 최상위에 {"RESULT": {"CODE": …, "MESSAGE": …}} 만.
  * INFO-200 = 해당하는 데이터가 없음(2026-10-18 실측: START_WRTTIME=209901) → 빈 목록.
  * ERROR-290 = 인증키가 유효하지 않음 → 예외.
열쇠 없이 부르면 pIndex·pSize 를 무시하고 표본 5건만 준다 → 첫 쪽에서 전체가 5건보다 많은데 정확히 5건만 오면
  "열쇠가 적용되지 않았다"로 보고 예외(5건만 저장하고 완료로 끝내지 않는다 — error-propagation 룰 5).
  그 밖에 쪽당 행이 pSize 보다 적은 것은 정상(마지막 쪽·기관 상한) — 첫 쪽 행 수를 쪽 크기로 삼아 이어 받는다.
일시 오류(HTTP 5xx·시간 초과·연결 오류)는 5·15·45초 뒤 3번 다시 부른다. 4xx·오류코드(ERROR-290 등)·표본 응답은 다시 안 부른다.
예외에는 열쇠가 든 주소가 남지 않게 원 예외를 잇지 않는다(`from None`) — traceback 에도 열쇠가 안 찍힌다.

예외 문구는 처음부터 쉬운 우리말("부동산원 …")이고 영문 글자를 넣지 않는다 — plain_words 의 원문 유지 규칙이
그대로 알림·관리자 화면에 싣는다. 서버가 준 원문(MESSAGE)은 예외의 server_message 와 로그에만.
호출 사이 1초 — 네이버가 아니라 AdaptiveThrottle 불필요(월 10콜 안팎).
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any

logger = logging.getLogger(__name__)

BASE_URL = "https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do"
PAGE_SIZE = 1000
HTTP_TIMEOUT = 30
CALL_INTERVAL = 1.0
SAMPLE_ROWS = 5           # 열쇠 없이 부르면 오는 표본 행 수(2026-10-18 실측)
MAX_PAGES = 100            # 표 하나 3~4달치는 1쪽(전세가율 ≈ 230지역 × 4달) — 무한 반복 안전장치
RETRY_WAITS = (5, 15, 45)  # 일시 오류 재시도 대기(초)
CODE_OK = "INFO-000"
CODE_NO_DATA = "INFO-200"  # 해당하는 데이터가 없습니다(실측)
CODE_BAD_KEY = "ERROR-290"  # 인증키가 유효하지 않습니다(실측)
KEY_ENV = "RONE_API_KEY"


class RoneKeyMissing(RuntimeError):
    """환경 변수 RONE_API_KEY 가 없다 — 열쇠 없이는 표본 5건뿐이라 부르지 않는다."""

    def __init__(self) -> None:
        super().__init__("부동산원 인증키가 없어요(서버 설정에 열쇠를 넣어야 받을 수 있어요)")


class RoneApiError(RuntimeError):
    """HTTP 오류·네트워크·JSON 아님·RESULT 오류코드·표본 모드 — '자료 없음'이 아니라 실패."""

    def __init__(
        self, message: str, code: str | None = None, server_message: str | None = None, retryable: bool = False
    ) -> None:
        super().__init__(message)
        self.code = code
        self.server_message = server_message
        self.retryable = retryable   # HTTP 5xx·시간 초과·연결 오류만 True


def _code_number(code: str) -> str:
    """"ERROR-290" → "290" (우리말 문구에 영문을 싣지 않으려고 번호만)."""
    digits = "".join(ch for ch in str(code) if ch.isdigit())
    return digits or "알 수 없음"


def http_get_json(url: str, params: dict) -> Any:
    """가장 낮은 경계 — 시험은 이 함수만 가짜로 바꾼다."""
    import requests

    try:
        resp = requests.get(url, params=params, timeout=HTTP_TIMEOUT)
    except requests.RequestException as e:
        # 원 예외 문구에는 열쇠가 든 주소가 있다 — 종류 이름만 남기고 잇지 않는다(from None)
        kind = type(e).__name__
        logger.warning("부동산원 호출 네트워크 오류: %s", kind)
        retry = isinstance(e, (requests.Timeout, requests.ConnectionError))
        raise RoneApiError("부동산원 창구에 연결하지 못했어요(네트워크 문제)", retryable=retry) from None
    if resp.status_code != 200:
        raise RoneApiError(
            f"부동산원 창구가 응답하지 못했어요(상태 번호 {resp.status_code})", retryable=resp.status_code >= 500
        )
    try:
        return resp.json()
    except ValueError:
        raise RoneApiError("부동산원 창구가 알 수 없는 모양으로 답했어요") from None


def _get_with_retry(get, url: str, params: dict, sleep) -> Any:
    """일시 오류만 RETRY_WAITS 대로 다시 부른다. 마지막 실패는 그대로 올린다."""
    for wait in (*RETRY_WAITS, None):
        try:
            return get(url, params)
        except RoneApiError as e:
            if not e.retryable or wait is None:
                raise
            logger.info("부동산원 일시 오류 — %d초 뒤 다시 불러요: %s", wait, e)
            sleep(wait)


def _parse_page(data: Any) -> tuple[int, list[dict]] | None:
    """한 쪽 응답 → (list_total_count, 행 목록). 결과 없음(INFO-200)이면 None. 오류면 예외."""
    if not isinstance(data, dict):
        raise RoneApiError("부동산원 창구가 알 수 없는 모양으로 답했어요")
    top = data.get("RESULT")
    if isinstance(top, dict):   # 최상위 RESULT 만 = 오류 또는 결과 없음
        code = str(top.get("CODE") or "")
        if code == CODE_NO_DATA:
            return None
        msg = top.get("MESSAGE")
        logger.warning("부동산원 오류 응답: %s %s", code, msg)
        if code == CODE_BAD_KEY:
            raise RoneApiError(
                f"부동산원 인증키가 맞지 않아요(사유 번호 {_code_number(code)})", code=code, server_message=msg
            )
        raise RoneApiError(
            f"부동산원 창구가 오류를 알려 왔어요(사유 번호 {_code_number(code)})", code=code, server_message=msg
        )
    body = data.get("SttsApiTblData")
    if not isinstance(body, list):
        raise RoneApiError("부동산원 창구가 알 수 없는 모양으로 답했어요")
    total: int | None = None
    code: str | None = None
    msg = None
    rows: list[dict] = []
    for part in body:
        if not isinstance(part, dict):
            continue
        for h in part.get("head") or []:
            if not isinstance(h, dict):
                continue
            if "list_total_count" in h:
                try:
                    total = int(h["list_total_count"])
                except (TypeError, ValueError):
                    total = None
            res = h.get("RESULT")
            if isinstance(res, dict):
                code = str(res.get("CODE") or "")
                msg = res.get("MESSAGE")
        got = part.get("row")
        if isinstance(got, list):
            rows.extend(r for r in got if isinstance(r, dict))
    if code == CODE_NO_DATA:
        return None
    if code != CODE_OK:
        logger.warning("부동산원 머리 결과 이상: %s %s", code, msg)
        raise RoneApiError(
            f"부동산원 창구가 오류를 알려 왔어요(사유 번호 {_code_number(code or '')})",
            code=code, server_message=msg,
        )
    if total is None:
        raise RoneApiError("부동산원 창구가 전체 행 수를 알려 주지 않았어요")
    return total, rows


def fetch_table(
    statbl_id: str,
    start_yyyymm: str,
    end_yyyymm: str,
    *,
    key: str | None = None,
    sleep=time.sleep,
    get=None,
) -> list[dict]:
    """표 하나의 월간 자료(start~end, YYYYMM)를 쪽마다 받아 행 dict 목록으로 돌려준다.

    key 를 안 주면 환경 변수 RONE_API_KEY. 없으면 RoneKeyMissing.
    get = http_get_json 대체(시험용). 결과 없음(INFO-200)이면 빈 목록.
    """
    key = key if key is not None else os.getenv(KEY_ENV, "").strip()
    if not key:
        raise RoneKeyMissing()
    get = get or http_get_json
    out: list[dict] = []
    page = 1
    total: int | None = None
    page_size = PAGE_SIZE   # 기관이 pSize 보다 작은 상한으로 자르면 첫 쪽 행 수를 쪽 크기로 삼는다
    while page <= MAX_PAGES:
        if page > 1:
            sleep(CALL_INTERVAL)
        params = {
            "KEY": key, "Type": "json", "pIndex": page, "pSize": page_size,
            "STATBL_ID": statbl_id, "DTACYCLE_CD": "MM",
            "START_WRTTIME": start_yyyymm, "END_WRTTIME": end_yyyymm,
        }
        parsed = _parse_page(_get_with_retry(get, BASE_URL, params, sleep))
        if parsed is None:
            if page == 1:
                return []
            raise RoneApiError(f"부동산원 자료를 {page}쪽에서 더 받지 못했어요(앞쪽은 받음)")
        total, rows = parsed
        if page == 1 and total > SAMPLE_ROWS and len(rows) == SAMPLE_ROWS:
            # 열쇠 없이 부르면 쪽 크기를 무시하고 표본 5건만 온다 — 열쇠가 적용되지 않은 것
            raise RoneApiError(
                f"부동산원이 {total}건 중 {len(rows)}건만 줬어요(인증키가 적용되지 않은 표본 응답으로 보여요)"
            )
        if not rows:   # 받은 행이 0 이면 멈춘다(무한 반복 방지) — 다 못 받았으면 반쪽으로 끝내지 않는다
            if len(out) < total:
                raise RoneApiError(f"부동산원 자료를 {total}건 중 {len(out)}건만 받고 더 오지 않았어요")
            return out
        if page == 1 and len(rows) < min(page_size, total):
            page_size = len(rows)   # 기관 상한이 pSize 보다 작다 — 그 크기로 이어 받는다
        out.extend(rows)
        if len(out) >= total:
            return out
        page += 1
    raise RoneApiError(f"부동산원 자료가 {MAX_PAGES}쪽을 넘어 멈췄어요")
