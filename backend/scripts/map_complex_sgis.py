"""단지 좌표 → SGIS 행정동 코드(8글자)를 complexes.sgis_emd_cd 에 채운다 (V071, 세션 453 — 설계서 §5-2).

무엇을 하나
    `complexes.sgis_emd_cd IS NULL AND sgis_mapped_at IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL` 인 단지를
    complex_no 순으로 골라, 단지마다 SGIS `OpenAPI3/addr/rgeocodewgs84.json`(x_coor=경도, y_coor=위도,
    addr_type=20 — WGS84 그대로)을 1번 부른다. 응답의 sido_cd(2)+sgg_cd(3)+emdong_cd(3)를 이어 붙인
    8글자를 sgis_emd_cd 에, 지금 시각을 sgis_mapped_at 에 넣는다. 호출 간격 0.2초(네이버가 아니라
    AdaptiveThrottle 불필요). UPDATE 마다 바로 커밋한다 — 공유 표 complexes 의 행 잠금을 외부 호출 동안
    쥐고 있으면 같은 단지를 고치는 크롤·미분양 쓰기가 기다리다 8초 제한에 걸린다. 대상 목록을 읽은
    트랜잭션도 바로 닫는다. UPDATE 는 `AND sgis_emd_cd IS NULL` 가드로 이미 채운 값을 덮지 않는다.

인증
    `auth/authentication.json`(env SGIS_CONSUMER_KEY·SGIS_CONSUMER_SECRET) → accessToken 을 들고 다니다가
    만료(accessTimeout — 실측 밀리초 시각, 발급 뒤 약 4시간) 5분 전에 새로 받는다. 응답이 정상(0)도
    결과 없음(-100)도 아닌 오류코드면 토큰을 새로 받아 한 번만 다시 묻는다(만료 코드를 문서로 확인하지
    못해서 — 오류코드 값에 기대지 않는다).

결과 판정
    * errCd 0 + 8글자 조립 성공 → 저장.
    * errCd -100(결과 없음 — 바다 위·좌표 이상 등) → 코드는 NULL 그대로, sgis_mapped_at 만 찍고 로그.
      다음 실행 대상에서 빠진다(같은 단지를 매일 다시 묻지 않게). **결과 없음 단지를 다시 시도하려면
      그 행의 sgis_mapped_at 을 비운다.** 결과 없음이 **연속 200회**면 멈춘다(종료코드 2) — 좌표 칸이
      뒤바뀐 자료처럼 한도만 쓰고 0건 저장이 되는 상황을 막는다.
    * HTTP 429·5xx·네트워크 오류·JSON 아님·다시 물어도 오류코드·응답 모양 이상 → **"자료 없음"이 아니라
      실패**로 센다(error-propagation 룰 5). 아무것도 안 찍는다(다음 실행에 다시 묻는다). 실패가 **연속 20회**면
      멈춘다(종료코드 2). 성공이 끼면 두 연속 횟수가 모두 풀리고, 실패·결과 없음은 서로의 연속 횟수를 푼다.

중단·재개
    아직 안 물어본 단지(두 칸 다 NULL)만 고르므로 중간에 끊겨도 다시 돌리면 남은 것부터 간다.

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
MAX_CONSECUTIVE_NO_RESULT = 200
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
    pieces = []
    # 조각별 자리 수 — 숫자로 오면 앞 0 이 빠지므로(sgg 010 → 10) 조각마다 채운 뒤 조각마다 검사한다
    for key, width in (("sido_cd", 2), ("sgg_cd", 3), ("emdong_cd", 3)):
        raw = first.get(key)
        if raw is None or isinstance(raw, bool):
            return None
        piece = str(raw).strip().zfill(width)
        if len(piece) != width or not piece.isdigit():
            return None
        pieces.append(piece)
    return "".join(pieces)


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
            " WHERE sgis_emd_cd IS NULL AND sgis_mapped_at IS NULL"
            " AND latitude IS NOT NULL AND longitude IS NOT NULL"
            " ORDER BY complex_no LIMIT :n"
        ),
        {"n": limit},
    ).fetchall()
    db.commit()  # 읽기 트랜잭션을 외부 호출 동안 열어 두지 않는다
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
    consecutive_none = 0
    save_code = text(
        "UPDATE complexes SET sgis_emd_cd = :cd, sgis_mapped_at = :at"
        " WHERE complex_no = :no AND sgis_emd_cd IS NULL"
    )
    mark_asked = text(
        "UPDATE complexes SET sgis_mapped_at = :at"
        " WHERE complex_no = :no AND sgis_emd_cd IS NULL AND sgis_mapped_at IS NULL"
    )
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
            consecutive = consecutive_none = 0
            if not dry_run:
                db.execute(save_code, {"cd": out.emd_cd, "at": utcnow(), "no": complex_no})
                db.commit()
        elif out.kind == "no_result":
            st.no_result += 1
            consecutive = 0
            consecutive_none += 1
            logger.info("결과 없음 — 단지 %s (%.6f, %.6f): %s", complex_no, lat, lon, out.detail)
            if not dry_run:
                db.execute(mark_asked, {"at": utcnow(), "no": complex_no})
                db.commit()
            if consecutive_none >= MAX_CONSECUTIVE_NO_RESULT:
                st.stop_reason = "consecutive_no_result"
                break
        else:
            st.failed += 1
            consecutive_none = 0
            consecutive += 1
            logger.warning("실패 — 단지 %s: %s (연속 %d회)", complex_no, out.detail, consecutive)
            if consecutive >= MAX_CONSECUTIVE_FAILURES:
                st.stop_reason = "consecutive_failures"
                break
        if (i + 1) % 500 == 0:
            logger.info("진행 %d/%d — 채움 %d · 결과 없음 %d · 실패 %d", i + 1, st.targets, st.ok, st.no_result, st.failed)
    return st


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="단지 좌표 → SGIS 행정동 코드(complexes.sgis_emd_cd) 채우기",
        epilog="⚠ --dry-run 도 SGIS 를 실제로 부른다 — 부른 만큼 그날 한도(5만/일)를 쓴다."
               " 결과 없음 단지를 다시 시도하려면 그 행의 sgis_mapped_at 을 비운다.",
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
    if st.stop_reason == "consecutive_no_result":
        print(f"멈춤: 결과 없음이 {MAX_CONSECUTIVE_NO_RESULT}번 이어졌어요 — 좌표 칸(위도·경도)이 뒤바뀐 것 같은지 확인하세요")
    elif st.stop_reason == "consecutive_failures":
        print(f"멈춤: 실패가 {MAX_CONSECUTIVE_FAILURES}번 이어졌어요 — SGIS 쪽 장애나 한도를 확인하세요")
    return 2 if st.stop_reason in ("consecutive_failures", "consecutive_no_result") else 0


if __name__ == "__main__":
    sys.exit(main())
