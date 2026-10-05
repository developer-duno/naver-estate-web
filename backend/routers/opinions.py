"""손님 "의견 보내기" 라우트 — 누구나 보내고, 공개된 답만 누구나 본다 (세션 433).

- POST /api/opinions          의견 저장 + 사장님 텔레그램(BackgroundTasks — 요청을 안 붙잡음)
- GET  /api/opinions/public   "고쳤습니다" 공개 목록 — 공개 제목·답만(원문·이메일·화면 주소 없음)

관리자 쪽(목록·답장·공개·삭제)은 routers/admin/opinions.py.

하루 한도(사장님 결정 2026-10-06, 전부 한국 자정에 풀림):
  - 비로그인 = IP 묶음당 3건(IPv6 는 앞 64비트로 묶음) + 비로그인 전체 200건(메모리 카운터, 재시작하면 0)
  - 로그인 = 10건(auth.permissions.check_quota)
답장 메일은 로그인한 분만(가입 이메일) — 만료 토큰은 get_optional_user 가 None 으로 돌려 비로그인과 같게 다룬다.
"""

import ipaddress
import logging
import threading
from datetime import datetime
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, PrivateAttr, field_validator, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from auth.permissions import check_quota
from auth.rate_limiter import _get_client_ip
from db.models import SiteOpinion
from deps import get_db, get_optional_user
from services.opinion_alert import notify_new_opinion

logger = logging.getLogger(__name__)
router = APIRouter()

KST = ZoneInfo("Asia/Seoul")
ANON_DAILY_LIMIT = 3
ANON_TOTAL_DAILY_LIMIT = 200
USER_DAILY_LIMIT = 10
LIMIT_DETAIL = "오늘은 더 보낼 수 없어요. 내일 다시 보내 주세요"
TOTAL_LIMIT_DETAIL = "오늘은 의견이 많이 와서 더 받을 수 없어요. 로그인하시면 보낼 수 있어요"
MESSAGE_MIN = 10
MESSAGE_MAX = 1000
PAGE_PATH_MAX = 200
USER_AGENT_MAX = 300
PUBLIC_PAGE_SIZE = 20

# 폭 0 문자(눈에 안 보이는 글자) — 이것만으로 10자를 채우는 빈 의견을 막으려고 길이 검사 전에 지운다.
# ZWJ(U+200D)는 지우지 않는다 — 가족 이모지처럼 그림 여럿을 한 그림으로 잇는 글자라 지우면 낱개로 풀린다.
# 대신 최소 길이를 셀 때만 ZWJ 를 빼고 센다(ZWJ 만으로 10자를 채우는 빈 의견도 막히게).
_ZERO_WIDTH = str.maketrans("", "", "\u200b\u200c\ufeff")
_ZWJ = "\u200d"
_REPLACEMENT_CHAR = "\ufffd"

# 비로그인 하루 카운터 — 한국 날짜가 바뀌면 통째로 비운다(지난 날 열쇠가 쌓이지 않는다).
_anon_lock = threading.Lock()
_anon_day: str | None = None  # 지금 세는 한국 날짜 "YYYY-MM-DD"
_anon_by_ip: dict[str, int] = {}  # IP 묶음 → 그날 받은 건수
_anon_total = 0  # 그날 받은 비로그인 의견 전체 건수


def _now() -> datetime:
    """지금 시각(한국). 시험에서 이 함수를 바꿔 자정 전후를 고정한다."""
    return datetime.now(KST)


def _reset_anon_counters_for_tests() -> None:
    """시험 사이 카운터 초기화(모듈 메모리라 시험끼리 섞이지 않게)."""
    global _anon_day, _anon_total
    with _anon_lock:
        _anon_day = None
        _anon_by_ip.clear()
        _anon_total = 0


def ip_bucket(ip: str) -> str:
    """하루 한도를 세는 IP 묶음.

    IPv6 는 앞 64비트(한 집·한 기기가 보통 /64 를 통째로 받아 주소를 마음대로 바꿀 수 있다) ·
    IPv4 는 그대로 · IPv4 를 담은 IPv6(::ffff:1.2.3.4)는 그 IPv4 로(/64 로 묶으면 모든 IPv4 가 한 묶음이 된다) ·
    알아볼 수 없는 값은 원문 그대로.
    """
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return ip
    if addr.version == 4:
        return ip
    if addr.ipv4_mapped is not None:
        return str(addr.ipv4_mapped)
    try:
        return str(ipaddress.ip_network(f"{ip}/64", strict=False))
    except ValueError:
        return ip


def _take_anon_slot(bucket: str) -> str | None:
    """비로그인 한 건 받기 — 받으면 None, 막히면 429 문구.

    개인 한도에 막힌 요청은 전체 칸을 먹지 않고, 전체 상한에 막힌 요청은 개인 칸을 먹지 않는다.
    """
    global _anon_day, _anon_total
    day = _now().astimezone(KST).date().isoformat()
    with _anon_lock:
        if _anon_day != day:
            _anon_day = day
            _anon_by_ip.clear()
            _anon_total = 0
        if _anon_by_ip.get(bucket, 0) >= ANON_DAILY_LIMIT:
            return LIMIT_DETAIL
        if _anon_total >= ANON_TOTAL_DAILY_LIMIT:
            return TOTAL_LIMIT_DETAIL
        _anon_by_ip[bucket] = _anon_by_ip.get(bucket, 0) + 1
        _anon_total += 1
        return None


def _has_lone_surrogate(text: str) -> bool:
    """짝 없는 서로게이트(U+D800~U+DFFF)가 있나 — 짝이 맞는 이모지는 이미 한 글자로 합쳐져 들어온다."""
    return any(0xD800 <= ord(c) <= 0xDFFF for c in text)


def _replace_lone_surrogates(text: str) -> str:
    return "".join(_REPLACEMENT_CHAR if 0xD800 <= ord(c) <= 0xDFFF else c for c in text)


class OpinionIn(BaseModel):
    kind: Literal["bug", "data", "suggest", "other"]
    message: str
    page_path: str | None = None
    interests: list[Literal["market", "presale", "tax", "other"]] | None = None
    website: str | None = None  # 숨김 칸 — 사람은 비워 두고 봇만 채운다

    _bad_chars: bool = PrivateAttr(default=False)

    @model_validator(mode="wrap")
    @classmethod
    def _catch_lone_surrogates(cls, data, handler):
        """짝 없는 서로게이트(U+D800~U+DFFF 반쪽 글자)를 검사 전에 대체 글자로 바꿔 두고 표시만 한다.

        그대로 두면 저장 순간 UTF-8 변환이 500 을 내고, 검사에서 막아도 FastAPI 기본 422 응답이 입력값을
        되돌려 주다가 같은 이유로 500 이 난다(시험 실측). 그래서 여기선 바꿔 놓기만 하고, 422 는 라우트가 낸다.
        """
        bad = False
        if isinstance(data, dict):
            clean: dict = {}
            for key, value in data.items():
                if isinstance(value, str) and _has_lone_surrogate(value):
                    value, bad = _replace_lone_surrogates(value), True
                elif isinstance(value, list):
                    items = []
                    for item in value:
                        if isinstance(item, str) and _has_lone_surrogate(item):
                            item, bad = _replace_lone_surrogates(item), True
                        items.append(item)
                    value = items
                clean[key] = value
            data = clean
        inst = handler(data)
        inst._bad_chars = bad
        return inst

    @field_validator("message")
    @classmethod
    def _message_length(cls, v: str) -> str:
        # NUL 은 PostgreSQL text 에 못 들어간다(저장 순간 500) → 입력 단계에서 422.
        # (짝 없는 서로게이트는 이 검사 전에 _catch_lone_surrogates 가 걸러 둔다.)
        if "\x00" in v:
            raise ValueError("쓸 수 없는 글자가 들어 있어요")
        v = v.translate(_ZERO_WIDTH).strip()
        if len(v.replace(_ZWJ, "")) < MESSAGE_MIN or len(v) > MESSAGE_MAX:
            raise ValueError(f"의견은 {MESSAGE_MIN}자 이상 {MESSAGE_MAX}자 이하로 써 주세요")
        return v


def clean_page_path(raw: str | None) -> str | None:
    """보던 화면 경로 — '/' 로 시작하는 우리 사이트 경로만, 쿼리·조각 제거, 200자 이하. 아니면 None."""
    if not raw:
        return None
    path = raw.split("?", 1)[0].split("#", 1)[0]
    if not path.startswith("/") or path.startswith("//"):
        return None
    # 역슬래시(브라우저가 '/' 로 읽어 '/\evil' → 남의 사이트) · 출력 불가 문자(제어문자·\u2028 등)
    # · 공백류(ASCII 공백·\u0085 등) 중 하나라도 있으면 버린다.
    if (
        len(path) > PAGE_PATH_MAX
        or "\\" in path
        or not path.isprintable()
        or any(c.isspace() for c in path)
    ):
        return None
    return path


def _enforce_daily_limit(db: Session, request: Request, user: dict | None) -> None:
    if user:
        try:
            check_quota(db, user["user_id"], "opinion", USER_DAILY_LIMIT)
        except HTTPException as e:
            if e.status_code == 429:
                raise HTTPException(status_code=429, detail=LIMIT_DETAIL) from e
            raise
        return
    detail = _take_anon_slot(ip_bucket(_get_client_ip(request)))
    if detail:
        raise HTTPException(status_code=429, detail=detail)


@router.post("")
def submit_opinion(
    body: OpinionIn,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: dict | None = Depends(get_optional_user),
):
    """의견 저장. 숨김 칸이 채워져 있으면(봇) 저장 없이 받은 척만 한다."""
    if body._bad_chars:
        raise HTTPException(status_code=422, detail="쓸 수 없는 글자가 들어 있어요")
    if body.website and body.website.strip():
        logger.info("의견함 숨김 칸 걸림 1건 — 저장 안 함")
        return {"received": True}

    _enforce_daily_limit(db, request, user)

    user_email = (user.get("email") or None) if user else None
    interests = sorted(set(body.interests)) if body.interests else None
    page_path = clean_page_path(body.page_path)
    user_agent = (request.headers.get("user-agent") or "")[:USER_AGENT_MAX] or None

    row = SiteOpinion(
        kind=body.kind,
        message=body.message,
        page_path=page_path,
        interests=interests,
        user_id=user["user_id"] if user else None,
        user_email=user_email,
        user_agent=user_agent,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    background_tasks.add_task(
        notify_new_opinion,
        kind=body.kind,
        page_path=page_path,
        user_email=user_email,
        message=body.message,
    )
    return {"id": row.id, "received": True, "can_reply": bool(user_email)}


@router.get("/public")
def list_public_opinions(
    response: Response,
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
):
    """공개로 돌린 의견의 제목·답만 — 원문·이메일·화면 주소·브라우저 정보는 절대 넣지 않는다."""
    total = db.scalar(select(func.count()).select_from(SiteOpinion).where(SiteOpinion.is_public.is_(True))) or 0
    rows = db.scalars(
        select(SiteOpinion)
        .where(SiteOpinion.is_public.is_(True))
        .order_by(SiteOpinion.published_at.desc(), SiteOpinion.id.desc())
        .offset((page - 1) * PUBLIC_PAGE_SIZE)
        .limit(PUBLIC_PAGE_SIZE)
    ).all()
    response.headers["Cache-Control"] = "public, max-age=300"
    return {
        "items": [
            {
                "id": r.id,
                "public_title": r.public_title,
                "public_answer": r.public_answer,
                "status": r.status,
                "published_at": r.published_at.isoformat() if r.published_at else None,
            }
            for r in rows
        ],
        "total": total,
        "page": page,
    }
