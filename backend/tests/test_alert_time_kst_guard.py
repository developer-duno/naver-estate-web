"""알림 시각 KST 강제 가드 — 새 코드가 UTC/ISO 원문을 흘리는 것을 CI 가 막는다 (세션 406).

## 왜 이 파일이 필요한가

세션 406 에 텔레그램 알림 시각을 KST 로 통일하면서 `alert_format.py` 의 4곳을 고쳤다.
그런데 **다섯 번째 누수를 놓쳤다** — `job_error_listener.py` 의 misfire 알림이
`str(event.scheduled_run_time)` 로 APScheduler datetime 을 통째 문자열화해
`2026-07-04T04:50:00+00:00` 를 그대로 보내고 있었다.

놓친 이유가 핵심이다: **그 파일엔 `strftime` 도 `isoformat` 도 한 건도 없다.**
사람이 그 두 이름으로 훑는 방식으로는 구조적으로 안 잡힌다. 즉 "이번에 네 곳을
고쳤다"는 사실이 "다음에 다섯 번째가 안 생긴다"를 전혀 보장하지 못한다.

그래서 표시 지점을 고치는 것만으로는 부족하고, **새 코드가 raw 시각을 알림에
넣으면 CI 가 그 줄 번호를 대며 실패하는 구조**가 필요하다. 이 파일이 그 구조다.

## 무엇을 검사하나

알림 경로 3파일(`_SCANNED_FILES`)에서 datetime 이 사람이 읽는 알림 문자열에
닿는 형태를 찾는다:

  - `.isoformat()`      → UTC ISO 원문 (`2026-09-14T03:20:00+00:00`)
  - `.strftime(...)`    → 시간대 변환 없이 직접 포맷
  - `str(...시각변수)`   → 다섯 번째 누수의 형태 (이름만으로는 안 걸리던 것)

허용되는 것은 `_kst_hhmm()` / `_kst_stamp()` 를 거친 경우와, 아래
`_EXEMPT` 에 **사유와 함께** 명시 등록된 줄뿐이다. 예외를 늘리려면 사유를 쓰게
강제하는 것이 목적이다(MONITORING_EXEMPT 관습 답습 — freshness_meta.py).

## 한계 (정직하게)

정적 텍스트 스캔이라 우회가 가능하다(변수에 담아 넘기기, 다른 모듈 경유 등).
"완벽한 차단"이 아니라 **"같은 실수의 재발을 막는 그물"** 이다. 실제로 세션 406 이
낸 다섯 번째 누수 형태는 이 그물에 걸린다(뮤테이션으로 확인).

실행: python -m pytest tests/test_alert_time_kst_guard.py -v
"""

import re
from pathlib import Path

import pytest

_BACKEND = Path(__file__).resolve().parent.parent

# 사람이 읽는 알림을 만드는 파일 — 여기서만 시각 표기가 나간다.
_SCANNED_FILES = (
    "crawler/alert_format.py",
    "crawler/monitor.py",
    "crawler/job_error_listener.py",
)

# KST 변환을 거친 것으로 인정하는 헬퍼.
_KST_HELPERS = ("_kst_hhmm", "_kst_stamp")

# ── 스캔 범위 드리프트 차단 (세션 406 맹점검증 M1·M2) ──────────────────────
#
# _SCANNED_FILES 는 손으로 적은 3줄이라, **10번째 텔레그램 모듈이 생겨도 아무것도
# 실패하지 않는다.** 그 모듈에 시각 한 줄이 추가되면 가드는 조용히 통과시킨다 —
# 이 레포가 이미 데인 실패 모드다([[feedback_guard_skipped_by_path_filter]], s403 #521:
# 양쪽 대조 가드를 한쪽 CI job 에 두는 바람에 정작 그 가드가 필요한 PR 에서만 skip 됐다).
#
# 그래서 "send_telegram 을 부르는 모듈 전수"를 코드에서 **추출**해, 아래 두 선언과의
# 차집합이 공집합인지 본다. 같은 폴더의 test_scheduler_monitoring_coverage.py:357 이
# 쓰는 검증된 패턴(추출 → 차집합 → 실패 메시지에 이름 명시)을 그대로 답습한다.
#
# 시각을 안 쓰는 모듈은 _NO_TIME_MODULES 에 **사유와 함께** 등록하게 강제한다
# (_EXEMPT 관습 답습 — 사유를 쓰게 만드는 것이 목적).
_TELEGRAM_SEARCH_DIRS = ("crawler", "routers", "services")
_TELEGRAM_CALL = "send_telegram"

# 발송기 자신 — 메시지를 만들지 않고 전달만 한다. 스캔 대상도 예외도 아니다.
_TELEGRAM_SENDER = "services/telegram.py"

_NO_TIME_MODULES: dict[str, str] = {
    "crawler/api_version_monitor.py":
        "폐기 감지 알림은 엔드포인트명·사유만 — 시각 표기 0건(세션 406 재확인)",
    "crawler/billing_charge.py":
        "결제 실패/중단 알림은 건수·사유만 — 시각 표기 0건",
    "crawler/field_drift_monitor.py":
        "채움률 드리프트 알림은 필드명·비율만 — 시각 표기 0건",
    "crawler/scheduler_lock.py":
        "락 에러 알림은 상태 문구만 — 시각 표기 0건",
    "crawler/service_official_price.py":
        "수집 결과 알림은 매칭수·잔여만 — 시각 표기 0건",
    "routers/payment.py":
        "운영자 알림(_alert_operator_throttled)은 사유 문구만. 이 파일의 isoformat 3곳은 "
        "API 응답 JSON 의 paid_until 필드이고, 쿨다운의 now 는 time.monotonic()(단조시계)라 "
        "사람이 읽는 시각이 아니다 — 세션 406 이 grep 오탐으로 한 번 의심했다가 직독으로 확인",
}

# 예외 — "파일:줄에 있는 코드 조각" → 사유. 사유 없이 추가 금지.
#
# ⚠ 줄 번호로 고정하지 않는다(코드가 밀리면 조용히 무효가 된다). 코드 조각 자체를
#    키로 써서, 그 코드가 사라지면 test_exempt_entries_still_exist 가 잡는다.
_EXEMPT: dict[str, str] = {
    # alert_format 의 헬퍼 본체 — 여기가 KST 변환을 실제로 수행하는 곳이다.
    'return now.astimezone(KST).strftime("%H:%M")':
        "_kst_hhmm 본체 — astimezone(KST) 를 거친 뒤의 포맷이라 이것이 정답",
    'return dt.astimezone(KST).strftime("%m-%d %H:%M")':
        "_kst_stamp 본체 — 동일",
    # monitor 가 alert_format 으로 넘기는 '입력값'. 표시 직전 _kst_stamp 가 변환한다.
    '"completed_at": row.completed_at.isoformat() if row.completed_at else None,':
        "alert_format._kst_stamp 로 넘어가는 입력 — 표시 직전 KST 변환됨(그 변환은 "
        "test_alert_format.py::test_failed_last_completed_at_is_readable_kst 가 단언)",
    '"started_at": row.oldest.isoformat() if row.oldest else None,':
        "동일 — test_alert_format.py::test_stale_started_at_is_readable_kst 가 단언",
}

# 잡을 패턴. `str(...)` 은 시각으로 보이는 이름을 담은 것만 본다(모든 str() 을
# 막으면 오탐만 늘어 가드가 꺼진다 — 좁게 잡아 실효를 지킨다).
_PATTERNS = (
    (re.compile(r"\.isoformat\(\)"), "isoformat()"),
    (re.compile(r"\.strftime\("), "strftime()"),
    (re.compile(r"\bstr\(\s*[\w.]*(?:scheduled_run_time|_at|_time|now)\b"), "str(시각)"),
    # f-string 직접 삽입 — **여섯 번째 누수가 정확히 이 형태였다** (세션 406 적대검증).
    #
    # `f"...{item['last_updated']}..."` 는 파이썬이 내부적으로 str() 을 부르므로
    # `str(x)` 와 **결과가 완전히 동일**하다(실측: 둘 다 '2026-07-04 04:50:00+00:00').
    # 그런데 위 `str(시각)` 패턴은 `str(` 글자를 요구해서 이 형태를 통과시켰고,
    # 그 사이 monitor.py:316 이 UTC ISO 를 prod monitor_alerts 에 5건 박제했다.
    #
    # 즉 "이번에 고쳤다"가 "다음에 안 생긴다"를 보장하지 못한다는 것을 이 가드
    # 자신이 증명한 셈이다. 그래서 중괄호 안에 시각 이름이 헬퍼 없이 등장하는
    # 것을 잡는다. 같은 줄에 _kst_* 가 있으면 _KST_HELPERS 체크로 면제되므로
    # 정상 코드는 통과한다.
    (
        re.compile(
            r"\{[^{}]*\b(?:scheduled_run_time|last_updated|next_run_at|"
            r"\w*_at|\w*_time|now)\b[^{}]*\}"
        ),
        "f-string 시각",
    ),
)


def _strip_comments_and_docstrings(text: str) -> list[tuple[int, str]]:
    """주석·docstring 을 걷어내고 (줄번호, 코드줄) 목록을 돌려준다.

    이 파일들의 주석은 설계 근거를 설명하며 `isoformat()` 같은 문구를 그대로
    인용한다(실제로 이 모듈의 docstring 도 그렇다). 걷어내지 않으면 주석만으로
    실패하는 자기오탐이 된다 — V057/V058 마이그레이션 테스트의 _strip_comments
    패턴과 같은 이유다.
    """
    out: list[tuple[int, str]] = []
    in_doc = False
    doc_delim = ""
    for i, raw in enumerate(text.splitlines(), start=1):
        line = raw
        stripped = line.strip()
        if in_doc:
            if doc_delim in stripped:
                in_doc = False
            continue
        # 한 줄짜리 docstring/삼중따옴표 시작
        for delim in ('"""', "'''"):
            if stripped.startswith(delim):
                if stripped.count(delim) == 1:
                    in_doc = True
                    doc_delim = delim
                break
        if in_doc:
            continue
        if stripped.startswith("#"):
            continue
        code = line.split("  # ")[0]  # 줄 끝 주석 제거(보수적으로 2칸+# 만)
        out.append((i, code))
    return out


def _violations(rel_path: str) -> list[tuple[int, str, str]]:
    """한 파일에서 (줄번호, 매치종류, 코드줄) 위반 목록을 만든다."""
    text = (_BACKEND / rel_path).read_text(encoding="utf-8")
    hits: list[tuple[int, str, str]] = []
    for lineno, code in _strip_comments_and_docstrings(text):
        for pattern, label in _PATTERNS:
            if not pattern.search(code):
                continue
            if any(h in code for h in _KST_HELPERS):
                continue  # 헬퍼를 거친 호출
            if any(key in code for key in _EXEMPT):
                continue  # 사유와 함께 등록된 예외
            hits.append((lineno, label, code.strip()))
    return hits


@pytest.mark.parametrize("rel_path", _SCANNED_FILES)
def test_no_raw_time_in_alert_path(rel_path):
    """알림 경로에 KST 변환을 안 거친 시각 표기가 없어야 한다."""
    hits = _violations(rel_path)
    if hits:
        detail = "\n".join(f"    {rel_path}:{ln}  [{kind}]  {code}" for ln, kind, code in hits)
        pytest.fail(
            f"\n알림에 KST 변환 없는 시각 표기가 있다 ({len(hits)}건):\n{detail}\n\n"
            "  고치는 법: alert_format 의 _kst_hhmm(헤더 HH:MM) 또는 _kst_stamp(본문 "
            "MM-DD HH:MM)를 거치게 한다.\n"
            "  정당한 예외라면 이 파일의 _EXEMPT 에 '코드 조각 → 사유' 로 등록한다.\n"
            "  (세션 406: 이 가드가 없어서 job_error_listener 의 misfire 알림이 "
            "UTC ISO 를 그대로 내보내고 있었다)"
        )


def test_exempt_entries_still_exist():
    """_EXEMPT 에 등록된 코드 조각이 실제로 남아 있는지 — 죽은 예외 청소.

    코드가 바뀌어 그 줄이 사라졌는데 예외만 남으면, 나중에 같은 모양의 진짜
    위반이 그 예외에 우연히 걸려 조용히 통과할 수 있다.
    """
    all_text = "\n".join(
        (_BACKEND / p).read_text(encoding="utf-8") for p in _SCANNED_FILES
    )
    dead = [key for key in _EXEMPT if key not in all_text]
    assert not dead, (
        "_EXEMPT 에 더 이상 존재하지 않는 코드가 남아 있다 — 제거할 것:\n"
        + "\n".join(f"    {d}" for d in dead)
    )


def test_guard_catches_the_fifth_leak_shape():
    """이 가드가 세션 406 의 다섯 번째 누수 형태를 실제로 잡는지 (자기검증).

    가드가 장식이 아님을 보이는 테스트. 실제 누수였던
    `str(event.scheduled_run_time)` 를 그대로 넣어 패턴에 걸리는지 확인한다.
    """
    leaked = 'f"예정시각: {html.escape(str(event.scheduled_run_time))}"'
    assert any(p.search(leaked) for p, _ in _PATTERNS), (
        "가드가 다섯 번째 누수 형태를 못 잡는다 — 패턴을 고쳐야 한다"
    )

    fixed = 'f"예정시각: {html.escape(_kst_stamp(event.scheduled_run_time))}"'
    assert any(h in fixed for h in _KST_HELPERS), "수정된 형태는 헬퍼를 거쳐 통과해야 한다"


def test_scanned_files_all_exist():
    """스캔 대상 파일이 실제로 존재하는지 — 경로가 바뀌면 가드가 조용히 0건이 된다."""
    for rel in _SCANNED_FILES:
        assert (_BACKEND / rel).exists(), f"스캔 대상 파일 부재: {rel}"


# ── 스캔 범위 드리프트 차단 (핵심) ─────────────────────────────────────────


def _telegram_modules() -> set[str]:
    """`send_telegram` 을 호출하는 모듈 경로 전수 — 소스에서 추출(손 목록 아님).

    테스트 파일과 발송기 자신은 제외한다. 주석 안의 언급까지 세어도 무방하다 —
    과다 검출은 "등록하라"는 요구로 끝나지만, 과소 검출은 사각지대를 만든다.
    """
    found: set[str] = set()
    for d in _TELEGRAM_SEARCH_DIRS:
        for path in (_BACKEND / d).rglob("*.py"):
            if "__pycache__" in path.parts or path.name.startswith("test_"):
                continue
            rel = path.relative_to(_BACKEND).as_posix()
            if rel == _TELEGRAM_SENDER:
                continue
            if _TELEGRAM_CALL in path.read_text(encoding="utf-8"):
                found.add(rel)
    return found


def test_every_telegram_module_is_scanned_or_declared_timeless():
    """텔레그램 알림을 보내는 모듈은 **스캔되거나, 시각 미노출로 선언되거나** 둘 중 하나.

    이 테스트가 없으면 10번째 알림 모듈이 생겨도 가드가 조용하다. 세션 406 의
    여섯 번째 누수(monitor.py f-string)가 정확히 "가드가 조용한" 형태였고, 그때는
    monitor.py 가 스캔 대상이라도 패턴이 못 잡은 경우였다. 이건 그 반대편 구멍
    — **패턴은 맞는데 파일이 아예 안 보이는** 경우를 막는다.
    """
    declared = set(_SCANNED_FILES) | set(_NO_TIME_MODULES)
    missing = sorted(_telegram_modules() - declared)
    assert not missing, (
        "\n텔레그램 알림 모듈인데 시각 가드에 미등록:\n"
        + "\n".join(f"    {m}" for m in missing)
        + "\n\n  둘 중 하나를 하세요:\n"
        "    (a) 그 모듈이 시각을 알림에 찍는다 → _SCANNED_FILES 에 추가\n"
        "    (b) 시각을 안 찍는다 → _NO_TIME_MODULES 에 '경로: 사유' 로 등록\n"
        "        (사유는 직접 확인하고 쓸 것 — 세션 406 은 grep 오탐으로 payment.py 를\n"
        "         한 번 잘못 의심했다가 직독으로 정정했다)"
    )


def test_no_time_modules_still_send_telegram():
    """_NO_TIME_MODULES 에 등록된 모듈이 실제로 존재하고 여전히 알림을 보내는지.

    죽은 예외 청소 — 그 모듈이 알림을 더 이상 안 보내면 등록이 무의미하고,
    나중에 같은 경로에 새 코드가 들어와도 조용히 면제된다.
    """
    actual = _telegram_modules()
    stale = sorted(m for m in _NO_TIME_MODULES if m not in actual)
    assert not stale, (
        "_NO_TIME_MODULES 에 더 이상 send_telegram 을 안 부르는(또는 사라진) 모듈이 "
        "남아 있다 — 제거할 것:\n" + "\n".join(f"    {m}" for m in stale)
    )


def test_no_time_modules_have_reasons():
    """등록된 예외에 사유가 비어 있지 않은지 — 사유 없는 면제는 다음 사람이 못 믿는다."""
    empty = sorted(m for m, why in _NO_TIME_MODULES.items() if not why.strip())
    assert not empty, f"_NO_TIME_MODULES 에 사유가 빈 항목: {empty}"
