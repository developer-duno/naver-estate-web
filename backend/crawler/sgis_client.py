"""SGIS(국가데이터처 통계지리정보) OpenAPI3 클라이언트 — 인증 토큰 캐시·GET·오류코드 판정 (PR ②, 세션 456).

`scripts/map_complex_sgis.py` 의 같은 이름 부품과 동작이 같다(그 스크립트는 운영 중이라 그대로 두고,
공용으로 옮기는 것은 후속). 설계서 = docs/superpowers/specs/2026-10-08-sgis-neighborhood-card-design.md §2.

인증
    `auth/authentication.json`(env SGIS_CONSUMER_KEY·SGIS_CONSUMER_SECRET) → accessToken 을 들고 다니다가
    만료(accessTimeout — 실측 밀리초 시각, 발급 뒤 약 4시간) 5분 전에 새로 받는다.

결과 판정 (SgisClient.get)
    * errCd 0 → ok · errCd -100(결과 없음) → no_result.
    * 그 밖의 오류코드(-200·-201 코드 오류, 토큰 만료 등) → 토큰을 새로 받아 한 번만 다시 묻고, 그래도면 fail.
    * HTTP 412·429·5xx·네트워크 오류·JSON 아님 → fail. **"자료 없음"이 아니라 실패**다(error-propagation 룰 5).
    호출 사이 간격(기본 0.2초)은 클라이언트가 지킨다 — 네이버가 아니라 AdaptiveThrottle 불필요.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

BASE_URL = "https://sgisapi.mods.go.kr/OpenAPI3/"
AUTH_PATH = "auth/authentication.json"
ERR_OK = 0
ERR_NO_RESULT = -100
DEFAULT_INTERVAL = 0.2
TOKEN_MARGIN_MS = 5 * 60 * 1000
HTTP_TIMEOUT = 10


class SgisRequestError(Exception):
    """HTTP 412·429·5xx·네트워크·JSON 아님 — '자료 없음'이 아니라 실패."""


def http_get_json(url: str, params: dict) -> dict:
    """가장 낮은 경계 — 시험은 이 함수만 가짜로 바꾼다."""
    import requests

    try:
        resp = requests.get(url, params=params, timeout=HTTP_TIMEOUT)
    except requests.RequestException as e:
        raise SgisRequestError(f"네트워크 오류: {type(e).__name__}") from e
    if resp.status_code != 200:
        raise SgisRequestError(f"HTTP {resp.status_code}")
    try:
        data = resp.json()
    except ValueError as e:
        raise SgisRequestError("JSON 이 아닌 응답") from e
    if not isinstance(data, dict):
        raise SgisRequestError("응답 모양이 dict 가 아님")
    return data


def _err_code(raw) -> int | None:
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _timeout_ms(raw) -> int | None:
    """accessTimeout → 밀리초 시각. 문서는 '초', 실측은 밀리초라 크기로 가른다."""
    try:
        v = int(float(raw))
    except (TypeError, ValueError):
        return None
    return v if v >= 10**12 else v * 1000


class TokenCache:
    """accessToken 을 만료 5분 전까지 다시 쓴다."""

    def __init__(self, key: str, secret: str, now_ms=lambda: int(time.time() * 1000)):
        self._key = key
        self._secret = secret
        self._now_ms = now_ms
        self._token: str | None = None
        self._expires_ms = 0
        self.issued = 0

    def get(self, force: bool = False) -> str:
        if force or self._token is None or self._now_ms() >= self._expires_ms - TOKEN_MARGIN_MS:
            self._issue()
        return self._token  # type: ignore[return-value]

    def _issue(self) -> None:
        data = http_get_json(BASE_URL + AUTH_PATH, {"consumer_key": self._key, "consumer_secret": self._secret})
        result = data.get("result") or {}
        token = result.get("accessToken") if isinstance(result, dict) else None
        if _err_code(data.get("errCd")) != ERR_OK or not token:
            raise SgisRequestError(f"인증 실패(errCd={data.get('errCd')} {data.get('errMsg')})")
        expires = _timeout_ms(result.get("accessTimeout"))
        # 만료 시각을 못 읽으면 1시간짜리로 보고 일찍 다시 받는다
        self._expires_ms = expires if expires else self._now_ms() + 60 * 60 * 1000
        self._token = str(token)
        self.issued += 1


@dataclass
class Reply:
    kind: str            # ok | no_result | fail
    result: Any = None
    detail: str = ""


class SgisClient:
    """GET 1번(다시 묻기 포함) → Reply. `calls` = 실제로 부른 자료 호출 수(인증 제외)."""

    def __init__(self, tokens: TokenCache, *, interval: float = DEFAULT_INTERVAL, sleep=time.sleep):
        self.tokens = tokens
        self._interval = interval
        self._sleep = sleep
        self.calls = 0

    def get(self, path: str, **params) -> Reply:
        data: dict = {}
        try:
            for attempt in range(2):
                if self.calls:
                    self._sleep(self._interval)
                token = self.tokens.get(force=attempt > 0)
                self.calls += 1
                data = http_get_json(BASE_URL + path, {**params, "accessToken": token})
                err = _err_code(data.get("errCd"))
                if err == ERR_OK:
                    return Reply("ok", data.get("result"))
                if err == ERR_NO_RESULT:
                    return Reply("no_result", detail=str(data.get("errMsg")))
            return Reply("fail", detail=f"오류코드 {data.get('errCd')} {data.get('errMsg')}")
        except SgisRequestError as e:
            return Reply("fail", detail=str(e))
