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


def _esc(value) -> str:
    """텔레그램 HTML 안전 이스케이프 — None 은 빈 문자열."""
    return html.escape(str(value)) if value is not None else ""


def _admin_link(path: str) -> str:
    """FRONTEND_URL 있으면 절대 링크, 없으면 경로만."""
    base = os.getenv("FRONTEND_URL", "").rstrip("/")
    return f"{base}{path}" if base else path


def _header(event: str, header_ctx: dict) -> str:
    """헤더 한 줄: '🔴 크롤링 장애 — N건 활성 (HH:MM)'."""
    emoji, label = _EVENT_HEADER.get(event, _EVENT_HEADER["new"])
    count = header_ctx.get("active_count", 0)
    now = header_ctx.get("now")
    hhmm = now.strftime("%H:%M") if now is not None else ""
    return f"{emoji} <b>{label}</b> — {count}건 활성 ({hhmm})"


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


def format_issue_message(kind: str, data: dict, *, event: str, header_ctx: dict) -> str:
    """장애 1건 → 텔레그램 HTML 메시지.

    kind: "crawl_failed" | "crawl_stale" | "freshness"
    event: "new" | "recur" | "ongoing" | "resolved"
    header_ctx: {"active_count": int, "now": datetime}
    """
    header = _header(event, header_ctx)
    if event == "resolved":
        # 복구 알림 — 구조화 data 없음, 최소 정보만
        detail = _esc(data.get("detail") or data.get("alert_key"))
        return f"{header}\n\n▸ {detail} — 정상으로 돌아왔습니다."

    builder = _BODY_BUILDERS.get(kind)
    body = builder(data) if builder else f"▸ {_esc(data.get('detail'))}"
    return f"{header}\n\n{body}\n{_action(kind, data)}"
