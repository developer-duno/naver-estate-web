"""손님 "의견 보내기" 라우트 — 누구나 보내고, 공개된 답만 누구나 본다 (세션 433).

- POST /api/opinions          의견 저장 + 사장님 텔레그램(BackgroundTasks — 요청을 안 붙잡음)
- GET  /api/opinions/public   "고쳤습니다" 공개 목록 — 공개 제목·답만(원문·이메일·화면 주소 없음)
- POST /api/opinions/error    손님 화면 오류 자동 기록(세션 439) — 같은 오류는 한 행에 횟수만 올리고,
                              처음 보는 오류만 텔레그램 1통. 이메일·회원 번호는 저장하지 않는다.

관리자 쪽(목록·답장·공개·삭제)은 routers/admin/opinions.py.

하루 한도(사장님 결정 2026-10-06, 전부 한국 자정에 풀림):
  - 비로그인 = IP 묶음당 3건(IPv6 는 앞 64비트로 묶음) + 비로그인 전체 200건(메모리 카운터, 재시작하면 0)
  - 로그인 = 10건(auth.permissions.check_quota)
답장 메일은 로그인한 분만(가입 이메일) — 만료 토큰은 get_optional_user 가 None 으로 돌려 비로그인과 같게 다룬다.

오류 기록 창구의 하루 한도(손님 의견 한도와 따로 센다): IP 묶음당 20건 · 전체 500건 · 넘으면 조용히 버리고 204.
"""

import hashlib
import ipaddress
import logging
import threading
from datetime import datetime
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field, PrivateAttr, field_validator, model_validator
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from auth.permissions import check_quota
from auth.rate_limiter import _get_client_ip
from db.models import SiteOpinion
from deps import get_db, get_optional_user
from services.opinion_alert import notify_new_error, notify_new_opinion
from utils import utcnow

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
ERROR_IP_DAILY_LIMIT = 20
ERROR_TOTAL_DAILY_LIMIT = 500
ERROR_NAME_MAX = 100
ERROR_LINE_MAX = 300
ERROR_DIGEST_MAX = 100
# 요청 본문이 이보다 깊게 겹쳐 있으면 422 — 우리 본문은 2겹(사전 → 목록)이 전부다.
# 깊은 본문을 그대로 두면 재귀 처리(우리 훑기·검사 실패 응답의 입력 되돌려 주기)가 RecursionError 로 500 이 된다.
MAX_BODY_DEPTH = 20

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
# 오류 기록 창구 하루 카운터 — 손님 의견 한도와 따로 센다(오류 보고가 손님 의견 칸을 깎지 않게).
_err_day: str | None = None
_err_by_ip: dict[str, int] = {}
_err_total = 0
_err_cap_logged: set[str] = set()  # 그날 이미 "한도 도달" 을 한 줄 남긴 종류(전체·IP묶음)


def _now() -> datetime:
    """지금 시각(한국). 시험에서 이 함수를 바꿔 자정 전후를 고정한다."""
    return datetime.now(KST)


def _reset_anon_counters_for_tests() -> None:
    """시험 사이 카운터 초기화(모듈 메모리라 시험끼리 섞이지 않게)."""
    global _anon_day, _anon_total, _err_day, _err_total
    with _anon_lock:
        _anon_day = None
        _anon_by_ip.clear()
        _anon_total = 0
        _err_day = None
        _err_by_ip.clear()
        _err_total = 0
        _err_cap_logged.clear()


def _today_kst() -> str:
    return _now().astimezone(KST).date().isoformat()


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


def _take_anon_slot(bucket: str, day: str | None = None) -> str | None:
    """비로그인 한 건 받기 — 받으면 None, 막히면 429 문구.

    개인 한도에 막힌 요청은 전체 칸을 먹지 않고, 전체 상한에 막힌 요청은 개인 칸을 먹지 않는다.
    """
    global _anon_day, _anon_total
    day = day or _today_kst()
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


def _release_anon_slot(bucket: str, day: str) -> None:
    """저장에 실패한 비로그인 한 건을 되돌린다 — 손님은 저장 안 된 글 때문에 한도를 잃지 않는다.

    그 사이 한국 날짜가 바뀌었으면(카운터가 이미 비워짐) 아무것도 안 한다.
    """
    global _anon_total
    with _anon_lock:
        if _anon_day != day:
            return
        left = _anon_by_ip.get(bucket, 0) - 1
        if left > 0:
            _anon_by_ip[bucket] = left
        else:
            _anon_by_ip.pop(bucket, None)
        _anon_total = max(0, _anon_total - 1)


def _take_error_slot(bucket: str) -> bool:
    """오류 기록 한 건 받기 — 받으면 True, 하루 한도(IP 묶음 20 · 전체 500)를 넘으면 False.

    한도에 처음 닿은 순간 종류(전체·IP묶음)마다 그날 한 번만 INFO 한 줄(IP·건수 원문 없이).
    """
    global _err_day, _err_total
    day = _today_kst()
    with _anon_lock:
        if _err_day != day:
            _err_day = day
            _err_by_ip.clear()
            _err_total = 0
            _err_cap_logged.clear()
        reason = None
        if _err_total >= ERROR_TOTAL_DAILY_LIMIT:
            reason = "전체"
        elif _err_by_ip.get(bucket, 0) >= ERROR_IP_DAILY_LIMIT:
            reason = "IP묶음"
        if reason:
            first = reason not in _err_cap_logged
            _err_cap_logged.add(reason)
        else:
            _err_by_ip[bucket] = _err_by_ip.get(bucket, 0) + 1
            _err_total += 1
    if reason:
        if first:
            logger.info("오류 창구 하루 한도 도달(%s)", reason)
        return False
    return True


def _has_lone_surrogate(text: str) -> bool:
    """짝 없는 서로게이트(U+D800~U+DFFF)가 있나 — 짝이 맞는 이모지는 이미 한 글자로 합쳐져 들어온다."""
    return any(0xD800 <= ord(c) <= 0xDFFF for c in text)


def _replace_lone_surrogates(text: str) -> str:
    return "".join(_REPLACEMENT_CHAR if 0xD800 <= ord(c) <= 0xDFFF else c for c in text)


def _scrub_lone_surrogates(value):
    """요청 본문 전체(문자열·목록·사전 — 칸 이름 포함)를 훑어 짝 없는 서로게이트를 대체 글자로.

    돌려주는 값 = (바꾼 본문, 하나라도 있었나). 본문 자체가 문자열 하나여도 바꾼다 —
    그대로 두면 검사 실패 응답(422)이 입력을 되돌려 주다가 UTF-8 변환에서 500 이 난다.
    재귀가 아니라 반복문(스택)으로 훑는다 — 재귀면 ~1000겹 본문에서 RecursionError(500).
    MAX_BODY_DEPTH 겹을 넘으면 (None, True) 를 돌려준다 — 검사기가 None 을 받아 422 를 내고,
    그 422 응답이 되돌려 주는 입력도 None 이라 깊은 본문을 다시 재귀로 훑지 않는다.
    입력 본문은 고치지 않고 새 목록·사전을 만든다.
    """
    bad = False
    holder = [value]
    stack = [(holder, 0, 0)]  # (담은 곳, 자리, 깊이)
    while stack:
        parent, slot, depth = stack.pop()
        item = parent[slot]
        if isinstance(item, str):
            if _has_lone_surrogate(item):
                parent[slot] = _replace_lone_surrogates(item)
                bad = True
            continue
        if not isinstance(item, (list, dict)):
            continue
        if depth >= MAX_BODY_DEPTH:
            return None, True
        if isinstance(item, list):
            copy_list = list(item)
            parent[slot] = copy_list
            stack.extend((copy_list, i, depth + 1) for i in range(len(copy_list)))
        else:
            copy_dict = {}
            for key, child in item.items():
                if isinstance(key, str) and _has_lone_surrogate(key):
                    key = _replace_lone_surrogates(key)
                    bad = True
                copy_dict[key] = child
            parent[slot] = copy_dict
            stack.extend((copy_dict, k, depth + 1) for k in copy_dict)
    return holder[0], bad


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
        본문 전체(칸 이름·여러 겹 목록/사전·본문이 문자열 하나인 경우까지)를 _scrub_lone_surrogates 로 훑는다.
        """
        data, bad = _scrub_lone_surrogates(data)
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


def _enforce_daily_limit(db: Session, request: Request, user: dict | None) -> tuple[str, str] | None:
    """하루 한도 확인. 비로그인이면 쓴 칸(IP 묶음, 한국 날짜)을 돌려준다 — 저장이 실패하면 되돌리려고.

    로그인 한도(check_quota)는 DB 카운터를 같은 세션에 더하기만 하고 commit 은 의견 저장과 한 번에
    하므로, 저장이 실패하면 카운터도 함께 취소된다(되돌릴 것이 없다).
    """
    if user:
        try:
            check_quota(db, user["user_id"], "opinion", USER_DAILY_LIMIT)
        except HTTPException as e:
            if e.status_code == 429:
                raise HTTPException(status_code=429, detail=LIMIT_DETAIL) from e
            raise
        return None
    bucket = ip_bucket(_get_client_ip(request))
    day = _today_kst()
    detail = _take_anon_slot(bucket, day)
    if detail:
        raise HTTPException(status_code=429, detail=detail)
    return bucket, day


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

    anon_slot = _enforce_daily_limit(db, request, user)

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
    try:
        db.add(row)
        db.commit()
    except Exception:
        db.rollback()
        if anon_slot:
            _release_anon_slot(*anon_slot)
        raise
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


# ══ 손님 화면 오류 자동 기록 (세션 439, V070) ══


class ErrorReportIn(BaseModel):
    """손님 화면이 오류를 만났을 때 보내는 기록 — 로그인 불필요, 이메일·회원 번호는 받지도 저장하지도 않는다.

    길이 상한(Field max_length)은 터무니없이 큰 본문만 막는 바깥 울타리이고, 저장 길이는
    서버가 자른다(이름 100 · 오류 첫 줄 300 · 오류 번호 100) — 긴 오류 글 때문에 기록을 놓치지 않게.
    """

    area: str | None = Field(None, max_length=2000)  # 오류가 난 화면 경로
    name: str = Field("", max_length=2000)  # 오류 이름(TypeError 등)
    message: str = Field("", max_length=5000)  # 오류 글 — 첫 줄만 쓴다
    digest: str | None = Field(None, max_length=2000)  # 화면 묶음이 붙이는 오류 번호(선택)

    @model_validator(mode="wrap")
    @classmethod
    def _scrub(cls, data, handler):
        """짝 없는 서로게이트는 대체 글자로 바꿔 그대로 받는다(오류 기록은 422 로 버릴 이유가 없다)."""
        data, _ = _scrub_lone_surrogates(data)
        return handler(data)


def _one_line(text: str | None, limit: int) -> str:
    """첫 줄만, NUL 제거, 앞뒤 공백 제거, limit 자로 자름."""
    if not text:
        return ""
    lines = text.replace("\x00", "").strip().splitlines()
    return (lines[0].strip() if lines else "")[:limit]


def error_fingerprint(page_path: str | None, name: str, first_line: str, digest: str = "") -> str:
    """오류 지문 = sha256(화면 첫 경로 조각 + 오류 이름 + 오류 첫 줄 [+ 오류 번호]) 앞 32자.

    첫 경로 조각만 쓰는 이유: /complex/123 과 /complex/456 의 같은 오류는 같은 고장이다(단지 번호마다
    행이 생기면 횟수를 못 센다). 경로가 없으면 빈 조각.
    오류 번호(digest)가 있으면 재료에 넣는다 — 운영 Next.js 는 서버 쪽 오류 문구를 일반 문장 하나로
    바꿔 보내고 번호로만 구분하므로, 번호를 빼면 서로 다른 고장이 한 행에 섞인다.
    번호가 없으면 재료가 예전과 같다(이미 저장된 지문 값 그대로).
    """
    segment = ""
    if page_path:
        segment = "/" + page_path.split("/", 2)[1]
    raw = f"{segment}\n{name}\n{first_line}"
    if digest:
        raw += f"\n{digest}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def _upsert_error_row(db: Session, values: dict) -> bool:
    """같은 지문이면 횟수 +1·마지막 시각만, 없으면 새 행. 새 행이 생겼으면 True.

    동시 요청에도 행이 하나로 모이게 DB 의 INSERT … ON CONFLICT (fingerprint) WHERE kind='error'
    (V070 부분 유일 색인)로 한 문장에 처리한다. SQLite 시험도 같은 문법을 지원해 같은 길을 탄다.
    새 행 판정 = 돌려받은 repeat_count 가 1(갱신이면 2 이상).
    """
    if db.get_bind().dialect.name == "sqlite":
        from sqlalchemy.dialects.sqlite import insert as db_insert
    else:
        from sqlalchemy.dialects.postgresql import insert as db_insert

    stmt = db_insert(SiteOpinion).values(**values)
    stmt = stmt.on_conflict_do_update(
        index_elements=[SiteOpinion.fingerprint],
        # 글자 그대로 — 바인딩 인자(%(kind_1)s)로 나가면 드라이버에 따라 부분 색인 짝 맞추기가 어긋날 수 있다.
        index_where=text("kind = 'error'"),
        set_={
            "repeat_count": SiteOpinion.repeat_count + 1,
            "last_seen_at": stmt.excluded.last_seen_at,
            "updated_at": stmt.excluded.updated_at,
        },
    ).returning(SiteOpinion.repeat_count)
    return db.execute(stmt).scalar_one() == 1


@router.post("/error", status_code=204)
def report_client_error(
    body: ErrorReportIn,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """손님 화면 오류 기록. 응답은 늘 204(본문 없음) — 손님 화면에 아무것도 다시 띄우지 않는다.

    - 하루 한도(IP 묶음 20 · 전체 500)를 넘으면 저장 없이 조용히 204.
    - 손님 의견 하루 한도(3/10)는 깎지 않는다(카운터가 따로다).
    - 처음 보는 지문으로 행이 새로 생겼을 때만 텔레그램 1통(새 의견 알림과 시간당 상한 공유).
    - 로그인 토큰이 와도 읽지 않는다 — 이메일·회원 번호 저장 0.
    """
    if not _take_error_slot(ip_bucket(_get_client_ip(request))):
        return Response(status_code=204)

    page_path = clean_page_path(_one_line(body.area, PAGE_PATH_MAX + 1) or None)
    name = _one_line(body.name, ERROR_NAME_MAX)
    first_line = _one_line(body.message, ERROR_LINE_MAX)
    digest = _one_line(body.digest, ERROR_DIGEST_MAX)

    shown = f"{name}: {first_line}" if name and first_line else (name or first_line or "(내용 없음)")
    stored = f"{shown}\n(오류 번호 {digest})" if digest else shown
    now = utcnow()
    is_new = _upsert_error_row(db, {
        "kind": "error",
        "message": stored,
        "page_path": page_path,
        "user_agent": (request.headers.get("user-agent") or "")[:USER_AGENT_MAX] or None,
        "fingerprint": error_fingerprint(page_path, name, first_line, digest),
        "repeat_count": 1,
        "last_seen_at": now,
        "created_at": now,
        "updated_at": now,
    })
    db.commit()

    if is_new:
        background_tasks.add_task(notify_new_error, page_path=page_path, error_line=shown)
    return Response(status_code=204)
