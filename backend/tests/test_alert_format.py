"""크롤링 장애 메시지 포맷 테스트 — format_issue_message
실행: python -m pytest tests/test_alert_format.py -v

DB 의존 없는 순수 함수 — 정상/엣지 케이스를 dict 입력만으로 검증.
"""

from datetime import datetime, timezone
from unittest.mock import patch

from crawler.alert_format import format_issue_message

# 테스트용 헤더 컨텍스트 — 17:40 KST 가정
_NOW = datetime(2026, 5, 19, 17, 40, tzinfo=timezone.utc)


def _ctx(active_count: int = 1) -> dict:
    """헤더 컨텍스트 팩토리."""
    return {"active_count": active_count, "now": _NOW}


def test_failed_message_has_header_and_body():
    """정상: crawl_failed → 헤더 🔴 + job_type + 처리율 포함"""
    data = {
        "job_type": "complex_articles", "count": 1, "error": "네이버 502",
        "processed": 40, "total": 50, "last_completed_at": "2026-05-19T04:00:00+00:00",
    }
    msg = format_issue_message("crawl_failed", data, event="new", header_ctx=_ctx())
    assert msg.startswith("🔴 <b>크롤링 장애</b> — 1건 활성 (17:40)")
    assert "complex_articles" in msg
    assert "40/50 (80%)" in msg
    assert "크롤링 로그 확인" in msg


def test_failed_message_multiple_count_shows_extra():
    """정상: count>1 이면 '외 N건' 표기"""
    data = {"job_type": "popular_crawl", "count": 3, "error": "타임아웃",
            "processed": 0, "total": 0}
    msg = format_issue_message("crawl_failed", data, event="new", header_ctx=_ctx())
    assert "외 2건" in msg
    assert "통계 없음" in msg  # total=0 → 0 나눗셈 없이 처리


def test_stale_message_body():
    """정상: crawl_stale → 마비 본문 + 재시작 가이드"""
    data = {"job_type": "crawl_details", "count": 2, "stale_hours": 1,
            "started_at": "2026-05-19T15:00:00+00:00"}
    msg = format_issue_message("crawl_stale", data, event="new", header_ctx=_ctx())
    assert "crawl_details" in msg
    assert "마비" in msg
    assert "재시작" in msg


def test_freshness_message_spinning():
    """정상: freshness 헛바퀴 → 'headers 도는데 신규행 0' 문구 + 신선도 링크"""
    data = {"label": "매물", "status": "red", "age_hours": 26, "spinning": True,
            "processed": 53, "total": 53, "new_rows": 0, "link_path": "/admin#freshness"}
    msg = format_issue_message("freshness", data, event="new", header_ctx=_ctx())
    assert "매물" in msg and "red" in msg and "26h" in msg
    assert "헛바퀴" in msg
    assert "/admin#freshness" in msg


def test_html_escape_in_error_message():
    """엣지: error 에 <script> 가 있으면 HTML 이스케이프 (태그 깨짐·XSS 방어)"""
    data = {"job_type": "x", "count": 1, "error": "<script>alert(1)</script>",
            "processed": 0, "total": 0}
    msg = format_issue_message("crawl_failed", data, event="new", header_ctx=_ctx())
    assert "<script>" not in msg
    assert "&lt;script&gt;" in msg


def test_resolved_event_uses_check_emoji():
    """정상: event=resolved → ✅ 헤더 + '정상으로 돌아왔습니다'"""
    data = {"alert_key": "crawl_failed:complex_articles", "detail": "이전 장애"}
    msg = format_issue_message("crawl_failed", data, event="resolved", header_ctx=_ctx(0))
    assert msg.startswith("✅ <b>크롤링 복구</b>")
    assert "정상으로 돌아왔습니다" in msg


def test_admin_link_with_frontend_url():
    """정상: FRONTEND_URL 설정 시 절대 링크"""
    data = {"label": "매물", "status": "red", "spinning": False,
            "processed": None, "total": None, "new_rows": None, "link_path": "/admin#freshness"}
    with patch.dict("os.environ", {"FRONTEND_URL": "https://2u.pe.kr"}, clear=False):
        msg = format_issue_message("freshness", data, event="new", header_ctx=_ctx())
    assert "https://2u.pe.kr/admin#freshness" in msg


def test_admin_link_without_frontend_url():
    """엣지: FRONTEND_URL 미설정 시 경로만 (절대 URL 없음)"""
    data = {"label": "매물", "status": "red", "spinning": False,
            "processed": None, "total": None, "new_rows": None, "link_path": "/admin#freshness"}
    with patch.dict("os.environ", {"FRONTEND_URL": ""}, clear=False):
        msg = format_issue_message("freshness", data, event="new", header_ctx=_ctx())
    assert "→ /admin#freshness 데이터 신선도 확인" in msg


# ── PR #44 batch 합산 의미 일관성 (세션 219 후속) ──
# PR #44 로 freshness._last_job 이 1건 → batch 합산으로 바뀌었는데 알림 본문은
# 여전히 "마지막 작업 처리율" / "작업 후 신규행" 으로 표현해 사용자가 "작업 1개"
# 로 오해. 본문도 "batch 합계 처리율" / "batch 시작 후 신규행" 으로 통일.


def test_freshness_body_uses_batch_language():
    """freshness 본문은 'batch 합계' / 'batch 시작 후 신규행' 으로 표현."""
    data = {"label": "매물", "status": "red", "age_hours": 26, "spinning": True,
            "processed": 791, "total": 791, "new_rows": 0, "link_path": "/admin#freshness"}
    msg = format_issue_message("freshness", data, event="new", header_ctx=_ctx())
    assert "batch 합계" in msg, f"본문에 'batch 합계' 표현 필요: {msg}"
    assert "batch 시작 후" in msg, f"본문에 'batch 시작 후' 표현 필요: {msg}"
    # 옛 표현이 남아있으면 안 됨 (회귀 가드)
    assert "마지막 작업 처리율" not in msg
    assert "작업 후 신규행" not in msg


def test_failed_body_uses_batch_language():
    """crawl_failed 본문도 'batch 합계 처리율' 로 통일."""
    data = {
        "job_type": "complex_articles", "count": 1, "error": "네이버 502",
        "processed": 791, "total": 791, "last_completed_at": "2026-05-19T04:00:00+00:00",
    }
    msg = format_issue_message("crawl_failed", data, event="new", header_ctx=_ctx())
    assert "batch 합계" in msg, f"본문에 'batch 합계' 표현 필요: {msg}"
    assert "마지막 처리율" not in msg
