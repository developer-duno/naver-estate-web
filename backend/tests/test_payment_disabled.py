"""결제 기능 잠금 게이트 — PAYMENT_ENABLED 꺼짐이면 결제 API 7종 전부 403 (세션 400)

무료 전환 기간에 요금제 화면(FE)을 잠그더라도 결제 API 는 URL 직접 호출로 열려 있었다.
main.py 가 payment·billing 라우터를 include 할 때 require_payment_enabled 게이트를
걸었고, 이 파일이 그 게이트의 실동작을 단언한다.

- 꺼진 상태: 7 엔드포인트 전부 403 + 사용자 노출 문구
- 401 이 아니라 403: 라우터 레벨 dependencies 가 엔드포인트 인증 의존성보다 먼저
  평가되는 순서를 단언 (비로그인·잘못된 토큰이어도 403)
- 켠 상태: 기존 동작 회귀 (비로그인 → 401)
- 스케줄러: 꺼짐이면 billing_charge 잡 미등록 / 켜면 등록

⚠ conftest.py 는 PAYMENT_ENABLED=true 로 전역 봉쇄한다(기존 결제 테스트 4파일 보호).
따라서 "꺼진 상태"는 이 파일에서 patch.object 로 만든다 — 게이트가 모듈 속성을
호출 시점에 읽도록 설계돼 있어(config/payment_flags.py docstring) 앱 재구성 없이 먹는다.

실행: python -m pytest tests/test_payment_disabled.py -v
"""

from unittest.mock import patch

import jwt
import pytest

from config import payment_flags
from crawler import scheduler as sched_mod

JWT_SECRET = "test-secret-key-for-testing-only"

# (method, path, json) — main.py 가 게이트를 건 결제 API 전량.
#   payment.router  → /api/payment: prepare·complete·webhook
#   billing.router  → /api/payment/billing: prepare·register·list·cancel
PAYMENT_ENDPOINTS = [
    ("post", "/api/payment/prepare", {"plan": "pro_30d"}),
    ("post", "/api/payment/complete", {"paymentId": "pay-1"}),
    ("post", "/api/payment/webhook", {"type": "Transaction.Paid"}),
    ("post", "/api/payment/billing/prepare", {"plan": "pro_30d"}),
    ("post", "/api/payment/billing/register", {"billingKey": "bk-1", "plan": "pro_30d"}),
    ("get", "/api/payment/billing/list", None),
    ("post", "/api/payment/billing/cancel", {"billingKey": "bk-1"}),
]


def _call(client, method, path, body, headers=None):
    """엔드포인트 1건 호출 (GET 은 body 없음)."""
    if method == "get":
        return client.get(path, headers=headers)
    return client.post(path, json=body, headers=headers)


def _auth(sub="u1"):
    """유효한 서명의 Bearer 헤더 — 게이트가 인증보다 먼저인지 보려면 '진짜' 토큰이 필요."""
    token = jwt.encode(
        {"sub": sub, "aud": "authenticated", "email": f"{sub}@test.com"},
        JWT_SECRET, algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


def _disabled():
    """PAYMENT_ENABLED=False 로 만드는 patch 컨텍스트."""
    return patch.object(payment_flags, "PAYMENT_ENABLED", False)


# ── 꺼진 상태: 7 엔드포인트 전부 403 ──


@pytest.mark.parametrize("method,path,body", PAYMENT_ENDPOINTS)
def test_all_payment_endpoints_403_when_disabled(client, method, path, body):
    """PAYMENT_ENABLED 꺼짐 → 결제 API 7종 전부 403 (뒷문 차단)"""
    with _disabled():
        res = _call(client, method, path, body)
    assert res.status_code == 403, f"{method.upper()} {path} → {res.status_code}"


@pytest.mark.parametrize("method,path,body", PAYMENT_ENDPOINTS)
def test_disabled_detail_message(client, method, path, body):
    """403 본문에 사용자 노출 문구가 담긴다 (FE·라이브 curl 이 이 문구로 판정)"""
    with _disabled():
        res = _call(client, method, path, body)
    assert res.json()["detail"] == "결제 기능이 비활성화되어 있습니다"


# ── 403 vs 401 순서 단언 (게이트가 인증보다 먼저) ──


@pytest.mark.parametrize("method,path,body", PAYMENT_ENDPOINTS)
def test_gate_precedes_auth_no_token(client, method, path, body):
    """비로그인이어도 401 이 아니라 403 — 라우터 dependencies 가 인증보다 먼저 평가됨.

    이 순서가 뒤집히면 "결제가 잠겼다"는 사실 대신 "로그인하세요"가 노출돼,
    라이브 판정(curl → 403)도 함께 깨진다.
    """
    with _disabled():
        res = _call(client, method, path, body)
    # 403 단언 하나로 "401 이 아님"까지 함의된다 — 뒤에 `!= 401` 을 덧붙이면 항상 참인
    # 죽은 단언이라 아무것도 보장하지 않는다(세션 400 적대검증 LOW). 이 테스트가 지키는
    # 것은 문구가 아니라 **의존성 평가 순서**이므로, detail 까지 함께 확인한다.
    assert res.status_code == 403
    assert res.json()["detail"] == payment_flags.PAYMENT_DISABLED_DETAIL


@pytest.mark.parametrize("method,path,body", PAYMENT_ENDPOINTS)
def test_gate_precedes_auth_bad_token(client, method, path, body):
    """서명이 깨진 토큰이어도 403 (인증 검증에 도달하기 전에 게이트가 막는다)"""
    with _disabled():
        res = _call(client, method, path, body,
                    headers={"Authorization": "Bearer not-a-real-token"})
    assert res.status_code == 403


@pytest.mark.parametrize("method,path,body", PAYMENT_ENDPOINTS)
def test_gate_precedes_auth_valid_token(client, method, path, body):
    """유효한 토큰이어도 403 — 로그인 사용자에게도 결제 진입이 닫혀 있다"""
    with _disabled():
        res = _call(client, method, path, body, headers=_auth())
    assert res.status_code == 403


# ── 켠 상태: 기존 동작 회귀 ──


def test_enabled_restores_existing_401(client):
    """PAYMENT_ENABLED 켜짐 → 게이트 통과 후 기존 인증 동작(비로그인 401) 복귀.

    게이트가 "항상 403" 이 아니라 토글에 따라 열린다는 것, 즉 매출 시작 시
    PAYMENT_ENABLED=true 한 줄로 결제가 되살아난다는 것을 단언한다.
    (conftest 가 이미 true 라 patch 없이 그대로 호출 — 기존 test_billing_router.py:109
     '비로그인 prepare → 401' 과 같은 기대값)
    """
    assert payment_flags.PAYMENT_ENABLED is True, "conftest 의 PAYMENT_ENABLED=true 봉쇄가 깨졌다"
    res = client.post("/api/payment/billing/prepare", json={"plan": "pro_30d"})
    assert res.status_code == 401


def test_enabled_list_not_403(client):
    """켠 상태의 GET /billing/list 는 403(게이트)이 아니다 — 인증 단계까지 도달"""
    res = client.get("/api/payment/billing/list")
    assert res.status_code != 403
    assert res.status_code == 401


# ── 스케줄러: 자동결제 잡 등록 여부 ──


def test_billing_charge_job_absent_when_payment_disabled():
    """PAYMENT_ENABLED 꺼짐 → 04:50 자동결제 잡 미등록.

    결제 API 가 403 인데 새벽 자동결제만 도는 모순 차단
    (tests/test_scheduler_jobs.py 의 토글 검증 패턴 답습).
    """
    with patch.object(sched_mod, "BILLING_AUTO_CHARGE_ENABLED", True), \
         patch.object(sched_mod, "PAYMENT_ENABLED", False):
        scheduler = sched_mod.create_scheduler()
    assert "billing_charge" not in {job.id for job in scheduler.get_jobs()}


def test_billing_charge_job_registered_when_both_enabled():
    """두 토글 모두 켜짐 → 자동결제 잡 등록 (켤 때 정상 복귀)"""
    with patch.object(sched_mod, "BILLING_AUTO_CHARGE_ENABLED", True), \
         patch.object(sched_mod, "PAYMENT_ENABLED", True):
        scheduler = sched_mod.create_scheduler()
    assert "billing_charge" in {job.id for job in scheduler.get_jobs()}


def test_billing_charge_job_absent_when_billing_toggle_off():
    """PAYMENT_ENABLED 가 켜져 있어도 BILLING_AUTO_CHARGE_ENABLED 꺼짐이면 미등록.

    기존 토글 의미가 보존되는지 확인 (새 토글이 기존 토글을 무력화하지 않는다).
    """
    with patch.object(sched_mod, "BILLING_AUTO_CHARGE_ENABLED", False), \
         patch.object(sched_mod, "PAYMENT_ENABLED", True):
        scheduler = sched_mod.create_scheduler()
    assert "billing_charge" not in {job.id for job in scheduler.get_jobs()}


# ── 관리자 화면 표시: 잡 미등록과 "비활성" 표시가 일치해야 한다 ──


def _billing_row(client) -> dict:
    """관리자 scheduler-status 를 **실제로 호출**해 자동결제 행을 돌려준다.

    ⚠ 판정 규칙을 테스트에서 재현하면 안 된다 — 재현본은 라우트가 그 규칙을 잃어도
    통과한다(세션 400 에서 실제로 그 뮤테이션이 안 잡혀 이 방식으로 다시 씀).
    """
    with patch("crawler.scheduler.get_scheduler", return_value=None):
        res = client.get("/api/admin/scheduler-status", headers=_auth("pay_admin"))
    assert res.status_code == 200, res.text
    rows = [j for j in res.json()["jobs"] if j["scheduler_job_id"] == "billing_charge"]
    assert len(rows) == 1, "자동결제 행이 화면에 1개가 아니다"
    return rows[0]


def test_admin_screen_shows_billing_charge_disabled_when_payment_off(client, db, monkeypatch):
    """PAYMENT_ENABLED 꺼짐 → 관리자 스케줄러 화면의 자동결제 행이 `enabled=False`.

    잡이 미등록인데 화면이 "활성 · 매일 04:50"으로 보이면 사장님이 무료 전환 기간 내내
    "자동결제가 돈다"고 오판한다(세션 400 적대검증 HIGH). 그 화면은 등록된 잡이 아니라
    SCHEDULER_JOB_META 사전을 순회하므로 행 자체는 남고(그래서 "사라진다"가 아니라
    "비활성으로 보인다"가 맞다), 활성 판정은 META 의 `env_extra` 로 두 토글의 AND 를 본다.

    ⚠ conftest 가 PAYMENT_ENABLED=true 로 env 를 봉쇄하므로 여기서 명시적으로 끈다
    (화면 판정은 모듈 상수가 아니라 os.getenv 를 읽는다 — 잡 등록 경로와 다른 축이다).
    ⚠ 라우트를 실제 호출한다 — META 항목이든 판정 루프든 어느 쪽이 사라져도 FAIL 한다.
    """
    from db.models import UserProfile

    db.add(UserProfile(user_id="pay_admin", email="pay_admin@test.com", role="admin", status="approved"))
    db.commit()

    monkeypatch.setenv("BILLING_AUTO_CHARGE_ENABLED", "true")
    monkeypatch.setenv("PAYMENT_ENABLED", "false")
    assert _billing_row(client)["enabled"] is False, (
        "결제가 꺼졌는데 화면이 자동결제를 '활성'으로 표시한다"
    )

    # 켜면 정상 복귀 — 판정이 한 방향으로 굳어 있지 않은지 확인(양방향)
    monkeypatch.setenv("PAYMENT_ENABLED", "true")
    assert _billing_row(client)["enabled"] is True

    # 기존 토글 의미 보존 — 결제를 켜도 자동결제 토글이 꺼지면 비활성
    monkeypatch.setenv("BILLING_AUTO_CHARGE_ENABLED", "false")
    assert _billing_row(client)["enabled"] is False
