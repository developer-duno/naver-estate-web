"""관리자 의견함 — 목록·답장(메일 1회)·공개 전환·다시 보내기·삭제 (세션 433).

손님 쪽은 routers/opinions.py. 답장 메일은 **reply_mail_sent=false 이고 가입 이메일이 있을 때만
한 번** 나간다 — 답을 고쳐도 자동 재발송은 없고, 필요하면 "다시 보내기"(resend-mail)로 보낸다.
메일이 실패하면 reply_mail_sent 가 false 로 남아 화면에 표시된다.
1년 정리로 원문(message)이 NULL 인 공개 행도 그대로 다룬다.

손님 화면 오류 자동 기록(kind='error', 세션 439 V070)도 같은 목록에 뜬다 — 사람이 쓴 의견이 아니므로
'새 의견 수'(new_count)에서 빼고, 공개("고쳤습니다" 목록)로 돌릴 수 없다(400).
oldest_days = 아직 개인정보(원문·이메일)가 남은 행 중 가장 오래된 것의 경과 일수(한국 날짜) —
매일 03:50 정리 잡이 멈추면 이 값이 366 을 넘어 계속 커진다.
"""

import logging
from datetime import datetime, timezone
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from auth.audit import log_action
from db.models import SiteOpinion
from deps import get_admin_user, get_db
from utils import utcnow

from ._shared import router

logger = logging.getLogger(__name__)

ADMIN_PAGE_SIZE = 20
OpinionStatus = Literal["new", "replied", "fixed", "closed"]
OpinionKind = Literal["bug", "data", "suggest", "other", "error"]
KST = ZoneInfo("Asia/Seoul")
ERROR_PUBLISH_DETAIL = "자동 오류 기록은 공개할 수 없어요"


def _iso(dt):
    return dt.isoformat() if dt else None


def _row_dict(r: SiteOpinion) -> dict:
    return {
        "id": r.id,
        "kind": r.kind,
        "message": r.message,
        "page_path": r.page_path,
        "interests": r.interests,
        "user_id": r.user_id,
        "user_email": r.user_email,
        "user_agent": r.user_agent,
        "status": r.status,
        "reply": r.reply,
        "replied_at": _iso(r.replied_at),
        "reply_mail_sent": r.reply_mail_sent,
        "is_public": r.is_public,
        "public_title": r.public_title,
        "public_answer": r.public_answer,
        "published_at": _iso(r.published_at),
        "created_at": _iso(r.created_at),
        "updated_at": _iso(r.updated_at),
        "repeat_count": r.repeat_count,
        "last_seen_at": _iso(r.last_seen_at),
        "fingerprint": r.fingerprint,
    }


def _oldest_days(db: Session, now: datetime | None = None) -> int | None:
    """개인정보(원문·이메일)가 아직 남은 행 중 가장 오래된 것이 며칠째인지(한국 날짜 차). 없으면 None."""
    oldest = db.scalar(
        select(func.min(SiteOpinion.created_at)).where(
            or_(SiteOpinion.message.isnot(None), SiteOpinion.user_email.isnot(None))
        )
    )
    if oldest is None:
        return None
    if oldest.tzinfo is None:  # SQLite 는 시각대 없이 돌려준다 — 저장은 UTC
        oldest = oldest.replace(tzinfo=timezone.utc)
    today = (now or datetime.now(KST)).astimezone(KST).date()
    return (today - oldest.astimezone(KST).date()).days


def _get_or_404(db: Session, opinion_id: int) -> SiteOpinion:
    row = db.get(SiteOpinion, opinion_id)
    if not row:
        raise HTTPException(status_code=404, detail="의견을 찾을 수 없습니다")
    return row


def _send_reply_mail(row: SiteOpinion) -> bool:
    from services.email import OPINION_REPLY_SENDER_NAME, build_opinion_reply_email, send_email

    subject, html = build_opinion_reply_email(row.user_email, row.message, row.reply)
    return send_email(row.user_email, subject, html, sender_name=OPINION_REPLY_SENDER_NAME)


def _clean(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    return v or None


@router.get("/opinions")
def list_opinions(
    status: OpinionStatus | None = None,
    kind: OpinionKind | None = None,
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """의견 전체(원문·이메일 포함) + 아직 안 본 의견 수(new_count, 오류 자동 기록 제외) + oldest_days."""
    cond = [SiteOpinion.status == status] if status else []
    if kind:
        cond.append(SiteOpinion.kind == kind)
    total = db.scalar(select(func.count()).select_from(SiteOpinion).where(*cond)) or 0
    rows = db.scalars(
        select(SiteOpinion)
        .where(*cond)
        .order_by(SiteOpinion.created_at.desc(), SiteOpinion.id.desc())
        .offset((page - 1) * ADMIN_PAGE_SIZE)
        .limit(ADMIN_PAGE_SIZE)
    ).all()
    new_count = db.scalar(
        select(func.count()).select_from(SiteOpinion).where(
            SiteOpinion.status == "new", SiteOpinion.kind != "error"
        )
    ) or 0
    return {
        "items": [_row_dict(r) for r in rows],
        "total": total,
        "page": page,
        "new_count": new_count,
        "oldest_days": _oldest_days(db),
    }


class OpinionUpdate(BaseModel):
    status: OpinionStatus | None = None
    reply: str | None = Field(None, max_length=5000)
    is_public: bool | None = None
    public_title: str | None = Field(None, max_length=200)
    public_answer: str | None = Field(None, max_length=5000)


@router.patch("/opinions/{opinion_id}")
def update_opinion(
    opinion_id: int,
    body: OpinionUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """상태·답장·공개 전환. 답장 메일은 처음 한 번만(reply_mail_sent=false·이메일 있음)."""
    row = _get_or_404(db, opinion_id)
    sent_fields = body.model_fields_set
    if body.is_public and row.kind == "error":
        raise HTTPException(status_code=400, detail=ERROR_PUBLISH_DETAIL)

    # 바꾼 뒤 모습을 먼저 계산해 검사한다 — 검사 전에 행을 고치면 422 뒤에도 세션에 흔적이 남는다.
    new_title = _clean(body.public_title) if "public_title" in sent_fields else row.public_title
    new_answer = _clean(body.public_answer) if "public_answer" in sent_fields else row.public_answer
    new_public = body.is_public if body.is_public is not None else row.is_public
    if new_public and not (new_title and new_answer):
        raise HTTPException(status_code=422, detail="공개하려면 공개 제목과 공개 답을 모두 써 주세요")

    now = utcnow()
    reply_written = False
    if "reply" in sent_fields:
        row.reply = _clean(body.reply)
        if row.reply:
            row.replied_at = now
            reply_written = True
    if body.status is not None:
        row.status = body.status
    elif reply_written and row.status == "new":
        # 답만 쓰고 상태를 안 바꾸면 '새 의견' 수에 계속 남는다 → 처음 답한 새 의견은 '답함'으로.
        row.status = "replied"
    row.public_title = new_title
    row.public_answer = new_answer
    if new_public and not row.is_public:
        row.published_at = now
    elif not new_public:
        row.published_at = None
    row.is_public = new_public
    row.updated_at = now
    db.commit()

    mail_sent = False
    if reply_written and not row.reply_mail_sent and row.user_email:
        mail_sent = _send_reply_mail(row)
        if mail_sent:
            row.reply_mail_sent = True

    log_action(
        db, admin["user_id"], "admin_opinion_update", "site_opinion", str(opinion_id),
        details={"fields": sorted(sent_fields), "mail_sent": mail_sent},
    )
    db.commit()
    db.refresh(row)
    return {**_row_dict(row), "mail_sent": mail_sent}


@router.post("/opinions/{opinion_id}/resend-mail")
def resend_opinion_mail(
    opinion_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """답장 메일 다시 보내기(실패분·답을 고친 뒤). 답이나 가입 이메일이 없으면 {sent: false}."""
    row = _get_or_404(db, opinion_id)
    sent = False
    if row.reply and row.user_email:
        sent = _send_reply_mail(row)
        if sent:
            row.reply_mail_sent = True
            row.updated_at = utcnow()
    log_action(
        db, admin["user_id"], "admin_opinion_resend_mail", "site_opinion", str(opinion_id),
        details={"sent": sent},
    )
    db.commit()
    return {"sent": sent}


@router.delete("/opinions/{opinion_id}")
def delete_opinion(
    opinion_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """손님 삭제 요청 처리 — 행을 지운다(되돌릴 수 없음)."""
    row = _get_or_404(db, opinion_id)
    db.delete(row)
    log_action(db, admin["user_id"], "admin_opinion_delete", "site_opinion", str(opinion_id))
    db.commit()
    return {"deleted": True}
