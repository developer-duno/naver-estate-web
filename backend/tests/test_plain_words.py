"""텔레그램 알림 '쉬운 말' 사전 테스트 — crawler/plain_words.py (세션 407)

사장님 지시(2026-09-15): *"텔레그램 알림은 일반인이 봐도 무엇이 어떻게 잘못되었는지
손쉽게 알 수 있어야 해. 어려운 말은 금지야."*

이 파일이 지키는 것은 두 가지다.
  ① **사전 누락 차단** — 새 job_type 이 생겼는데 사전에 안 넣으면 알림에 영문이 샌다.
     FE 사전(crawl-job-labels.ts)과 키를 대조해 기계적으로 잡는다.
  ② **어려운 말 재유입 차단** — 누군가 알림 문구에 영문 코드·개발자 에러를 다시
     넣으면 실패한다. 사람 눈 검토로는 반복해서 새던 것이라 가드로 고정한다.

DB 의존 없는 순수 함수 테스트.
"""

import re
from pathlib import Path

from crawler.plain_words import (
    JOB_WORDS,
    action_words,
    explain_error,
    job_words,
    plainify_detail,
    status_words,
)

# FE 사전 — 같은 job_type 키 체계를 쓴다(양쪽 다 DB job_type 기준).
_FE_LABELS = Path(__file__).resolve().parents[2] / "frontend" / "src" / "lib" / "crawl-job-labels.ts"


def _fe_job_type_keys() -> set[str]:
    """crawl-job-labels.ts 의 최상위 키(job_type) 추출 — TS 파싱 없이 텍스트로.

    check-job-labels.mjs 의 extractLabelKeys 와 같은 규칙(들여쓰기 2칸 + 대문자 허용).
    """
    src = _FE_LABELS.read_text(encoding="utf-8")
    body = src.split("CRAWL_JOB_LABELS")[1]
    return set(re.findall(r"^ {2}([A-Za-z0-9_]+):\s*\{", body, re.M))


# ── ① 사전 정합 ──────────────────────────────────────────────────────────


def test_be_dict_covers_every_fe_job_type():
    """FE 화면이 아는 작업은 알림도 전부 우리말로 부를 수 있어야 한다.

    빠지면 그 작업이 실패했을 때 텔레그램에 영문 코드가 그대로 찍힌다 — 사장님
    지적("어려운 말 너무 많다")의 실체가 바로 이것이었다(세션 399·403 선례).
    """
    missing = sorted(_fe_job_type_keys() - set(JOB_WORDS))
    assert not missing, f"알림 사전에 우리말 이름이 없는 작업: {missing}"


def test_fe_dict_covers_every_be_job_type():
    """반대 방향 — 알림만 알고 화면이 모르는 작업이 없어야 한다(양쪽 표기 통일)."""
    missing = sorted(set(JOB_WORDS) - _fe_job_type_keys())
    assert not missing, f"화면 사전(crawl-job-labels.ts)에 없는 작업: {missing}"


def test_job_words_values_have_no_english():
    """우리말 이름에 영문이 섞이면 안 된다 (K-apt·data.go.kr 같은 고유명사만 예외).

    세션 407 이전 FE 라벨에는 "단지 상세 backfill APT" 처럼 영문이 남아 있었다.
    """
    allowed = ("K-apt", "data.go.kr")
    offenders = []
    for code, word in JOB_WORDS.items():
        stripped = word
        for a in allowed:
            stripped = stripped.replace(a, "")
        if re.search(r"[A-Za-z]{2,}", stripped):
            offenders.append((code, word))
    assert not offenders, f"우리말 이름에 영문이 남아 있다: {offenders}"


def test_job_words_unknown_code_falls_back_to_raw():
    """사전에 없는 코드는 원문 그대로 — 알림 자체가 안 나가는 것보다 낫다."""
    assert job_words("some_new_job") == "some_new_job"
    assert job_words(None) == ""


# ── ② 에러 번역 ──────────────────────────────────────────────────────────
#
# 아래 원문은 전부 prod crawl_jobs.error_message 실측값이다(세션 407, 최근 14일 +
# monitor_alerts 22건). 지어낸 에러는 넣지 않는다 — 안 맞는 번역이 오해를 만든다.


def test_explain_error_translates_real_prod_errors():
    """실측 에러 5종이 전부 우리말 한 줄이 된다 (개발자 용어 0)."""
    cases = [
        "(psycopg2.errors.QueryCanceled) canceling statement due to statement timeout",
        '(psycopg2.errors.InvalidTextRepresentation) invalid input syntax for type integer: ""',
        "(psycopg2.OperationalError) SSL connection has been closed unexpectedly",
        "(psycopg2.errors.ForeignKeyViolation) insert or update on table violates foreign key",
        "CPMS 치명적 에러: CPMS API INFO-300: 일 요청 건수(1000건)를 초과하였습니다",
    ]
    for raw in cases:
        plain = explain_error(raw)
        assert "psycopg2" not in plain, plain
        assert "SQL" not in plain, plain
        assert re.search(r"[가-힣]", plain), f"우리말이 아니다: {plain}"
        assert plain.endswith("요."), f"설명 문장이 아니다: {plain}"


def test_explain_error_keeps_short_clue_for_unknown():
    """모르는 에러는 버리지 않고 앞부분만 짧게 남긴다 (원인 추적 단서 보존)."""
    plain = explain_error("완전히 새로운 종류의 문제 " + "x" * 300)
    assert plain.startswith("완전히 새로운 종류의 문제")
    assert len(plain) <= 90, f"너무 길다: {len(plain)}"


def test_explain_error_empty_is_empty():
    assert explain_error("") == ""
    assert explain_error(None) == ""


# ── ③ 저장된 옛 문장 되살리기 (render-time) ──────────────────────────────
#
# monitor_alerts.detail 에는 세션 407 이전 형식이 22건 남아 있다. 저장값은 건드리지
# 않고(되돌리기 안전) 발송 직전에만 바꾼다 — 사장님 결정(2026-09-15).


def test_plainify_legacy_failed_detail():
    """옛 실패 문장 → 영문 작업명·개발자 에러가 둘 다 사라진다."""
    legacy = (
        "field_drift_monitor 작업 1건 실패 — (psycopg2.errors.InvalidTextRepresentation) "
        'invalid input syntax for type integer: ""'
    )
    out = plainify_detail(legacy)
    assert "field_drift_monitor" not in out, out
    assert "psycopg2" not in out, out
    assert "정보 안 채워지면 알림" in out, out


def test_plainify_legacy_stale_detail():
    """옛 마비 문장 → 'running 상태' 같은 영문 상태어까지 우리말로."""
    legacy = "article_detail_backfill 작업 1건이 1시간 넘게 running 상태 — 마비 의심"
    out = plainify_detail(legacy)
    assert "article_detail_backfill" not in out, out
    assert "running" not in out, out
    assert "빠진 정보 뒤늦게 채우기" in out, out


def test_plainify_translates_known_error_even_when_korean_mixed():
    """우리말이 섞여 있어도 아는 에러면 번역한다.

    ⚠ 세션 407 구현 중 실제로 샜던 경로다 — 판정 순서를 '이미 우리말인가' 먼저로
    두면 "(s378 수동 정정) 14:54 statement timeout 연쇄 크래시" 처럼 우리말이 섞인
    문장이 '사람 말'로 오판돼 statement timeout 이 그대로 나갔다.
    """
    legacy = "official_price 작업 1건 실패 — (s378 수동 정정) 14:54 statement timeout 연쇄 크래시"
    out = plainify_detail(legacy)
    assert "statement timeout" not in out, out
    assert "정부 공시가격 받기" in out, out


def test_plainify_leaves_already_plain_tail_alone():
    """이미 우리말 안내인 꼬리는 건드리지 않는다 (마비 의심 등)."""
    out = plainify_detail("crawl_details 작업 1건이 1시간 넘게 돌고 있는 상태 — 마비 의심")
    assert "마비 의심" in out, out


def test_plainify_freshness_status_word():
    """신선도 색 코드(red)도 우리말로."""
    out = plainify_detail("매물 데이터 미축적 (신선도 red, 마지막 갱신 09-12 19:29)")
    assert "red" not in out, out
    assert "한참 안 들어옴" in out, out


def test_plainify_new_format_not_double_translated():
    """세션 407 이후 새 형식은 이미 우리말이라 내용이 바뀌지 않는다 (이중 변환 방지).

    단 **꼬리 마침표 하나는 의도적으로 떼어낸다** — 이 문장 뒤에 해소 알림이
    " — 정상으로 돌아왔습니다." 를 이어 붙이므로, 마침표가 남으면 문장 한가운데
    마침표가 박힌다("…멈췄어요. — 정상으로 돌아왔습니다."). 세션 407 렌더 실측으로
    발견해 plainify_detail ④ 단계에서 처리한다.
    """
    new = "정보 안 채워지면 알림 작업 1건 실패 — 저장된 값의 모양이 예상과 달라 계산하다 멈췄어요."
    out = plainify_detail(new)
    assert out == new.rstrip("."), out
    # 내용 자체는 그대로 — 단어가 다시 번역되거나 사라지지 않는다
    assert "정보 안 채워지면 알림" in out and "계산하다 멈췄어요" in out


def test_plainify_empty():
    assert plainify_detail("") == ""
    assert plainify_detail(None) == ""


# ── ④ 상태·행동 문구 ─────────────────────────────────────────────────────


def test_status_words_covers_all_freshness_states():
    """신선도 4상태 전부 우리말 (freshness._status 의 값 영역)."""
    for code in ("red", "yellow", "green", "unknown"):
        assert re.search(r"[가-힣]", status_words(code)), code


def test_action_words_tell_owner_what_they_can_do():
    """행동 안내는 사장님이 실제로 할 수 있는 것이어야 한다.

    옛 문구는 "크롤링 로그 확인 — 네이버 응답·서버 상태 점검" 처럼 개발자가 할 일이라
    알림을 읽어도 할 수 있는 게 없었다. 전부 'Claude 에게 알려주세요' 로 끝난다.
    """
    for kind in ("crawl_failed", "crawl_failed_burst", "crawl_stale", "freshness"):
        line = action_words(kind)
        assert "Claude" in line, f"{kind}: 무엇을 하면 되는지가 없다 — {line}"
        assert "로그" not in line, f"{kind}: 개발자용 행동이 남아 있다 — {line}"
