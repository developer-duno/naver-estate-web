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

실행: python -m pytest tests/test_deps_es256.py -v
"""

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

import deps

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
