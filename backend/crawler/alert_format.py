"""크롤링 장애 텔레그램 메시지 포맷 — 요약 헤더 + 핵심만 (HTML).

monitor.detect_issues 가 만든 구조화 data(dict) 를 텔레그램 HTML 메시지로 조립한다.
DB 세션 의존 없는 순수 함수 — dict in / str out.

메시지 = 헤더 한 줄 + 빈 줄 + 본문 + 행동 가이드. parse_mode="HTML" 로 발송.

⏰ **이 메시지에 찍히는 모든 시각은 KST 다** (세션 406). 사장님이 읽는 화면이라
UTC 를 그대로 내보내면 9시간 어긋난 시각을 보고 장애 시점을 오판한다 — 실제로
2026-09-14 알림(prod monitor_alerts 실측 2건)의 괄호 시각이 UTC 로 나가 "언제 난 장애인지" 혼동을
일으켰다. 시각을 새로 노출할 때는 반드시 `_kst_hhmm()`/`_kst_stamp()` 를 거칠 것
(직접 strftime 하거나 ISO 원문을 그대로 넣지 말 것).
"""

import html
import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from crawler.plain_words import (
    action_words_for_job_type,
    explain_error,
    job_words,
    plainify_detail,
    status_words,
)

# 이 레포 관습 — quota_db.KST·auth.permissions 등과 동일 (Asia/Seoul 고정).
# 서버 로컬 시간대에 의존하는 astimezone() 무인자 호출은 CI·컨테이너(UTC)에서
# 어긋나므로 쓰지 않는다(timezone-consistency 룰).
KST = ZoneInfo("Asia/Seoul")


def _kst_hhmm(now) -> str:
    """헤더 괄호 시각 — KST `HH:MM`. None 이면 빈 문자열.

    naive datetime 은 UTC 로 간주한다(monitor 는 utcnow() 로 aware 를 넘기지만,
    호출처가 늘어도 조용히 로컬 시간대로 해석되지 않게 고정한다).
    """
    if now is None:
        return ""
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    return now.astimezone(KST).strftime("%H:%M")


def _kst_stamp(value) -> str:
    """본문 시각 — ISO 문자열/datetime → KST `MM-DD HH:MM` (사람이 읽는 형태).

    monitor 가 넣는 값은 `row.oldest.isoformat()` 같은 ISO 문자열이라 그대로
    쓰면 `2026-09-14T03:20:00.008990+00:00` 처럼 길고 UTC 인 채로 나간다.
    파싱 실패 시에는 원문을 그대로 돌려준다 — 형식이 바뀌어도 알림 자체는
    깨지지 않아야 하기 때문(시각 표시보다 장애 통지가 우선).
    """
    if not value:
        return ""
    dt = value
    if isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value)
        except ValueError:
            return value
    if not isinstance(dt, datetime):
        return str(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(KST).strftime("%m-%d %H:%M")

# event → 헤더 이모지·문구
#
# ⚠ 헤더는 **사장님이 목록에서 가장 먼저(때로는 유일하게) 읽는 줄**이다.
#    세션 407 적대검증 HIGH-1: 본문에서 "크롤"을 전부 "가져오기"로 바꿔 놓고
#    헤더에는 `[내부모니터] 크롤링 장애 — N건 활성` 을 그대로 남겨, 같은 알림
#    안에서 앞뒤가 어긋났다. 접두어도 발신 모듈 이름(내부모니터)이 아니라
#    **뜻**으로 부른다.
_EVENT_HEADER = {
    "new": ("🔴", "자료 수집에 문제가 생겼어요"),
    "recur": ("🔴", "같은 문제가 또 생겼어요"),
    "ongoing": ("🔴", "문제가 계속되고 있어요"),
    "resolved": ("✅", "문제가 풀렸어요"),
}

# resolved 이벤트의 해소 사유(reason) → 헤더 이모지·문구.
# 여기 없는 값(recovered·미지정)은 _EVENT_HEADER["resolved"] 를 그대로 쓴다 — 하위호환.
_RESOLVED_HEADER = {
    "swept": ("⚠️", "알림 종료"),
    "unconfirmed": ("ℹ️", "알림 종료"),
}


def _esc(value) -> str:
    """텔레그램 HTML 안전 이스케이프 — None 은 빈 문자열."""
    return html.escape(str(value)) if value is not None else ""


def _admin_link(path: str) -> str:
    """FRONTEND_URL 있으면 절대 링크, 없으면 경로만.

    FRONTEND_URL 은 CORS 다중 origin 지원 위해 콤마 구분 다중값 가능 (main.py:119).
    텔레그램 알림 링크는 1개 URL 만 필요 → 비-localhost 운영 도메인을 우선 선택.
    """
    raw = os.getenv("FRONTEND_URL", "")
    candidates = [u.strip().rstrip("/") for u in raw.split(",") if u.strip()]
    if not candidates:
        # ⚠ 이 분기는 운영에서 도달하지 않는다 — 라이브 backend/.env 는 FRONTEND_URL 을
        #    3값으로 갖고 있고(localhost + 2u.pe.kr + www), 아래 non_local 선택이
        #    https://2u.pe.kr 을 고른다(세션 407 실측). 세션 407 적대검증이 "미설정이면
        #    텔레그램에서 /admin#freshness 가 링크가 아니라 봇 명령으로 렌더된다"고
        #    지적했으나 전제(미설정)가 운영과 달라 실무 영향 0 — 다음 세션이 같은 조사를
        #    반복하지 않도록 박아 둔다. dev/CI 에서만 경로가 그대로 나온다.
        return path
    # 구독자(공인중개사) 가 텔레그램에서 클릭 — localhost 는 무의미하므로 운영 도메인 우선.
    # 모두 localhost 면 어쩔 수 없이 그대로 (dev 환경).
    non_local = [u for u in candidates if "localhost" not in u and "127.0.0.1" not in u]
    base = (non_local or candidates)[0]
    return f"{base}{path}"


def _header(event: str, header_ctx: dict, reason: str = "") -> str:
    """헤더 한 줄: '[서버 알림] 🔴 자료 수집에 문제가 생겼어요 — 안 풀린 문제 N개 (HH:MM)'.

    [서버 알림] 접두어 = 3채널(healthcheck.yml 외부/본 모듈 내부/job_error_listener
    즉시) 문구 통일 작업의 일부. 서버가 통째로 죽으면 이 채널은 함께 침묵하므로
    ([내부모니터] 발화 = 서버가 살아서 DB까지 도달했다는 뜻), 사장님이 어느 감시가
    보낸 메시지인지 채널명만 보고 구분할 수 있게 함 (IMPROVEMENT_PLAN P0-0 보류 항목).

    resolved 이벤트는 reason 에 따라 헤더도 갈린다 — 본문이 "원인 미해결" 인데
    헤더만 "✅ 크롤링 복구" 면 서로 모순이라 사장님이 헤더만 보고 안심한다(세션 391).
    """
    emoji, label = _EVENT_HEADER.get(event, _EVENT_HEADER["new"])
    if event == "resolved":
        emoji, label = _RESOLVED_HEADER.get(reason, _EVENT_HEADER["resolved"])
    count = header_ctx.get("active_count", 0)
    now = header_ctx.get("now")
    hhmm = _kst_hhmm(now)
    return f"[서버 알림] {emoji} <b>{label}</b> — 안 풀린 문제 {count}개 ({hhmm})"


def _rate(processed, total) -> str:
    """처리율 문자열 — total 0/None 이면 건수를 안 세는 작업 (0 나눗셈 회피).

    옛 문구 "통계 없음" 은 사장님께 "처리한 양이 통계가 없다"로 읽혀 뜻이 안 통했다
    (세션 407 적대검증 HIGH-2). 실제 뜻은 "이 작업은 건수를 세지 않는 종류" 다.
    """
    if not total:
        return "건수를 세지 않는 작업이에요"
    return f"{processed or 0}/{total} ({round((processed or 0) / total * 100)}%)"


def _body_failed(data: dict) -> str:
    """작업 실패 본문."""
    job = _esc(job_words(data.get("job_type")))
    count = data.get("count", 1)
    extra = f" 외 {count - 1}건" if count > 1 else ""
    lines = [f"▸ <b>{job}</b> 작업이 실패했어요 ({count}건)"]
    lines.append(f"  까닭{extra}: {_esc(explain_error(data.get('error')))}")
    # 여기 processed/total 은 **실패한 회차가 아니라 마지막으로 completed 된 회차**의
    # 값이다(monitor `_job_stats` — 실패 행은 대개 0/0 이라 정보가 없어서). 옛 라벨
    # "이번에 처리한 양" 은 실패 알림에서 "이번 회차가 500/799 처리했다" 로 읽혀 거짓이
    # 됐다(2026-09-25 kapt_costs 12초 실패 알림에 500/799(63%) 표기 — 세션 417 후속).
    # 바로 아래 "마지막으로 잘 됐던 때" 와 짝이 맞게 부른다. "batch" 는 여전히 쓰지 않는다.
    lines.append(f"  마지막으로 잘 됐을 때 처리한 양: {_rate(data.get('processed'), data.get('total'))}")
    if data.get("last_completed_at"):
        lines.append(f"  마지막으로 잘 됐던 때: {_esc(_kst_stamp(data['last_completed_at']))}")
    return "\n".join(lines)


def _body_stale(data: dict) -> str:
    """작업 마비 본문."""
    job = _esc(job_words(data.get("job_type")))
    lines = [f"▸ <b>{job}</b> 작업이 멈춰 있어요 ({data.get('count', 1)}건)"]
    lines.append(f"  {data.get('stale_hours', 1)}시간 넘게 끝나지 않고 있어요")
    if data.get("started_at"):
        lines.append(f"  시작한 때: {_esc(_kst_stamp(data['started_at']))}")
    return "\n".join(lines)


def _body_failed_burst(data: dict) -> str:
    """실패 묶음(버스트) 본문 — 짧은 창에 실패가 몰린 경우 (세션 396).

    crawl_failed 와 달리 "일부는 성공했는데도 알린다" 는 점이 핵심이라, 첫 줄에
    묶음이라는 표식을 둔다 — 사장님이 crawl_failed 알림과 구분해서 읽어야 한다.
    """
    job = _esc(job_words(data.get("job_type")))
    window = data.get("window_min", 60)
    count = data.get("count", 0)
    lines = [f"🟠 <b>{job}</b> 작업이 짧은 사이에 여러 번 실패했어요 — {window}분 동안 {count}건"]
    targets = data.get("targets")
    if targets:
        lines.append(f"  실패한 대상 {targets}개")
    lines.append("  같은 회차의 다른 건은 성공해서 그냥 넘어갈 뻔했지만, 몰려서 실패해 알려드려요.")
    lines.append(f"  까닭: {_esc(explain_error(data.get('error')))}")
    return "\n".join(lines)


def _body_freshness(data: dict) -> str:
    """데이터 미축적 본문."""
    label = _esc(data.get("label"))
    status = _esc(status_words(data.get("status")))
    age = data.get("age_hours")
    age_str = f", {age}시간째" if age is not None else ""
    lines = [f"▸ <b>{label}</b> 자료가 새로 안 들어오고 있어요 ({status}{age_str})"]
    if data.get("spinning"):
        # ⚠ "(헛바퀴)" 를 괄호로 덧붙이던 것을 뺐다 — 앞 문장에서 이미 쉬운 말로
        #    설명했는데 뒤에 은어를 붙이면 마지막 인상이 어려운 말이 된다
        #    (세션 407 적대검증 HIGH-2).
        lines.append("  작업은 도는데 새로 저장된 게 하나도 없어요.")
    # 처리율·신규행 = PR #44 후 batch 합계 기준 (60분 윈도우 같은 scheduler_job_id 합산).
    # "마지막 작업 1건" 으로 오해하면 batch 32% 가 0/0 단지일 때 false alarm 추정 —
    # 그 "합계" 라는 뜻은 그대로 두고 말만 우리말로 옮긴다("batch" 는 사장님이 모르는 말).
    lines.append(f"  이번에 처리한 양: {_rate(data.get('processed'), data.get('total'))}")
    if data.get("new_rows") is not None:
        lines.append(f"  이번에 새로 쌓인 건수: {data['new_rows']}")
    return "\n".join(lines)


def _action(kind: str, data: dict) -> str:
    """행동 가이드 한 줄 — 사장님이 실제로 할 수 있는 것만 (세션 407).

    옛 문구는 "크롤링 로그 확인 — 네이버 응답·서버 상태 점검" 처럼 **개발자가 할 일**을
    적어 두어, 알림을 읽은 사장님이 할 수 있는 게 없었다. 문구는 plain_words 가 갖고
    있고(한 곳에서 관리), 여기서는 freshness 만 화면 링크를 덧붙인다 —
    "신선도" 라는 말은 빼고 무엇을 보는 화면인지로 부른다.
    """
    # ⚠ 결제·정산 잡은 "자료가 안 들어온다"가 아니라 **돈이 안 걷힌다**는 뜻이라
    #   crawl_failed 안내를 그대로 쓰면 심각도를 정반대로 알린다. 이 경로(monitor →
    #   alert_format)가 결제 실패 알림의 **주 발화 경로**다 — 세션 408 적대검증이
    #   "리스너만 고치고 여기를 안 고쳐 실제로는 그대로 나간다"고 지적해 함께 고쳤다.
    #   렌더 실측(수정 전): "구독료 자동 결제 작업이 실패했어요 … 새 자료만 안 들어와요".
    base = action_words_for_job_type(kind, data.get("job_type"))
    if kind == "freshness":
        link = _esc(_admin_link(data.get("link_path", "/admin#freshness")))
        return f"{base}\n  (자료가 언제 들어왔는지 보는 화면: {link})"
    return base


_BODY_BUILDERS = {
    "crawl_failed": _body_failed,
    "crawl_failed_burst": _body_failed_burst,
    "crawl_stale": _body_stale,
    "freshness": _body_freshness,
}


def _resolved_line(detail: str, data: dict) -> str:
    """해소 알림 본문 한 줄 — 사유(reason)별 문구·이모지 분기.

    "알림 조건이 사라졌다" 를 전부 "✅ 정상으로 돌아왔습니다" 로 내보내던 것이
    가짜 복구 통지의 원인이었다(세션 391 §5-C). monitor._resolution_reason 이
    붙여주는 reason 으로 세 가지를 구분한다. reason 이 없으면(옛 호출·수동 호출)
    기존 문구 그대로 — 하위호환.
    """
    # detail 은 monitor_alerts 에 **저장돼 있던 옛 문장**일 수 있다(장애 발생 시점에
    # 저장 → 해소 시점에 재발송). 세션 407 이전 형식은 영문 job_type + 개발자 에러
    # 원문이라 그대로 내보내면 "새 알림은 우리말인데 복구 알림만 영문" 이 된다.
    # 사장님 결정(2026-09-15): 저장된 값은 건드리지 않고 **보낼 때** 우리말로 바꾼다
    # — DB 무변경이라 되돌리기가 안전하고, 옛 22건도 전부 우리말로 나간다.
    detail = plainify_detail(detail)
    reason = data.get("reason")
    if reason == "swept":
        return (
            f"⚠️ {detail} — 멈춘 작업을 강제 정리해 알림을 종료합니다 "
            "— 원인은 미해결, 다음 실행을 지켜보세요."
        )
    if reason == "unconfirmed":
        tail = _esc(data.get("reason_detail") or "")
        suffix = f" {tail}" if tail else ""
        return (
            f"ℹ️ {detail} — 알림 조건이 해소됐지만 성공 실행은 확인되지 않았습니다.{suffix}"
        )
    if reason == "recovered":
        return f"✅ {detail} — 정상으로 돌아왔습니다 (최근 실행 성공 확인)."
    return f"▸ {detail} — 정상으로 돌아왔습니다."


def format_resolved_batch(items: list[dict], *, header_ctx: dict) -> str:
    """해소 알림 N건 → 텔레그램 HTML 메시지 1통 (세션 393 §5-J ④).

    items: [{"detail": str, "reason": str, "reason_detail": str}, ...]

    DB 장애 복구 직후처럼 여러 알림이 한 스캔에 동시 해소되면 건당 1통씩 나가
    사장님 폰에 알림 폭탄이 됐다(세션 381 실사고 배경). 2건 이상이면 이 함수로
    묶는다 — 1건일 때는 호출부가 기존 format_issue_message 를 그대로 쓰므로
    단건 문구는 변하지 않는다.

    헤더: 전부 recovered(또는 사유 미지정)면 "✅ 크롤링 복구", 하나라도
    swept·unconfirmed 가 섞이면 "⚠️ 알림 종료" — 한 건이라도 원인 미해결이면
    헤더가 "복구" 라고 말해선 안 된다(헤더·본문 모순 방지, _header 와 같은 결).
    본문은 항목마다 기존 _resolved_line 한 줄 (각 줄이 ✅/⚠️/ℹ️ 를 자체 표기).
    """
    reasons = {str(item.get("reason") or "") for item in items}
    mixed = bool(reasons - {"", "recovered"})
    emoji, label = ("⚠️", "알림 종료") if mixed else _EVENT_HEADER["resolved"]

    count = header_ctx.get("active_count", 0)
    now = header_ctx.get("now")
    hhmm = _kst_hhmm(now)
    header = (
        # ⚠ 헤더 문구가 _header() 와 **글자 단위로 같아야** 한다 — 이 줄은 별도 리터럴이라
        #    세션 407 에 _header() 만 고쳤을 때 묶음 알림만 옛 문구(`[내부모니터] … N건 활성`)로
        #    남았다. 한쪽만 고치면 사장님 폰에 두 말투가 섞인다.
        f"[서버 알림] {emoji} <b>{label}</b> — 안 풀린 문제 {count}개 ({hhmm})"
        f" — 해소 {len(items)}건"
    )

    lines = [_resolved_line(_esc(item.get("detail") or ""), item) for item in items]
    return f"{header}\n\n" + "\n".join(lines)


def format_issue_message(kind: str, data: dict, *, event: str, header_ctx: dict) -> str:
    """장애 1건 → 텔레그램 HTML 메시지.

    kind: "crawl_failed" | "crawl_failed_burst" | "crawl_stale" | "freshness"
    event: "new" | "recur" | "ongoing" | "resolved"
    header_ctx: {"active_count": int, "now": datetime}
    resolved 이벤트는 data 에 reason("recovered"|"swept"|"unconfirmed")·reason_detail 을
    선택적으로 받아 문구를 가른다 (미지정 시 기존 문구 유지).
    """
    if event == "resolved":
        # 복구 알림 — 구조화 data 없음, 최소 정보만.
        # 헤더·본문 모두 reason 으로 갈려야 서로 모순이 없다.
        header = _header(event, header_ctx, reason=str(data.get("reason") or ""))
        detail = _esc(data.get("detail") or data.get("alert_key"))
        return f"{header}\n\n{_resolved_line(detail, data)}"

    header = _header(event, header_ctx)

    builder = _BODY_BUILDERS.get(kind)
    body = builder(data) if builder else f"▸ {_esc(data.get('detail'))}"
    return f"{header}\n\n{body}\n{_action(kind, data)}"
