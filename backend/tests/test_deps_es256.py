"""Supabase ES256(비대칭 서명키) 토큰의 JWKS 로컬 검증 회귀 테스트.

근본 원인 (세션 395, 2026-09-09 라이브 실측):
- Supabase 서명키가 비대칭(EC P-256/ES256)으로 전환돼 모든 액세스 토큰이 ES256 으로 발급.
- deps._ALLOWED_ALGORITHMS 가 ["HS256"] 뿐이라 매 요청이 알고리즘 불일치 경고 후
  _verify_token_remote(GoTrue /auth/v1/user)로 폴백 → 요청당 +0.3~0.5초 (7분간 40회 관측).

수정: ES256 은 JWKS 공개키로 로컬 검증(10분 캐시), HS256(레거시 secret) 경로는 유지,
원격 호출은 최후 폴백으로만 남긴다.

⚠ 뮤테이션 검증 (세션 395 수행): deps._verify_token_local 의 ES256 분기를 제거하면
  test_es256_token_verified_locally_without_remote_call 이 FAIL 한다(로컬 검증이 None 을
  반환해 user_id 단언에서 깨짐)를 확인 후 코드 복원. 즉 이 테스트는 결함을 실제로 본다.
  네거티브 캐시도 동일 — _unknown_kid_seen.get(...) 조회 줄을 제거하면
  test_unknown_kid_negative_cache_skips_second_lookup 이 FAIL(조회 2회)한다.

실행: python -m pytest tests/test_deps_es256.py -v
"""

import base64
import hashlib
import hmac
import json
import logging
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

import deps
from services.cache import TTLCache

JWT_SECRET = "test-secret-key-for-testing-only"  # conftest 가 env 로 고정한 값과 동일


def _ec_keypair():
    """ES256(P-256) 키쌍 생성 → (private_key, public_key)"""
    priv = ec.generate_private_key(ec.SECP256R1())
    return priv, priv.public_key()


def _es256_token(priv, sub="es256-user", aud="authenticated", email="es256@test.com"):
    """ES256 으로 서명한 Supabase 액세스 토큰 모사 (kid 헤더 포함)."""
    return jwt.encode(
        {"sub": sub, "aud": aud, "email": email},
        priv,
        algorithm="ES256",
        headers={"kid": "test-kid-1ceb2299"},
    )


class _FakeSigningKey:
    """PyJWKClient.get_signing_key_from_jwt() 반환값 모사 (.key 만 사용됨)."""

    def __init__(self, key):
        self.key = key


class _FakeJWKSClient:
    def __init__(self, key=None, exc=None):
        self._key = key
        self._exc = exc
        self.calls = 0

    def get_signing_key_from_jwt(self, token):
        self.calls += 1
        if self._exc is not None:
            raise self._exc
        return _FakeSigningKey(self._key)


@pytest.fixture
def no_remote(monkeypatch):
    """httpx.get 호출을 감시 — 로컬 검증 성공 시 원격 호출이 0회여야 한다."""
    calls = []

    def _spy(*args, **kwargs):  # pragma: no cover - 호출되면 그 자체가 실패 신호
        calls.append(args)
        raise AssertionError("원격 검증(httpx.get)이 호출됨 — 로컬 검증이 실패했다는 뜻")

    monkeypatch.setattr(deps.httpx, "get", _spy)
    return calls


def test_es256_token_verified_locally_without_remote_call(monkeypatch, no_remote):
    """ES256 토큰이 JWKS 공개키로 로컬 검증되고, 원격 호출은 0회."""
    priv, pub = _ec_keypair()
    fake = _FakeJWKSClient(key=pub)
    monkeypatch.setattr(deps, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(deps, "_get_jwks_client", lambda: fake)

    result = deps._verify_token_local(_es256_token(priv))

    assert result is not None, "ES256 토큰이 로컬 검증돼야 한다 (원격 폴백 금지)"
    assert result["user_id"] == "es256-user"
    assert result["email"] == "es256@test.com"
    assert fake.calls == 1
    assert no_remote == []


def test_es256_wrong_key_returns_none(monkeypatch):
    """다른 EC 키로 서명된 토큰 → 서명 검증 실패로 None (원격 폴백 대상)."""
    priv, _ = _ec_keypair()
    _, other_pub = _ec_keypair()
    monkeypatch.setattr(deps, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(deps, "_get_jwks_client", lambda: _FakeJWKSClient(key=other_pub))

    assert deps._verify_token_local(_es256_token(priv)) is None


def test_es256_jwks_client_error_returns_none(monkeypatch):
    """JWKS 조회가 PyJWKClientError 를 던지면 None 반환 + 예외 전파 없음."""
    priv, _ = _ec_keypair()
    err = jwt.PyJWKClientError("Unable to find a signing key that matches")
    monkeypatch.setattr(deps, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(deps, "_get_jwks_client", lambda: _FakeJWKSClient(exc=err))

    assert deps._verify_token_local(_es256_token(priv)) is None


def test_es256_jwks_network_error_returns_none(monkeypatch):
    """JWKS 조회 중 네트워크 예외(urllib 등)도 삼키고 None (원격 폴백 유지)."""
    priv, _ = _ec_keypair()
    monkeypatch.setattr(deps, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(
        deps, "_get_jwks_client", lambda: _FakeJWKSClient(exc=TimeoutError("timed out"))
    )

    assert deps._verify_token_local(_es256_token(priv)) is None


def test_es256_without_supabase_url_returns_none(monkeypatch):
    """SUPABASE_URL 미설정이면 ES256 은 즉시 None (JWKS 주소를 만들 수 없음)."""
    priv, _ = _ec_keypair()
    monkeypatch.setattr(deps, "SUPABASE_URL", "")
    monkeypatch.setattr(deps, "_jwks_client", None)

    assert deps._verify_token_local(_es256_token(priv)) is None


def test_hs256_token_still_verified_locally(no_remote):
    """회귀: 레거시 HS256 토큰(secret)은 그대로 로컬 통과 — 원격 호출 0회."""
    token = jwt.encode(
        {"sub": "hs256-user", "aud": "authenticated", "email": "hs256@test.com"},
        JWT_SECRET,
        algorithm="HS256",
    )

    result = deps._verify_token_local(token)

    assert result is not None
    assert result["user_id"] == "hs256-user"
    assert no_remote == []


def test_rs256_token_rejected(monkeypatch):
    """회귀: 허용 목록에 없는 alg(RS256 등)는 여전히 None."""
    # 서명 자체는 무의미 — 헤더 alg 검사에서 걸러지는지만 본다.
    unsigned = jwt.encode({"sub": "x", "aud": "authenticated"}, JWT_SECRET, algorithm="HS256")
    header, payload, sig = unsigned.split(".")
    import base64
    import json

    rs_header = base64.urlsafe_b64encode(
        json.dumps({"alg": "RS256", "typ": "JWT"}).encode()
    ).rstrip(b"=").decode()
    tampered = f"{rs_header}.{payload}.{sig}"

    assert deps._verify_token_local(tampered) is None


def test_allowed_algorithms_contains_both():
    """허용 알고리즘 목록 자체를 단언 — 한쪽이 지워지면 즉시 실패."""
    assert deps._ALLOWED_ALGORITHMS == ["HS256", "ES256"]


@pytest.fixture(autouse=True)
def _clear_unknown_kid_cache(monkeypatch):
    """테스트 간 네거티브 캐시 격리 — 앞 테스트의 실패 kid 가 뒤 테스트를 오염시키지 않게."""
    monkeypatch.setattr(deps, "_unknown_kid_seen", TTLCache(ttl=deps._UNKNOWN_KID_TTL, max_size=64))


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def test_alg_confusion_es256_public_key_as_hmac_secret_rejected(monkeypatch, no_remote):
    """(f) alg confusion: ES256 공개키 PEM 을 HMAC 비밀로 쓴 HS256 위조 토큰 → None.

    고전적 공격: 공개키는 누구나 얻을 수 있으므로, 서버가 alg 를 토큰 헤더만 보고
    믿으면 공격자가 '공개키를 비밀번호처럼' 써서 서명한 HS256 토큰으로 인증을 통과한다.
    우리 코드는 alg 별로 검증 키를 고정(HS256=서버 secret)하므로 통과하면 안 된다.
    PyJWT 의 encode 는 PEM 을 HMAC 비밀로 쓰는 것을 InvalidKeyError 로 막으므로,
    공격자와 동일하게 base64 + HMAC 으로 직접 서명해 만든다.
    """
    priv, pub = _ec_keypair()
    pem = pub.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT", "kid": "test-kid-1ceb2299"}).encode())
    payload = _b64(json.dumps({"sub": "attacker", "aud": "authenticated", "email": "a@evil.test"}).encode())
    sig = _b64(hmac.new(pem, f"{header}.{payload}".encode(), hashlib.sha256).digest())
    forged = f"{header}.{payload}.{sig}"

    # JWKS 는 정상 동작한다고 가정 — 그래도 통과하면 안 된다(HS256 은 secret 경로 고정).
    monkeypatch.setattr(deps, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(deps, "_get_jwks_client", lambda: _FakeJWKSClient(key=pub))

    assert deps._verify_token_local(forged) is None, "공개키를 HMAC 비밀로 쓴 위조 토큰이 통과했다"
    assert no_remote == []


def test_unknown_kid_negative_cache_skips_second_lookup(monkeypatch):
    """(g) 네거티브 캐시: 같은 미지 kid 로 2회 호출해도 JWKS 조회는 1회.

    PyJWKClient 는 kid 미스마다 캐시를 우회해 JWKS 를 강제 재조회하므로,
    네거티브 캐시가 없으면 랜덤 kid 요청이 Supabase JWKS 호출로 증폭된다.
    """
    priv, _ = _ec_keypair()
    err = jwt.PyJWKClientError("Unable to find a signing key that matches")
    fake = _FakeJWKSClient(exc=err)
    monkeypatch.setattr(deps, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(deps, "_get_jwks_client", lambda: fake)

    token = _es256_token(priv)
    assert deps._verify_token_local(token) is None
    assert fake.calls == 1
    # 2회차: 네거티브 캐시가 히트해 JWKS 조회 자체를 건너뛴다
    assert deps._verify_token_local(token) is None
    assert fake.calls == 1, "미지 kid 재요청이 JWKS 를 재조회했다 (증폭 차단 실패)"


def test_unknown_kid_negative_cache_expires(monkeypatch):
    """(g-2) TTL 만료 후에는 다시 조회한다 — 키 회전 직후 새 kid 가 영구 차단되면 안 됨.

    ttl=0 캐시를 주입해 '만료된 상태'를 결정론적으로 재현(시간 대기 없음).
    """
    priv, _ = _ec_keypair()
    fake = _FakeJWKSClient(exc=jwt.PyJWKClientError("no matching key"))
    monkeypatch.setattr(deps, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(deps, "_get_jwks_client", lambda: fake)
    monkeypatch.setattr(deps, "_unknown_kid_seen", TTLCache(ttl=0, max_size=64))

    token = _es256_token(priv)
    assert deps._verify_token_local(token) is None
    assert deps._verify_token_local(token) is None
    assert fake.calls == 2, "TTL 만료 후에도 조회를 건너뛰면 회전된 새 kid 가 영구 차단된다"


def test_unknown_kid_without_kid_header_uses_sentinel_cache(monkeypatch):
    """(c) kid 헤더가 없는 ES256 토큰도 고정 센티널 키로 네거티브 캐시된다.

    ⚠ 이 테스트는 세션 395 사후검증에서 **정정**됐다. 옛 버전
    (test_unknown_kid_without_kid_header_not_cached)은 kid 없는 토큰이 캐시되지 **않는** 것을
    정답으로 단언했는데, 그게 바로 결함이었다 — kid 를 일부러 생략한 토큰을 반복해 보내면
    매 요청이 get_signing_key_from_jwt 로 흘러 JWKS 강제 재조회를 유발한다(네거티브 캐시가
    막으려던 증폭이 그대로 뚫림). Supabase 는 kid 없는 토큰을 발급하지 않으므로 정상 토큰이
    센티널에 걸릴 위험은 없다. (testing.md §"결함 수정 시 — 통과하던 테스트가 결함을 박제")

    ⚠ 뮤테이션 검증: deps._NO_KID_SENTINEL 을 쓰던 자리를 옛 코드(`header.get("kid") or ""`
    + `if token_kid and ...`)로 되돌리면 이 테스트가 FAIL(calls == 2)함을 확인 후 복원.
    """
    priv, _ = _ec_keypair()
    fake = _FakeJWKSClient(exc=jwt.PyJWKClientError("no kid"))
    monkeypatch.setattr(deps, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(deps, "_get_jwks_client", lambda: fake)

    # kid 헤더 없는 ES256 토큰
    token = jwt.encode({"sub": "no-kid", "aud": "authenticated"}, priv, algorithm="ES256")
    assert deps._verify_token_local(token) is None
    assert fake.calls == 1
    assert deps._verify_token_local(token) is None
    assert fake.calls == 1, "kid 없는 토큰의 재요청이 JWKS 를 재조회했다 (센티널 캐시 사각)"
    assert deps._unknown_kid_seen.get(deps._NO_KID_SENTINEL) is not None


def test_network_error_not_negative_cached(monkeypatch):
    """(g-4) 네트워크 예외는 kid 문제가 아니므로 네거티브 캐시에 넣지 않는다."""
    priv, _ = _ec_keypair()
    fake = _FakeJWKSClient(exc=TimeoutError("timed out"))
    monkeypatch.setattr(deps, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(deps, "_get_jwks_client", lambda: fake)

    token = _es256_token(priv)
    assert deps._verify_token_local(token) is None
    assert deps._verify_token_local(token) is None
    assert fake.calls == 2, "일시적 네트워크 장애가 kid 를 영구(60s) 차단했다"


# ---------------------------------------------------------------------------
# 세션 395 사후검증 — clock skew leeway + 로그 값 정화
# ---------------------------------------------------------------------------


def test_es256_future_iat_within_leeway_verified_locally(monkeypatch, no_remote):
    """(a) iat 가 미래(+20초)인 ES256 토큰도 leeway 60초 안이면 로컬 검증 통과 (원격 0회).

    라이브 근거 (2026-09-09 02:02~16:30 backend.log): Supabase 발급 서버 시계가 우리 집
    서버보다 수 초 앞서 "The token is not yet valid (iat)" 가 약 58분 간격(토큰 갱신 직후
    첫 요청)으로 10건 발생했고, 각각 직후 httpx GET /auth/v1/user 원격 폴백이 뒤따랐다.

    ⚠ 뮤테이션 검증 (세션 395 수행): deps._JWT_LEEWAY_SECONDS 를 0 으로 바꾸면 이 테스트가
      FAIL(로컬 검증이 None 반환) 함을 확인 후 60 으로 복원. 즉 이 테스트는 결함을 실제로 본다.
    """
    priv, pub = _ec_keypair()
    fake = _FakeJWKSClient(key=pub)
    monkeypatch.setattr(deps, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(deps, "_get_jwks_client", lambda: fake)

    future_iat = datetime.now(timezone.utc) + timedelta(seconds=20)
    token = jwt.encode(
        {
            "sub": "skew-user",
            "aud": "authenticated",
            "email": "skew@test.com",
            "iat": future_iat,
            "nbf": future_iat,
            "exp": future_iat + timedelta(hours=1),
        },
        priv,
        algorithm="ES256",
        headers={"kid": "test-kid-1ceb2299"},
    )

    result = deps._verify_token_local(token)

    assert result is not None, "clock skew(iat +20초)로 로컬 검증이 실패했다 — leeway 미적용"
    assert result["user_id"] == "skew-user"
    assert no_remote == []


def test_hs256_future_iat_within_leeway_verified_locally(no_remote):
    """(b) HS256(레거시 secret) 경로도 같은 leeway 를 받는다 — 두 분기 공통 적용 확인."""
    future_iat = datetime.now(timezone.utc) + timedelta(seconds=20)
    token = jwt.encode(
        {
            "sub": "hs256-skew",
            "aud": "authenticated",
            "email": "hs256skew@test.com",
            "iat": future_iat,
            "nbf": future_iat,
            "exp": future_iat + timedelta(hours=1),
        },
        JWT_SECRET,
        algorithm="HS256",
    )

    result = deps._verify_token_local(token)

    assert result is not None, "HS256 분기에 leeway 가 빠져 clock skew 로 원격 폴백된다"
    assert result["user_id"] == "hs256-skew"
    assert no_remote == []


def test_iat_beyond_leeway_still_rejected(monkeypatch, no_remote):
    """(a-2) leeway 를 넘는 미래 iat(+10분)는 여전히 거부 — 무제한 허용이 아님을 고정."""
    priv, pub = _ec_keypair()
    monkeypatch.setattr(deps, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(deps, "_get_jwks_client", lambda: _FakeJWKSClient(key=pub))

    far_future = datetime.now(timezone.utc) + timedelta(minutes=10)
    token = jwt.encode(
        {
            "sub": "far-future",
            "aud": "authenticated",
            "iat": far_future,
            "nbf": far_future,
            "exp": far_future + timedelta(hours=1),
        },
        priv,
        algorithm="ES256",
        headers={"kid": "test-kid-1ceb2299"},
    )

    assert deps._verify_token_local(token) is None


def test_log_value_sanitized_no_newline_injection(monkeypatch, caplog):
    """(d) 공격자 제어 kid 의 개행이 로그에 그대로 나가지 않는다 (로그 위조 차단).

    kid 는 토큰 헤더에서 온 값이라 개행을 넣으면 가짜 로그 줄을 만들어낼 수 있다.
    정화 후에도 원래 내용(INJECTED)은 같은 줄에 남아 조사 가능해야 한다.

    ⚠ 뮤테이션 검증 (세션 395 수행): _safe_log_value 를 항등 함수(`return str(v)`)로 바꾸면
      이 테스트가 FAIL(메시지에 개행 포함) 함을 확인 후 복원.
    """
    priv, _ = _ec_keypair()
    fake = _FakeJWKSClient(exc=jwt.PyJWKClientError("no matching key"))
    monkeypatch.setattr(deps, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(deps, "_get_jwks_client", lambda: fake)

    token = jwt.encode(
        {"sub": "attacker", "aud": "authenticated"},
        priv,
        algorithm="ES256",
        headers={"kid": "abc\nINJECTED"},
    )

    with caplog.at_level(logging.DEBUG, logger="deps"):
        assert deps._verify_token_local(token) is None
        # 2회차: 네거티브 캐시 히트 경로(debug 로그)도 같은 값을 찍는다
        assert deps._verify_token_local(token) is None

    messages = [rec.getMessage() for rec in caplog.records]
    assert messages, "로그 레코드가 캡처되지 않았다"
    for msg in messages:
        assert "\n" not in msg, f"로그 메시지에 개행이 그대로 들어갔다: {msg!r}"
        assert "\r" not in msg
    kid_msgs = [m for m in messages if "INJECTED" in m]
    assert kid_msgs, "kid 값이 로그에 전혀 안 나타났다 (조사 가능성 상실)"
    assert any("abcINJECTED" in m for m in kid_msgs), (
        f"정화 후 kid 가 한 줄로 붙어 있어야 한다: {kid_msgs!r}"
    )


def test_safe_log_value_truncates_long_input():
    """(d-2) 과도하게 긴 kid 는 64자로 절단 — 로그 폭탄 방지."""
    assert deps._safe_log_value("x" * 500) == "x" * 64
    assert deps._safe_log_value("a\r\nb\tc") == "ab c"


# ---------------------------------------------------------------------------
# 세션 395 맹점 검증 — JWKS 부팅 자가진단 (_check_jwks_reachable)
# ---------------------------------------------------------------------------


class _FakeJWKSet:
    """PyJWKClient.get_jwk_set() 반환값 모사 (.keys 길이만 사용됨)."""

    def __init__(self, n):
        self.keys = [object()] * n


class _FakeJWKSetClient:
    def __init__(self, jwk_set=None, exc=None):
        self._jwk_set = jwk_set
        self._exc = exc
        self.calls = 0

    def get_jwk_set(self, refresh=False):
        self.calls += 1
        if self._exc is not None:
            raise self._exc
        return self._jwk_set


def test_check_jwks_reachable_logs_key_count(monkeypatch, caplog):
    """JWKS 도달 성공 → info 로그에 키 개수. 네트워크 실호출 없음(monkeypatch)."""
    fake = _FakeJWKSetClient(jwk_set=_FakeJWKSet(2))
    monkeypatch.setattr(deps, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(deps, "_get_jwks_client", lambda: fake)

    with caplog.at_level(logging.INFO, logger="deps"):
        deps._check_jwks_reachable()

    assert fake.calls == 1
    msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.INFO]
    assert any("JWKS 도달 확인" in m and "2" in m for m in msgs), msgs
    assert not [r for r in caplog.records if r.levelno >= logging.ERROR]


def test_check_jwks_reachable_logs_error_and_swallows(monkeypatch, caplog):
    """JWKS 도달 실패 → error 로그만 남기고 예외를 전파하지 않는다 (기동 차단 금지)."""
    fake = _FakeJWKSetClient(exc=TimeoutError("timed out"))
    monkeypatch.setattr(deps, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(deps, "_get_jwks_client", lambda: fake)

    with caplog.at_level(logging.ERROR, logger="deps"):
        deps._check_jwks_reachable()  # 예외가 새어 나오면 이 줄에서 테스트가 깨진다

    errors = [r.getMessage() for r in caplog.records if r.levelno >= logging.ERROR]
    assert any("JWKS 도달 실패" in m for m in errors), errors


def test_check_jwks_reachable_skips_without_url(monkeypatch, caplog):
    """SUPABASE_URL 미설정이면 조회 자체를 건너뛴다 (불필요한 네트워크·에러 로그 방지)."""
    fake = _FakeJWKSetClient(jwk_set=_FakeJWKSet(1))
    monkeypatch.setattr(deps, "SUPABASE_URL", "")
    monkeypatch.setattr(deps, "_get_jwks_client", lambda: fake)

    with caplog.at_level(logging.INFO, logger="deps"):
        deps._check_jwks_reachable()

    assert fake.calls == 0
    assert not [r for r in caplog.records if r.levelno >= logging.ERROR]
