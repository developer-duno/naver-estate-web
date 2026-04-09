"""공인중개사 검증 라우터 테스트 — /api/verify/submit, /api/verify/status, /api/verify/upload-license
실행: python -m pytest tests/test_verify_router.py -v
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


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _valid_body():
    return {
        "business_number": "1234567890",
        "representative_name": "홍길동",
        "office_name": "길동부동산",
    }


# ── 인증 검증 ──


def test_submit_no_auth_401(client):
    """인증 없이 POST → 401"""
    assert client.post("/api/verify/submit", json=_valid_body()).status_code == 401


def test_status_no_auth_401(client):
    """인증 없이 GET → 401"""
    assert client.get("/api/verify/status").status_code == 401


# ── 입력 검증 ──


def test_submit_invalid_biz_422(client, db):
    """10자리 아닌 사업자번호 → 422"""
    _make_profile(db, "u1")
    body = _valid_body()
    body["business_number"] = "12345"
    res = client.post("/api/verify/submit", json=body, headers=_auth(_token("u1")))
    assert res.status_code == 422


def test_submit_missing_name_422(client, db):
    """빈 대표자명 → 422"""
    _make_profile(db, "u1")
    body = _valid_body()
    body["representative_name"] = "   "
    res = client.post("/api/verify/submit", json=body, headers=_auth(_token("u1")))
    assert res.status_code == 422


# ── 신청 흐름 ──


@patch("routers.verify.verify_business_registration")
def test_submit_pending(mock_biz, client, db):
    """사업자등록 확인 실패 → status=pending"""
    mock_biz.return_value = {"valid": False, "message": "유효하지 않음"}
    _make_profile(db, "u1")

    res = client.post("/api/verify/submit", json=_valid_body(), headers=_auth(_token("u1")))
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "pending"
    assert data["auto_approved"] is False
    assert data["business_verified"] is False


@patch("routers.verify.verify_business_registration")
def test_submit_auto_approved(mock_biz, client, db):
    """사업자등록 확인 성공 → 자동 승인, role=expert"""
    mock_biz.return_value = {"valid": True, "message": "사업자등록 확인됨"}
    _make_profile(db, "u1")

    res = client.post("/api/verify/submit", json=_valid_body(), headers=_auth(_token("u1")))
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "approved"
    assert data["auto_approved"] is True
    assert data["business_verified"] is True

    # DB에서 profile.role 확인
    profile = db.get(UserProfile, "u1")
    assert profile.role == "expert"
    assert profile.status == "approved"


@patch("routers.verify.verify_business_registration")
def test_submit_duplicate_409(mock_biz, client, db):
    """중복 신청 → 409"""
    mock_biz.return_value = {"valid": False, "message": "실패"}
    _make_profile(db, "u1")

    # 첫 번째 신청
    client.post("/api/verify/submit", json=_valid_body(), headers=_auth(_token("u1")))
    # 두 번째 신청
    res = client.post("/api/verify/submit", json=_valid_body(), headers=_auth(_token("u1")))
    assert res.status_code == 409


@patch("routers.verify.verify_business_registration")
def test_submit_resubmit_after_rejection(mock_biz, client, db):
    """거부 후 재신청 → pending으로 리셋"""
    mock_biz.return_value = {"valid": False, "message": "실패"}
    _make_profile(db, "u1")

    # 거부 상태 직접 생성
    v = AgentVerification(
        user_id="u1",
        business_number="1234567890",
        representative_name="홍길동",
        verification_status="rejected",
        rejection_reason="서류 불충분",
    )
    db.add(v)
    db.commit()

    # 재신청
    res = client.post("/api/verify/submit", json=_valid_body(), headers=_auth(_token("u1")))
    assert res.status_code == 200
    assert res.json()["status"] == "pending"

    # DB에서 rejection 초기화 확인
    db.refresh(v)
    assert v.verification_status == "pending"
    assert v.rejection_reason is None


# ── 상태 조회 ──


def test_status_no_submission(client, db):
    """미신청 → submitted=false"""
    _make_profile(db, "u1")
    res = client.get("/api/verify/status", headers=_auth(_token("u1")))
    assert res.status_code == 200
    assert res.json()["submitted"] is False


def test_status_pending(client, db):
    """pending 상태 조회"""
    _make_profile(db, "u1")
    db.add(AgentVerification(
        user_id="u1",
        business_number="1234567890",
        representative_name="홍길동",
        verification_status="pending",
    ))
    db.commit()

    res = client.get("/api/verify/status", headers=_auth(_token("u1")))
    data = res.json()
    assert data["submitted"] is True
    assert data["verification_status"] == "pending"
    assert data["business_verified"] is False
    assert data["license_doc_uploaded"] is False


@patch("routers.verify.verify_business_registration")
def test_status_approved(mock_biz, client, db):
    """approved 상태 + business_verified 확인"""
    mock_biz.return_value = {"valid": True, "message": "확인됨"}
    _make_profile(db, "u1")

    # 자동 승인으로 생성
    client.post("/api/verify/submit", json=_valid_body(), headers=_auth(_token("u1")))

    res = client.get("/api/verify/status", headers=_auth(_token("u1")))
    data = res.json()
    assert data["submitted"] is True
    assert data["verification_status"] == "approved"
    assert data["business_verified"] is True


# ── 자격증 서류 업로드 ──


def test_upload_no_verification_404(client, db):
    """검증 신청 없이 업로드 → 404"""
    _make_profile(db, "u1")
    res = client.post(
        "/api/verify/upload-license",
        files={"file": ("test.jpg", b"fake-image", "image/jpeg")},
        headers=_auth(_token("u1")),
    )
    assert res.status_code == 404


def test_upload_invalid_type_400(client, db):
    """허용되지 않는 파일 형식 → 400"""
    _make_profile(db, "u1")
    db.add(AgentVerification(
        user_id="u1", business_number="1234567890",
        representative_name="홍길동", verification_status="pending",
    ))
    db.commit()

    res = client.post(
        "/api/verify/upload-license",
        files={"file": ("test.txt", b"text content", "text/plain")},
        headers=_auth(_token("u1")),
    )
    assert res.status_code == 400


@patch("routers.verify.upload_license_doc")
def test_upload_success(mock_upload, client, db):
    """정상 업로드 → uploaded=True + license_doc_path 저장"""
    mock_upload.return_value = {"success": True, "message": "업로드 완료"}
    _make_profile(db, "u1")
    db.add(AgentVerification(
        user_id="u1", business_number="1234567890",
        representative_name="홍길동", verification_status="pending",
    ))
    db.commit()

    res = client.post(
        "/api/verify/upload-license",
        files={"file": ("license.jpg", b"fake-image-data", "image/jpeg")},
        headers=_auth(_token("u1")),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["uploaded"] is True
    assert "u1/license.jpg" in data["path"]

    # DB 확인
    v = db.query(AgentVerification).filter_by(user_id="u1").one()
    assert v.license_doc_path is not None


def test_status_with_license_doc(client, db):
    """자격증 서류 업로드 후 status에서 license_doc_uploaded=True"""
    _make_profile(db, "u1")
    db.add(AgentVerification(
        user_id="u1", business_number="1234567890",
        representative_name="홍길동", verification_status="pending",
        license_doc_path="u1/license.jpg",
    ))
    db.commit()

    res = client.get("/api/verify/status", headers=_auth(_token("u1")))
    data = res.json()
    assert data["license_doc_uploaded"] is True
