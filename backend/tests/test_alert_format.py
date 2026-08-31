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
    assert msg.startswith("[내부모니터] 🔴 <b>크롤링 장애</b> — 1건 활성 (17:40)")
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
    assert msg.startswith("[내부모니터] ✅ <b>크롤링 복구</b>")
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


def test_admin_link_skips_localhost_for_comma_separated_urls():
    """FRONTEND_URL 이 콤마 다중값 (main.py CORS 다중 origin) 일 때
    localhost 는 skip 하고 첫 운영 도메인을 링크 베이스로.

    실측 backend/.env = "http://localhost:3000,https://2u.pe.kr,https://www.2u.pe.kr".
    그대로 박으면 알림 링크가 "http://localhost:3000,https://2u.pe.kr,..." 로 깨짐.
    구독자(공인중개사) 가 텔레그램에서 클릭하니 localhost 는 무의미 → 운영 도메인 선택.
    """
    data = {"label": "매물", "status": "red", "spinning": False,
            "processed": None, "total": None, "new_rows": None, "link_path": "/admin#freshness"}
    multi = "http://localhost:3000,https://2u.pe.kr,https://www.2u.pe.kr"
    with patch.dict("os.environ", {"FRONTEND_URL": multi}, clear=False):
        msg = format_issue_message("freshness", data, event="new", header_ctx=_ctx())
    # 콤마 통째로 들어가면 안 됨 + localhost 도 skip
    assert "localhost" not in msg, f"localhost 누출: {msg}"
    assert "," not in msg.split("→")[-1], f"콤마 누출: {msg}"
    assert "https://2u.pe.kr/admin#freshness" in msg, f"운영 도메인 사용 필요: {msg}"


def test_admin_link_uses_only_origin_when_single():
    """FRONTEND_URL 이 단일값일 때는 그대로 사용 (회귀 가드)."""
    data = {"label": "매물", "status": "red", "spinning": False,
            "processed": None, "total": None, "new_rows": None, "link_path": "/admin#freshness"}
    with patch.dict("os.environ", {"FRONTEND_URL": "https://example.com"}, clear=False):
        msg = format_issue_message("freshness", data, event="new", header_ctx=_ctx())
    assert "https://example.com/admin#freshness" in msg


def test_admin_link_only_localhost_falls_back_to_localhost():
    """FRONTEND_URL 이 localhost 만 있으면 (dev 환경) localhost 그대로 사용."""
    data = {"label": "매물", "status": "red", "spinning": False,
            "processed": None, "total": None, "new_rows": None, "link_path": "/admin#freshness"}
    with patch.dict("os.environ", {"FRONTEND_URL": "http://localhost:3000"}, clear=False):
        msg = format_issue_message("freshness", data, event="new", header_ctx=_ctx())
    assert "http://localhost:3000/admin#freshness" in msg


# ── 세션 391: 해소 알림 사유 3분기 (가짜 복구 통지 차단) ──
# 배경: "이번 스캔에 키가 없다" 를 전부 "✅ 정상으로 돌아왔습니다" 로 내보내
# 스윕 강제정리·24h 창 이탈까지 복구로 통지되던 결함. reason 으로 문구를 가른다.


def test_resolved_reason_recovered_says_success_confirmed():
    """reason=recovered → ✅ + '최근 실행 성공 확인' 명시."""
    data = {"alert_key": "crawl_failed:complex_list", "detail": "이전 장애",
            "reason": "recovered", "reason_detail": ""}
    msg = format_issue_message("crawl_failed", data, event="resolved", header_ctx=_ctx(0))
    assert "✅" in msg
    assert "정상으로 돌아왔습니다" in msg
    assert "최근 실행 성공 확인" in msg


def test_resolved_reason_swept_warns_cause_unresolved():
    """reason=swept → ⚠️ + '강제 정리' + '원인은 미해결' (복구라고 말하지 않는다)."""
    data = {"alert_key": "crawl_stale:crawl_details", "detail": "이전 마비",
            "reason": "swept", "reason_detail": ""}
    msg = format_issue_message("crawl_stale", data, event="resolved", header_ctx=_ctx(0))
    assert "⚠️" in msg
    assert "강제 정리" in msg
    assert "원인은 미해결" in msg
    # 가짜 복구 문구가 섞이면 안 된다 (회귀 가드)
    assert "정상으로 돌아왔습니다" not in msg


def test_resolved_reason_unconfirmed_includes_last_run_detail():
    """reason=unconfirmed → ℹ️ + '성공 실행은 확인되지 않았습니다' + 마지막 실행 상태."""
    data = {"alert_key": "crawl_failed:complex_list", "detail": "이전 장애",
            "reason": "unconfirmed", "reason_detail": "마지막 실행: 실패 (24h 관찰 창 경과)"}
    msg = format_issue_message("crawl_failed", data, event="resolved", header_ctx=_ctx(0))
    assert "ℹ️" in msg
    assert "성공 실행은 확인되지 않았습니다" in msg
    assert "마지막 실행: 실패 (24h 관찰 창 경과)" in msg
    assert "정상으로 돌아왔습니다" not in msg


def test_resolved_headers_match_reason_not_always_recovery():
    """헤더도 사유별로 갈린다 — 본문이 '원인 미해결' 인데 헤더가 '✅ 크롤링 복구' 면
    헤더만 본 사장님이 정상으로 오인한다(헤더·본문 모순 가드)."""
    base = {"alert_key": "crawl_stale:crawl_details", "detail": "이전 마비"}

    swept = format_issue_message(
        "crawl_stale", {**base, "reason": "swept"}, event="resolved", header_ctx=_ctx(0)
    )
    assert swept.startswith("[내부모니터] ⚠️ <b>알림 종료</b>")
    assert "복구" not in swept

    unconfirmed = format_issue_message(
        "crawl_stale", {**base, "reason": "unconfirmed", "reason_detail": "마지막 실행: 실패"},
        event="resolved", header_ctx=_ctx(0),
    )
    assert unconfirmed.startswith("[내부모니터] ℹ️ <b>알림 종료</b>")
    assert "복구" not in unconfirmed

    # recovered 는 기존 헤더 유지 (진짜 복구니까)
    recovered = format_issue_message(
        "crawl_stale", {**base, "reason": "recovered"}, event="resolved", header_ctx=_ctx(0)
    )
    assert recovered.startswith("[내부모니터] ✅ <b>크롤링 복구</b>")


def test_resolved_without_reason_keeps_legacy_wording():
    """하위호환: reason 미지정(옛 호출·수동 호출)이면 기존 문구 그대로."""
    data = {"alert_key": "crawl_failed:complex_articles", "detail": "이전 장애"}
    msg = format_issue_message("crawl_failed", data, event="resolved", header_ctx=_ctx(0))
    assert msg.startswith("[내부모니터] ✅ <b>크롤링 복구</b>")
    assert "▸ 이전 장애 — 정상으로 돌아왔습니다." in msg
