"""관리자 검증 심사 라우터 테스트 — /api/admin/verifications
실행: python -m pytest tests/test_admin_verify_router.py -v
"""

from unittest.mock import patch

from jose import jwt

from db.models import AgentVerification, UserProfile

JWT_SECRET = "test-secret-key-for-testing-only"


def _token(sub):
    return jwt.encode(
        {"sub": sub, "aud": "authenticated", "email": f"{sub}@test.com"},
        JWT_SECRET,
        algorithm="HS256",
    )


def _make_profile(db, uid, role="user", status="approved"):
    p = UserProfile(user_id=uid, email=f"{uid}@test.com", role=role, status=status)
    db.add(p)
    db.commit()
    return p


def _make_verification(db, user_id, status="pending", **kwargs):
    """검증 신청 레코드 생성 헬퍼"""
    v = AgentVerification(
        user_id=user_id,
        business_number=kwargs.get("business_number", "1234567890"),
        representative_name=kwargs.get("representative_name", "홍길동"),
        verification_status=status,
        **{k: v for k, v in kwargs.items() if k not in ("business_number", "representative_name")},
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── 인증/권한 검증 ──


def test_list_no_auth_401(client):
    """인증 없이 → 401"""
    assert client.get("/api/admin/verifications").status_code == 401


def test_list_user_403(client, db):
    """일반 유저 → 403"""
    _make_profile(db, "u1")
    res = client.get("/api/admin/verifications", headers=_auth(_token("u1")))
    assert res.status_code == 403


def test_list_admin_empty(client, db):
    """관리자 → 빈 목록 200"""
    _make_profile(db, "a1", role="admin")
    res = client.get("/api/admin/verifications", headers=_auth(_token("a1")))
    assert res.status_code == 200
    data = res.json()
    assert data["items"] == []
    assert data["total"] == 0


# ── 목록 조회 ──


def test_list_with_data(client, db):
    """데이터 조회 + 이메일 포함 확인"""
    _make_profile(db, "a1", role="admin")
    _make_profile(db, "u1")
    _make_verification(db, "u1")

    res = client.get("/api/admin/verifications", headers=_auth(_token("a1")))
    data = res.json()
    assert data["total"] == 1
    item = data["items"][0]
    assert item["user_id"] == "u1"
    assert item["email"] == "u1@test.com"
    assert item["business_number"] == "1234567890"
    assert item["representative_name"] == "홍길동"
    assert item["verification_status"] == "pending"


def test_list_filter_status(client, db):
    """status=pending 필터"""
    _make_profile(db, "a1", role="admin")
    _make_profile(db, "u1")
    _make_profile(db, "u2")
    _make_verification(db, "u1", status="pending")
    _make_verification(db, "u2", status="approved")

    res = client.get("/api/admin/verifications?status=pending", headers=_auth(_token("a1")))
    data = res.json()
    assert data["total"] == 1
    assert data["items"][0]["verification_status"] == "pending"


# ── 승인 ──


def test_approve(client, db):
    """승인 → verification_status=approved, role=expert"""
    _make_profile(db, "a1", role="admin")
    _make_profile(db, "u1")
    v = _make_verification(db, "u1")

    res = client.patch(f"/api/admin/verifications/{v.id}/approve", headers=_auth(_token("a1")))
    assert res.status_code == 200
    assert res.json()["status"] == "approved"

    # DB 확인
    db.refresh(v)
    assert v.verification_status == "approved"
    assert v.reviewed_by == "a1"
    profile = db.get(UserProfile, "u1")
    assert profile.role == "expert"


def test_approve_already_processed_409(client, db):
    """이미 승인된 건 재승인 → 409"""
    _make_profile(db, "a1", role="admin")
    _make_profile(db, "u1")
    v = _make_verification(db, "u1", status="approved")

    res = client.patch(f"/api/admin/verifications/{v.id}/approve", headers=_auth(_token("a1")))
    assert res.status_code == 409


def test_approve_404(client, db):
    """존재하지 않는 ID → 404"""
    _make_profile(db, "a1", role="admin")
    res = client.patch("/api/admin/verifications/9999/approve", headers=_auth(_token("a1")))
    assert res.status_code == 404


# ── 거부 ──


def test_reject(client, db):
    """거부 + reason 저장"""
    _make_profile(db, "a1", role="admin")
    _make_profile(db, "u1")
    v = _make_verification(db, "u1")

    res = client.patch(
        f"/api/admin/verifications/{v.id}/reject",
        json={"reason": "서류 불충분"},
        headers=_auth(_token("a1")),
    )
    assert res.status_code == 200
    assert res.json()["status"] == "rejected"

    db.refresh(v)
    assert v.verification_status == "rejected"
    assert v.rejection_reason == "서류 불충분"


def test_reject_empty_reason_400(client, db):
    """빈 사유 → 400"""
    _make_profile(db, "a1", role="admin")
    _make_profile(db, "u1")
    v = _make_verification(db, "u1")

    res = client.patch(
        f"/api/admin/verifications/{v.id}/reject",
        json={"reason": "   "},
        headers=_auth(_token("a1")),
    )
    assert res.status_code == 400


def test_reject_404(client, db):
    """존재하지 않는 ID → 404"""
    _make_profile(db, "a1", role="admin")
    res = client.patch(
        "/api/admin/verifications/9999/reject",
        json={"reason": "테스트"},
        headers=_auth(_token("a1")),
    )
    assert res.status_code == 404


# ── 이메일 알림 ──


@patch("services.email.send_email", return_value=True)
def test_approve_sends_email(mock_send, client, db):
    """승인 시 이메일 발송 호출"""
    _make_profile(db, "a1", role="admin")
    _make_profile(db, "u1")
    v = _make_verification(db, "u1")

    res = client.patch(f"/api/admin/verifications/{v.id}/approve", headers=_auth(_token("a1")))
    assert res.status_code == 200
    mock_send.assert_called_once()
    assert mock_send.call_args[0][0] == "u1@test.com"


@patch("services.email.send_email", return_value=True)
def test_reject_sends_email(mock_send, client, db):
    """거부 시 이메일 발송 호출 — 사유 포함"""
    _make_profile(db, "a1", role="admin")
    _make_profile(db, "u1")
    v = _make_verification(db, "u1")

    res = client.patch(
        f"/api/admin/verifications/{v.id}/reject",
        json={"reason": "서류 불충분"},
        headers=_auth(_token("a1")),
    )
    assert res.status_code == 200
    mock_send.assert_called_once()
    assert mock_send.call_args[0][0] == "u1@test.com"


@patch("services.email.send_email", return_value=False)
def test_approve_succeeds_even_if_email_fails(mock_send, client, db):
    """이메일 실패해도 승인 자체는 성공"""
    _make_profile(db, "a1", role="admin")
    _make_profile(db, "u1")
    v = _make_verification(db, "u1")

    res = client.patch(f"/api/admin/verifications/{v.id}/approve", headers=_auth(_token("a1")))
    assert res.status_code == 200
    assert res.json()["status"] == "approved"

    db.refresh(v)
    assert v.verification_status == "approved"


# ── 자격증 서류 URL ──


@patch("services.storage.create_signed_url", return_value="https://example.com/signed-url")
def test_list_includes_license_doc_url(mock_signed, client, db):
    """자격증 서류 업로드된 경우 license_doc_url 반환"""
    _make_profile(db, "a1", role="admin")
    _make_profile(db, "u1")
    _make_verification(db, "u1", license_doc_path="u1/license.jpg")

    res = client.get("/api/admin/verifications", headers=_auth(_token("a1")))
    data = res.json()
    assert data["items"][0]["license_doc_url"] == "https://example.com/signed-url"
    mock_signed.assert_called_once_with("u1/license.jpg")


def test_list_no_license_doc_url_none(client, db):
    """자격증 서류 미업로드 → license_doc_url=None"""
    _make_profile(db, "a1", role="admin")
    _make_profile(db, "u1")
    _make_verification(db, "u1")

    res = client.get("/api/admin/verifications", headers=_auth(_token("a1")))
    data = res.json()
    assert data["items"][0]["license_doc_url"] is None
