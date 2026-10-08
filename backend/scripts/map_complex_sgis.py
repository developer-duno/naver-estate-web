"""단지 좌표 → SGIS 행정동 코드(8글자)를 complexes.sgis_emd_cd 에 채운다 (V071, 세션 453 — 설계서 §5-2).

무엇을 하나
    `complexes.sgis_emd_cd IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL` 인 단지를
    complex_no 순으로 골라, 단지마다 SGIS `OpenAPI3/addr/rgeocodewgs84.json`(x_coor=경도, y_coor=위도,
    addr_type=20 — WGS84 그대로)을 1번 부른다. 응답의 sido_cd(2)+sgg_cd(3)+emdong_cd(3)를 이어 붙인
    8글자를 sgis_emd_cd 에, 지금 시각을 sgis_mapped_at 에 넣는다. 호출 간격 0.2초(네이버가 아니라
    AdaptiveThrottle 불필요). 50단지마다 커밋.

인증
    `auth/authentication.json`(env SGIS_CONSUMER_KEY·SGIS_CONSUMER_SECRET) → accessToken 을 들고 다니다가
    만료(accessTimeout — 실측 밀리초 시각, 발급 뒤 약 4시간) 5분 전에 새로 받는다. 응답이 정상(0)도
    결과 없음(-100)도 아닌 오류코드면 토큰을 새로 받아 한 번만 다시 묻는다(만료 코드를 문서로 확인하지
    못해서 — 오류코드 값에 기대지 않는다).

결과 판정
    * errCd 0 + 8글자 조립 성공 → 저장.
    * errCd -100(결과 없음 — 바다 위·좌표 이상 등) → NULL 그대로 두고 로그. 다음 실행에서 다시 묻는다.
    * HTTP 429·5xx·네트워크 오류·JSON 아님·다시 물어도 오류코드·응답 모양 이상 → **"자료 없음"이 아니라
      실패**로 센다(error-propagation 룰 5). NULL 그대로. 실패가 **연속 20회**면 멈춘다(종료코드 2).

중단·재개
    NULL 인 단지만 고르므로 중간에 끊겨도 다시 돌리면 남은 것부터 간다(커밋된 것은 다시 안 부른다).

하루 상한
    공식 한도 5만 콜/일(SGIS 안내 원문). 한 번 실행에 부르는 rgeocode 횟수 상한 = `--daily-cap`(기본 40,000).
    하루에 한 번만 돌린다는 전제의 상한이다 — 같은 날 두 번 돌리면 합쳐서 넘을 수 있다.
    단지 약 6만 → 이틀에 나눠 돈다. 인증 호출(4시간에 1번 남짓)은 따로 센다.

사용 (backend 폴더에서)
    python scripts/map_complex_sgis.py --limit 20 --dry-run   # 20단지만 묻고 DB 에는 안 씀
    python scripts/map_complex_sgis.py --limit 200            # 200단지만
    python scripts/map_complex_sgis.py                        # 상한(4만)까지
    ⚠ --dry-run 도 SGIS 를 실제로 부른다 — 부른 만큼 그날 한도를 쓴다(DB 쓰기만 안 한다).
    ⚠ V071 이 운영에 적용된 뒤에만 돌린다.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logger = logging.getLogger("map_complex_sgis")

BASE_URL = "https://sgisapi.mods.go.kr/OpenAPI3/"
AUTH_PATH = "auth/authentication.json"
RGEO_PATH = "addr/rgeocodewgs84.json"
ERR_OK = 0
ERR_NO_RESULT = -100
DEFAULT_DAILY_CAP = 40_000
DEFAULT_INTERVAL = 0.2
MAX_CONSECUTIVE_FAILURES = 20
COMMIT_EVERY = 50
TOKEN_MARGIN_MS = 5 * 60 * 1000
HTTP_TIMEOUT = 10


class SgisRequestError(Exception):
    """HTTP 429·5xx·네트워크·JSON 아님 — '자료 없음'이 아니라 실패."""


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
        if data.get("errCd") != ERR_OK or not token:
            raise SgisRequestError(f"인증 실패(errCd={data.get('errCd')} {data.get('errMsg')})")
        expires = _timeout_ms(result.get("accessTimeout"))
        # 만료 시각을 못 읽으면 1시간짜리로 보고 일찍 다시 받는다
        self._expires_ms = expires if expires else self._now_ms() + 60 * 60 * 1000
        self._token = str(token)
        self.issued += 1


def build_emd_cd(result) -> str | None:
    """rgeocodewgs84 result → 8글자 행정동 코드. 모양이 다르면 None."""
    first = result[0] if isinstance(result, list) and result else result
    if not isinstance(first, dict):
        return None
    parts = (first.get("sido_cd"), first.get("sgg_cd"), first.get("emdong_cd"))
    if any(p is None for p in parts):
        return None
    code = "".join(str(p).strip() for p in parts)
    return code if len(code) == 8 and code.isdigit() else None


@dataclass
class Outcome:
    kind: str            # ok | no_result | fail
    emd_cd: str | None = None
    detail: str = ""
    calls: int = 0       # 실제로 부른 rgeocode 횟수(다시 묻기 포함)


def lookup(tokens: TokenCache, lon: float, lat: float) -> Outcome:
    """단지 좌표 1개 → Outcome. 정상도 -100 도 아닌 오류코드면 토큰을 새로 받아 한 번만 다시 묻는다."""
    calls = 0
    try:
        for attempt in range(2):
            params = {"x_coor": lon, "y_coor": lat, "addr_type": 20, "accessToken": tokens.get(force=attempt > 0)}
            calls += 1
            data = http_get_json(BASE_URL + RGEO_PATH, params)
            err = data.get("errCd")
            if err == ERR_OK:
                code = build_emd_cd(data.get("result"))
                if code is None:
                    return Outcome("fail", detail="응답 모양 이상(코드 조각 없음)", calls=calls)
                return Outcome("ok", emd_cd=code, calls=calls)
            if err == ERR_NO_RESULT:
                return Outcome("no_result", detail=str(data.get("errMsg")), calls=calls)
        return Outcome("fail", detail=f"오류코드 {err} {data.get('errMsg')}", calls=calls)
    except SgisRequestError as e:
        return Outcome("fail", detail=str(e), calls=calls)


@dataclass
class Stats:
    targets: int = 0
    calls: int = 0
    ok: int = 0
    no_result: int = 0
    failed: int = 0
    stop_reason: str = "done"


def select_targets(db, limit: int) -> list[tuple[str, float, float]]:
    from sqlalchemy import text

    rows = db.execute(
        text(
            "SELECT complex_no, latitude, longitude FROM complexes"
            " WHERE sgis_emd_cd IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL"
            " ORDER BY complex_no LIMIT :n"
        ),
        {"n": limit},
    ).fetchall()
    return [(str(r[0]), float(r[1]), float(r[2])) for r in rows]


def run(
    db,
    tokens: TokenCache,
    *,
    limit: int,
    call_cap: int | None = None,
    dry_run: bool = False,
    interval: float = DEFAULT_INTERVAL,
    sleep=time.sleep,
) -> Stats:
    from sqlalchemy import text

    from utils import utcnow

    st = Stats()
    targets = select_targets(db, limit)
    st.targets = len(targets)
    consecutive = 0
    pending = 0
    update = text("UPDATE complexes SET sgis_emd_cd = :cd, sgis_mapped_at = :at WHERE complex_no = :no")
    try:
        for i, (complex_no, lat, lon) in enumerate(targets):
            if call_cap is not None and st.calls >= call_cap:
                st.stop_reason = "daily_cap"
                break
            if i:
                sleep(interval)
            out = lookup(tokens, lon, lat)
            st.calls += out.calls
            if out.kind == "ok":
                st.ok += 1
                consecutive = 0
                if not dry_run:
                    db.execute(update, {"cd": out.emd_cd, "at": utcnow(), "no": complex_no})
                    pending += 1
                    if pending >= COMMIT_EVERY:
                        db.commit()
                        pending = 0
            elif out.kind == "no_result":
                st.no_result += 1
                consecutive = 0
                logger.info("결과 없음 — 단지 %s (%.6f, %.6f): %s", complex_no, lat, lon, out.detail)
            else:
                st.failed += 1
                consecutive += 1
                logger.warning("실패 — 단지 %s: %s (연속 %d회)", complex_no, out.detail, consecutive)
                if consecutive >= MAX_CONSECUTIVE_FAILURES:
                    st.stop_reason = "consecutive_failures"
                    break
            if (i + 1) % 500 == 0:
                logger.info("진행 %d/%d — 채움 %d · 결과 없음 %d · 실패 %d", i + 1, st.targets, st.ok, st.no_result, st.failed)
    finally:
        if pending:
            db.commit()
    return st


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="단지 좌표 → SGIS 행정동 코드(complexes.sgis_emd_cd) 채우기",
        epilog="⚠ --dry-run 도 SGIS 를 실제로 부른다 — 부른 만큼 그날 한도(5만/일)를 쓴다.",
    )
    parser.add_argument("--limit", type=int, default=None, help="이번에 물어볼 단지 수 상한")
    parser.add_argument("--daily-cap", type=int, default=DEFAULT_DAILY_CAP,
                        help=f"한 번 실행의 호출 상한 (기본 {DEFAULT_DAILY_CAP:,} — 하루 1회 실행 전제)")
    parser.add_argument("--interval", type=float, default=DEFAULT_INTERVAL, help="호출 간격 초 (기본 0.2)")
    parser.add_argument("--dry-run", action="store_true",
                        help="SGIS 는 부르되 DB 에 쓰지 않는다 (부른 만큼 한도를 쓴다)")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    from dotenv import load_dotenv

    load_dotenv()
    key = os.getenv("SGIS_CONSUMER_KEY")
    secret = os.getenv("SGIS_CONSUMER_SECRET")
    if not key or not secret:
        print("멈춤: SGIS_CONSUMER_KEY·SGIS_CONSUMER_SECRET 환경 변수가 없어요")
        return 3
    limit = min(args.limit, args.daily_cap) if args.limit is not None else args.daily_cap

    from db.database import SessionLocal

    tokens = TokenCache(key, secret)
    with SessionLocal() as db:
        st = run(db, tokens, limit=limit, call_cap=args.daily_cap, dry_run=args.dry_run, interval=args.interval)
    print(
        f"끝({st.stop_reason}): 대상 {st.targets:,} · 호출 {st.calls:,}(+인증 {tokens.issued}) · 채움 {st.ok:,}"
        f" · 결과 없음 {st.no_result:,} · 실패 {st.failed:,}" + (" · 시험 실행이라 DB 안 씀" if args.dry_run else "")
    )
    return 2 if st.stop_reason == "consecutive_failures" else 0


if __name__ == "__main__":
    sys.exit(main())
