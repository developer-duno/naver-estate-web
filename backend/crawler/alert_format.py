"""크롤링 장애 텔레그램 메시지 포맷 — 요약 헤더 + 핵심만 (HTML).

monitor.detect_issues 가 만든 구조화 data(dict) 를 텔레그램 HTML 메시지로 조립한다.
DB 세션 의존 없는 순수 함수 — dict in / str out.

메시지 = 헤더 한 줄 + 빈 줄 + 본문 + 행동 가이드. parse_mode="HTML" 로 발송.
"""

import html
import os

# event → 헤더 이모지·문구
_EVENT_HEADER = {
    "new": ("🔴", "크롤링 장애"),
    "recur": ("🔴", "크롤링 장애 재발"),
    "ongoing": ("🔴", "크롤링 장애 지속"),
    "resolved": ("✅", "크롤링 복구"),
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
        return path
    # 구독자(공인중개사) 가 텔레그램에서 클릭 — localhost 는 무의미하므로 운영 도메인 우선.
    # 모두 localhost 면 어쩔 수 없이 그대로 (dev 환경).
    non_local = [u for u in candidates if "localhost" not in u and "127.0.0.1" not in u]
    base = (non_local or candidates)[0]
    return f"{base}{path}"


def _header(event: str, header_ctx: dict, reason: str = "") -> str:
    """헤더 한 줄: '[내부모니터] 🔴 크롤링 장애 — N건 활성 (HH:MM)'.

    [내부모니터] 접두어 = 3채널(healthcheck.yml 외부/본 모듈 내부/job_error_listener
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
    hhmm = now.strftime("%H:%M") if now is not None else ""
    return f"[내부모니터] {emoji} <b>{label}</b> — {count}건 활성 ({hhmm})"


def _rate(processed, total) -> str:
    """처리율 문자열 — total 0/None 이면 '통계 없음' (0 나눗셈 회피)."""
    if not total:
        return "통계 없음"
    return f"{processed or 0}/{total} ({round((processed or 0) / total * 100)}%)"


def _body_failed(data: dict) -> str:
    """작업 실패 본문."""
    job = _esc(data.get("job_type"))
    count = data.get("count", 1)
    extra = f" 외 {count - 1}건" if count > 1 else ""
    lines = [f"▸ <b>{job}</b> 작업 실패 ({count}건)"]
    lines.append(f"  대표 에러{extra}: {_esc(data.get('error'))[:200]}")
    # 처리율 = PR #44 후 batch 합계 (같은 scheduler_job_id 의 60분 윈도우 합산).
    # 1개 단지 잡이 아니라 batch 통째라는 점을 명시해 오해 차단.
    lines.append(f"  batch 합계 처리율: {_rate(data.get('processed'), data.get('total'))}")
    if data.get("last_completed_at"):
        lines.append(f"  마지막 완료: {_esc(data['last_completed_at'])}")
    return "\n".join(lines)


def _body_stale(data: dict) -> str:
    """작업 마비 본문."""
    job = _esc(data.get("job_type"))
    lines = [f"▸ <b>{job}</b> 작업 마비 ({data.get('count', 1)}건)"]
    lines.append(f"  {data.get('stale_hours', 1)}시간 넘게 running 상태")
    if data.get("started_at"):
        lines.append(f"  시작: {_esc(data['started_at'])}")
    return "\n".join(lines)


def _body_freshness(data: dict) -> str:
    """데이터 미축적 본문."""
    label = _esc(data.get("label"))
    status = _esc(data.get("status"))
    age = data.get("age_hours")
    age_str = f", {age}h" if age is not None else ""
    lines = [f"▸ <b>{label}</b> 데이터 미축적 ({status}{age_str})"]
    if data.get("spinning"):
        lines.append("  헛바퀴: 작업은 도는데 신규행 0")
    # 처리율·신규행 = PR #44 후 batch 합계 기준 (60분 윈도우 같은 scheduler_job_id 합산).
    # "마지막 작업 1건" 으로 오해하면 batch 32% 가 0/0 단지일 때 false alarm 추정.
    lines.append(f"  batch 합계 처리율: {_rate(data.get('processed'), data.get('total'))}")
    if data.get("new_rows") is not None:
        lines.append(f"  batch 시작 후 신규행: {data['new_rows']}")
    return "\n".join(lines)


def _action(kind: str, data: dict) -> str:
    """행동 가이드 한 줄."""
    if kind == "freshness":
        link = _esc(_admin_link(data.get("link_path", "/admin#freshness")))
        return f"→ {link} 데이터 신선도 확인"
    if kind == "crawl_stale":
        return "→ 마비 작업 확인 — 서버·스케줄러 재시작 검토"
    return "→ 크롤링 로그 확인 — 네이버 응답·서버 상태 점검"


_BODY_BUILDERS = {
    "crawl_failed": _body_failed,
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


def format_issue_message(kind: str, data: dict, *, event: str, header_ctx: dict) -> str:
    """장애 1건 → 텔레그램 HTML 메시지.

    kind: "crawl_failed" | "crawl_stale" | "freshness"
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
