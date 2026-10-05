"""손님 "의견 보내기" 라우트 — 누구나 보내고, 공개된 답만 누구나 본다 (세션 433).

- POST /api/opinions          의견 저장 + 사장님 텔레그램(BackgroundTasks — 요청을 안 붙잡음)
- GET  /api/opinions/public   "고쳤습니다" 공개 목록 — 공개 제목·답만(원문·이메일·화면 주소 없음)

관리자 쪽(목록·답장·공개·삭제)은 routers/admin/opinions.py.

하루 한도(사장님 결정 2026-10-06): 비로그인 = IP 당 3건(메모리 카운터, 재시작하면 0) ·
로그인 = 10건(auth.permissions.check_quota, 한국 자정 기준). 답장 메일은 로그인한 분만
(가입 이메일) — 만료 토큰은 get_optional_user 가 None 으로 돌려 비로그인과 같게 다룬다.
"""

import logging
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from auth.permissions import check_quota
from auth.rate_limiter import _check_rate_limit_memory, _get_client_ip
from db.models import SiteOpinion
from deps import get_db, get_optional_user
from services.opinion_alert import notify_new_opinion

logger = logging.getLogger(__name__)
router = APIRouter()

ANON_DAILY_LIMIT = 3
USER_DAILY_LIMIT = 10
LIMIT_DETAIL = "오늘은 더 보낼 수 없어요. 내일 다시 보내 주세요"
MESSAGE_MIN = 10
MESSAGE_MAX = 1000
PAGE_PATH_MAX = 200
USER_AGENT_MAX = 300
PUBLIC_PAGE_SIZE = 20

# 폭 0 문자(눈에 안 보이는 글자) — 이것만으로 10자를 채우는 빈 의견을 막으려고 길이 검사 전에 지운다.
_ZERO_WIDTH = str.maketrans("", "", "\u200b\u200c\u200d\ufeff")


class OpinionIn(BaseModel):
    kind: Literal["bug", "data", "suggest", "other"]
    message: str
    page_path: str | None = None
    interests: list[Literal["market", "presale", "tax", "other"]] | None = None
    website: str | None = None  # 숨김 칸 — 사람은 비워 두고 봇만 채운다

    @field_validator("message")
    @classmethod
    def _message_length(cls, v: str) -> str:
        # NUL 은 PostgreSQL text 에 못 들어간다(저장 순간 500) → 입력 단계에서 422.
        if "\x00" in v:
            raise ValueError("쓸 수 없는 글자가 들어 있어요")
        v = v.translate(_ZERO_WIDTH).strip()
        if not MESSAGE_MIN <= len(v) <= MESSAGE_MAX:
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
    ip = _get_client_ip(request)
    if _check_rate_limit_memory(f"opinion:{ip}", ANON_DAILY_LIMIT, 86400):
        raise HTTPException(status_code=429, detail=LIMIT_DETAIL)


@router.post("")
def submit_opinion(
    body: OpinionIn,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: dict | None = Depends(get_optional_user),
):
    """의견 저장. 숨김 칸이 채워져 있으면(봇) 저장 없이 받은 척만 한다."""
    if body.website and body.website.strip():
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
