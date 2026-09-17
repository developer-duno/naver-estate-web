"""알림 11창구 + 미지 에러 렌더가 전부 쉬운 우리말로 나가는지 한 번에 확인 (세션 409·410·411).

재시작 직후 "PR 이 라이브에 반영됐나"를 판정하는 용도. 텔레그램은 mock 이라
**실발송 0** (conftest 없이 단독 실행되므로 patch 로 직접 막는다).

⚠ 세션 410 확장: 옛 판은 "번역 사전에 걸린 말"만 렌더해서, 정작 사전에 **안 걸렸을 때**
   나가는 문장("처음 보는 문제…")과 결제 중단·부분환불 알림을 한 번도 안 찍어 봤다.
   ⓪⑨⑩ 이 그 자리다 — 사장님이 실제로 읽을 문장을 눈으로 확인하는 것이 이 스크립트의 값이다.

⚠ 세션 411 확장: ⑪ 은 텔레그램이 아니라 **관리자 화면**(스케줄러 표·일괄 재크롤 진행률)의
   `error_plain` 이다. 사장님이 읽는 창구라 같은 기준으로 함께 검사한다.

실행:
    cd backend && DATABASE_URL="sqlite:///:memory:" PYTHONPATH=. PYTHONUTF8=1 \
        python scripts/verify_alert_wording.py

종료 코드: 0 = 전부 우리말 / 1 = 어려운 말이 남아 있음(그 창구를 출력)
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

    # ── 0. 번역 사전에 **없는** 에러가 났을 때 나가는 문장 (새 알림 + 해소 알림) ──
    #
    # 사전에 걸린 말만 확인하면 정작 "모르는 에러" 경로는 한 번도 안 찍힌다. 이 경로의
    # 고정 문장은 해소 알림에서 `plainify_detail()` 이 꼬리 마침표만 떼고
    # " — 정상으로 돌아왔습니다" 를 이어 붙이므로, 문장 **안**에 마침표가 있으면
    # "…문제예요. …남아 있어요 — 정상으로…" 처럼 한 줄에서 흐름이 두 번 끊긴다
    # (세션 407 이 고쳤던 증상, 세션 410 검사관 MEDIUM 재발 지적).
    unknown_data = {"job_type": "article_detail", "count": 1,
                    "error": "card_declined", "processed": 0, "total": 0}
    msg = format_issue_message("crawl_failed", unknown_data, event="new",
                               header_ctx={"active_count": 1, "now": now})
    results.append(("⓪-1 미지 에러 — 새 알림", msg, check("", msg)))

    # 해소 알림 — monitor.py:217 이 만드는 detail 모양 그대로 재현한다.
    from crawler.plain_words import explain_error, job_words

    resolved_detail = (f"{job_words('article_detail')} 작업 1건 실패"
                       f" — {explain_error('card_declined')}")
    msg = format_issue_message(
        "crawl_failed",
        {"alert_key": "crawl_failed:article_detail", "detail": resolved_detail,
         "reason": "recovered", "reason_detail": ""},
        event="resolved", header_ctx={"active_count": 0, "now": now},
    )
    bad = check("", msg)
    # " — 정상으로…" 앞에 마침표가 남으면 문장이 중간에 끊긴다.
    if "요. " in msg:
        bad.append("내부 마침표")
    results.append(("⓪-2 미지 에러 — 해소 알림", msg, bad))

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

    # ── 8. service_official_price — **호출부 전수를 소스에서 추출**해 검사 ──
    #
    # ⚠ 옛 구현은 여기에 이미 우리말인 문자열을 **손으로 써 넣고** _alert_official_price
    #    에 통과시켰다. 그건 "전달 함수가 문자열을 그대로 넘기나"를 볼 뿐 **어느 호출부도
    #    검증하지 않는다** — 실제로 이 파일의 세 호출부 중 하나(표준코드 이관 감지)가
    #    영문·전문용어인 채로 남아 있었는데 스크립트는 초록을 냈다(세션 409 적대검증).
    #    그래서 소스에서 호출부 문자열을 직접 긁어 검사한다.
    import pathlib

    op_src = (pathlib.Path(__file__).resolve().parent.parent
              / "crawler" / "service_official_price.py").read_text(encoding="utf-8")
    calls = re.findall(r"_alert_official_price\(\s*((?:\s*(?:f?\"[^\"]*\"|'[^']*')\s*)+)\)", op_src)
    if not calls:
        results.append(("⑧ 공시가격 (호출부 추출 실패)", "(패턴 미검출 — 스크립트 점검 필요)",
                        ["호출부를 하나도 못 찾았다"]))
    for i, raw in enumerate(calls, 1):
        # 소스 리터럴 → 사람이 볼 문구.
        # ⚠ f-string 자리표시자 `{len(x)}` 는 실제 알림에선 **숫자로 치환**되므로
        #    변수명을 영문 식별자로 오탐하면 안 된다 — 먼저 걷어낸다.
        msg = re.sub(r"\{[^}]*\}", "○", raw)
        msg = re.sub(r'f?"|\'', "", msg).replace("\\n", "\n")
        results.append((f"⑧-{i} 공시가격 알림", msg, check("", msg)))

    # ── 9. billing_charge._mark_retry — 자동결제 3회 실패 중단 알림 ──
    #
    # 사유 문자열마다 사장님이 읽는 까닭 한 줄이 달라진다(explain_error). 특히
    # `status=` 가 **빈 문자열**인 경우(`routers/payment._portone_status()` 가 SDK 응답에
    # status 가 없으면 "" 를 돌려준다)는 옛 사전에서 아무 규칙에도 안 맞아 "처음 보는
    # 문제" 로 떨어져 결제 알림인지조차 사라졌다 — 여기서 여섯 사유를 전부 렌더해 본다.
    from unittest.mock import MagicMock

    import crawler.billing_charge as bc

    billing_reasons = [
        "결제 미완료 (status=FAILED)",
        "결제 미완료 (status=PENDING)",
        "결제 미완료 (status=CANCELLED)",
        "결제 미완료 (status=)",
        "결제 호출 실패: HTTP 502 Bad Gateway",
        "card_declined",
    ]
    for i, reason in enumerate(billing_reasons, 1):
        db = MagicMock()
        bk = SimpleNamespace(user_id="u-verify", retry_count=2, status="active")
        bc._last_alert_at.clear()  # 회원별 쿨다운 키 — 안 지우면 두 번째부터 안 나간다
        with patch("services.telegram.send_telegram") as tg, \
             patch("crawler.billing_charge._notify_user_billing_failed"):
            bc._mark_retry(db, bk, "pay-verify", reason)
        msg = tg.call_args[0][0]
        results.append((f"⑨-{i} 자동결제 중단 ({reason})", msg, check("", msg)))

    # ── 10. routers.payment._handle_refund_webhook — 부분환불 알림 ──
    #
    # 사장님이 손으로 처리해야 하는 유일한 결제 알림이라 "누구인지"가 들어간다. 단
    # 텔레그램은 제3자 서버에 평문으로 남고 전달된 메시지는 회수할 수 없으므로
    # 이메일은 **마스킹**돼야 한다(세션 410 검사관 D5).
    import routers.payment as pay

    db = MagicMock()
    db.get.return_value = SimpleNamespace(email="sajang@example.com")
    payment_row = SimpleNamespace(payment_id="pay-verify", user_id="u-verify",
                                  plan="pro_30d", amount=10000, status="paid")
    pay._last_alert_at.clear()
    with patch("routers.payment.log_action"), \
         patch("services.telegram.send_telegram") as tg:
        pay._handle_refund_webhook(db, payment_row, "Transaction.PartialCancelled")
    msg = tg.call_args[0][0]
    bad = check("", msg)
    if "sa***@example.com" not in msg or "sajang@example.com" in msg:
        bad.append("이메일 마스킹 안 됨")
    results.append(("⑩ 부분환불 알림", msg, bad))

    # ── 11. crawler.plain_words.explain_stored_error — 관리자 화면 error_plain ──
    #
    # 텔레그램은 아니지만 사장님이 읽는 창구라 같은 기준을 적용한다(infra.md
    # §텔레그램 알림 문구: "error_message 도 관리자 화면에 보이므로 같은 기준").
    # 스케줄러 표(`/api/admin/scheduler-status`)와 일괄 재크롤 진행률이 이 값을 띄운다.
    from crawler.plain_words import explain_stored_error

    stored_raws = [
        "stale running — swept by monitor",
        "(psycopg2.errors.QueryCanceled) canceling statement due to statement timeout",
        "3/50개 단지 실패 | stale running — swept by monitor",
    ]
    for i, raw in enumerate(stored_raws, 1):
        rendered = explain_stored_error(raw)
        bad = check("", rendered)
        if "stale" in rendered.lower():
            bad.append("영문 마커 잔존")
        results.append((f"⑪-{i} 관리자 화면 에러 문구", rendered, bad))

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
        print(f"❌ 11창구 + 미지 에러 렌더 중 {failed}곳에 어려운 말이 남아 있다")
        return 1
    print("✅ 11창구 + 미지 에러 렌더 전부 쉬운 우리말 — 라이브 반영 확인")
    return 0


if __name__ == "__main__":
    sys.exit(main())
