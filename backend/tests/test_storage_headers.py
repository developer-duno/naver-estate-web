"""storage._headers 열쇠 모양별 머리말 시험 (Supabase 새 secret 열쇠 전환 대비).

- 옛 JWT 모양(eyJ…) 열쇠는 apikey + Authorization Bearer 둘 다 (지금 동작 유지)
- 새 sb_secret_ 열쇠는 apikey 만 (Bearer 에 넣으면 플랫폼이 Invalid JWT 로 거부)
실제 네트워크 호출은 하지 않는다.
"""

from unittest.mock import MagicMock

from services import storage


def test_옛_JWT_열쇠는_apikey와_Bearer_둘_다(monkeypatch):
    # 이 시험이 보는 것: eyJ 로 시작하면 기존처럼 두 머리말이 같은 값으로 들어간다
    key = "eyJhbGciOiJIUzI1NiJ9.payload.signature"
    monkeypatch.setattr(storage, "SUPABASE_SERVICE_KEY", key)

    headers = storage._headers()

    assert headers["apikey"] == key
    assert headers["Authorization"] == f"Bearer {key}"


def test_새_secret_열쇠는_apikey만(monkeypatch):
    # 이 시험이 보는 것: sb_secret_ 열쇠는 apikey 만 있고 Authorization 키 자체가 없다
    key = "sb_secret_xxxxxxxxxxxxxxxx"
    monkeypatch.setattr(storage, "SUPABASE_SERVICE_KEY", key)

    headers = storage._headers()

    assert headers == {"apikey": key}
    assert "Authorization" not in headers


def test_업로드가_httpx에_넘기는_머리말에도_새_열쇠_규칙이_반영(monkeypatch):
    # 이 시험이 보는 것: upload_license_doc 이 실제로 보내는 headers 에 Authorization 이 없다
    key = "sb_secret_yyyyyyyyyyyyyyyy"
    monkeypatch.setattr(storage, "SUPABASE_SERVICE_KEY", key)
    monkeypatch.setattr(storage, "SUPABASE_URL", "https://example.supabase.co")
    fake_put = MagicMock(return_value=MagicMock(status_code=200, text=""))
    monkeypatch.setattr(storage.httpx, "put", fake_put)

    result = storage.upload_license_doc("a/b.pdf", b"x", "application/pdf")

    assert result["success"] is True
    sent = fake_put.call_args.kwargs["headers"]
    assert sent["apikey"] == key
    assert "Authorization" not in sent
    assert sent["x-upsert"] == "true"
