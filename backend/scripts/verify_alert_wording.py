"""알림 8창구가 전부 쉬운 우리말로 나가는지 한 번에 확인 (세션 409).

재시작 직후 "PR 이 라이브에 반영됐나"를 판정하는 용도. 텔레그램은 mock 이라
**실발송 0** (conftest 없이 단독 실행되므로 patch 로 직접 막는다).

실행:
    cd backend && PYTHONPATH=. PYTHONUTF8=1 python scripts/verify_alert_wording.py

종료 코드: 0 = 8창구 전부 우리말 / 1 = 어려운 말이 남아 있음(그 창구를 출력)
"""
import re
import sys
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

# 알림에 나오면 안 되는 말 — infra.md §텔레그램 알림 문구
FORBIDDEN = [
    "엔드포인트", "웹훅", "NO_OPENAPI", "[BILLING]", "[PAYMENT]", "[내부모니터]",
    "[내부즉시]", "[외부감시]", "psycopg2", "VACUUM", "락 파일", "backfill",
    "batch", "running", "임계", "job_id=",
]
# 영문 식별자(snake_case·CamelCase)가 본문에 있으면 의심 — 단 허용어는 제외
ALLOW_EN = {"Claude", "HTTP", "K", "apt"}


def check(name: str, message: str) -> list[str]:
    """한 창구의 메시지를 검사 — 문제 목록 반환(비면 합격)."""
    bad = [w for w in FORBIDDEN if w in message]
    # 영문 식별자 흔적 (예: total_floor_count, article_detail)
    for m in re.findall(r"\b[a-z]+_[a-z_]+\b", message):
        bad.append(f"영문식별자:{m}")
    return bad


def main() -> int:
    results: list[tuple[str, str, list[str]]] = []
    now = datetime.now(timezone.utc)

    # ── 1·2. monitor → alert_format (주 경로: 수집 실패 / 결제 실패) ──
    from crawler.alert_format import format_issue_message

    for label, job_type in [("① 수집 잡 실패", "article_detail"),
                            ("② 결제 잡 실패", "billing_charge")]:
        msg = format_issue_message(
            "crawl_failed",
            {"job_type": job_type, "count": 1, "error": "PortOne 500",
             "processed": 0, "total": 0},
            event="new", header_ctx={"active_count": 1, "now": now},
        )
        results.append((label, msg, check(label, msg)))

    # ── 3·4. field_drift_monitor (채움률 위반 / 해소) ──
    import crawler.field_drift_monitor as fd

    with patch("crawler.field_drift_monitor.send_telegram") as tg:
        fd._send_violation_alert("total_floor_count", 73.7, 90, 8832)
    results.append(("③ 채움률 이상", tg.call_args[0][0], check("", tg.call_args[0][0])))

    with patch("crawler.field_drift_monitor.send_telegram") as tg:
        fd._send_resolved_alert("total_floor_count", 95.2, 90)
    results.append(("④ 채움률 회복", tg.call_args[0][0], check("", tg.call_args[0][0])))

    # ── 5. job_error_listener (잡 즉사) ──
    from apscheduler.events import EVENT_JOB_ERROR

    import crawler.job_error_listener as jl

    ev = SimpleNamespace(
        code=EVENT_JOB_ERROR, job_id="vacuum_maintenance", jobstore="default",
        scheduled_run_time=None, retval=None,
        exception=Exception("(psycopg2.errors.QueryCanceled) statement timeout"),
        traceback=None,
    )
    with patch("services.telegram.send_telegram") as tg:
        jl.job_event_listener(ev, None)
    results.append(("⑤ 잡 즉사", tg.call_args[0][0], check("", tg.call_args[0][0])))

    # ── 6. api_version_monitor (정부 자료 창구 폐기) ──
    from crawler.api_version_monitor import _build_alert_message

    msg = _build_alert_message([{"name": "국토부 실거래가", "url": "http://x"}])
    results.append(("⑥ 정부창구 폐기", msg, check("", msg)))

    # ── 7. scheduler_lock (예약작업 시작 실패) ──
    import crawler.scheduler_lock as sl

    with patch("services.telegram.send_telegram") as tg:
        sl._alert_scheduler_lock_error("D:/x/scheduler.lock", OSError("Permission denied"))
    results.append(("⑦ 예약작업 실패", tg.call_args[0][0], check("", tg.call_args[0][0])))

    # ── 8. service_official_price (공시가격 이상) ──
    import crawler.service_official_price as op

    with patch("services.telegram.send_telegram") as tg:
        op._alert_official_price(
            "[서버 알림] ⚠ <b>정부 공시가격 받기</b> — 일부 단지는 못 받았어요\n\n"
            "▸ 다시 시도했는데도 값이 없는 단지 1곳: 132662(더레이크원)\n"
            "→ 손님 화면은 그대로 보입니다. 그 단지들만 공시가격이 빈칸이에요.\n"
            "   급하지 않으니 아침에 Claude 에게 알려주세요."
        )
    results.append(("⑧ 공시가격 이상", tg.call_args[0][0], check("", tg.call_args[0][0])))

    # ── 출력 ──
    failed = 0
    for label, msg, bad in results:
        mark = "✅" if not bad else "❌"
        print(f"\n{'=' * 64}\n{mark} {label}\n{'=' * 64}")
        print(msg)
        if bad:
            failed += 1
            print(f"\n  ⚠ 어려운 말 발견: {bad}")

    print(f"\n{'=' * 64}")
    if failed:
        print(f"❌ 8창구 중 {failed}곳에 어려운 말이 남아 있다")
        return 1
    print("✅ 8창구 전부 쉬운 우리말 — 라이브 반영 확인")
    return 0


if __name__ == "__main__":
    sys.exit(main())
