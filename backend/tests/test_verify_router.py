"""공인중개사 검증 라우터 테스트 — /api/verify/submit, /api/verify/status, /api/verify/upload-license
실행: python -m pytest tests/test_verify_router.py -v
"""

from unittest.mock import patch

import jwt

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
        "start_date": "19990602",  # 개업일자 — 국세청 validate 필수 (세션 304)
    }


# V-WORLD 중개사 대조 결과 — 매칭+영업중 (자동승인 케이스용, 세션 308 PR B)
_BROKER_MATCH = {
    "matched": True, "active": True, "status_code": "1",
    "status_name": "영업중", "jurirno": "나92200000-51", "office_name": "길동부동산",
}
_BROKER_NO_MATCH = {
    "matched": False, "active": False, "status_code": None,
    "status_name": None, "jurirno": None, "office_name": None,
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


def test_submit_missing_start_date_422(client, db):
    """개업일자 누락 → 422 (국세청 validate 필수, 세션 304)"""
    _make_profile(db, "u1")
    body = _valid_body()
    del body["start_date"]
    res = client.post("/api/verify/submit", json=body, headers=_auth(_token("u1")))
    assert res.status_code == 422


def test_submit_invalid_start_date_422(client, db):
    """8자리 아닌 개업일자 → 422"""
    _make_profile(db, "u1")
    body = _valid_body()
    body["start_date"] = "1999"
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


@patch("routers.verify.search_broker_office", return_value=_BROKER_MATCH)
@patch("routers.verify.check_business_status", return_value="01")
@patch("routers.verify.verify_business_registration")
def test_submit_auto_approved(mock_biz, mock_status, mock_broker, client, db):
    """사업자등록 확인 성공 + 영업중(01) + V-WORLD 중개사 매칭 → 자동 승인, role=expert"""
    mock_biz.return_value = {"valid": True, "message": "사업자등록 확인됨"}
    _make_profile(db, "u1")

    res = client.post("/api/verify/submit", json=_valid_body(), headers=_auth(_token("u1")))
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "approved"
    assert data["auto_approved"] is True
    assert data["business_verified"] is True

    # DB에서 profile.role + broker 컬럼 확인
    profile = db.get(UserProfile, "u1")
    assert profile.role == "expert"
    assert profile.status == "approved"
    v = db.query(AgentVerification).filter_by(user_id="u1").one()
    assert v.broker_verified is True
    assert v.broker_jurirno == "나92200000-51"
    assert v.broker_status == "영업중"


# ── 영업상태 게이트 (세션 305 PR A — 휴·폐업 차단) ──


@patch("routers.verify.check_business_status", return_value="02")
@patch("routers.verify.verify_business_registration")
def test_submit_status_closed_rejected(mock_biz, mock_status, client, db):
    """진위 통과 + 휴업(02) → rejected, role 미부여"""
    mock_biz.return_value = {"valid": True, "message": "사업자등록 확인됨"}
    _make_profile(db, "u1")

    res = client.post("/api/verify/submit", json=_valid_body(), headers=_auth(_token("u1")))
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "rejected"
    assert data["auto_approved"] is False
    assert data["business_status_code"] == "02"

    # DB: rejected + 사유 + role 미부여
    v = db.query(AgentVerification).filter_by(user_id="u1").one()
    assert v.verification_status == "rejected"
    assert v.rejection_reason is not None and "휴업" in v.rejection_reason
    assert db.get(UserProfile, "u1").role == "user"


@patch("routers.verify.check_business_status", return_value="03")
@patch("routers.verify.verify_business_registration")
def test_submit_status_terminated_rejected(mock_biz, mock_status, client, db):
    """진위 통과 + 폐업(03) → rejected"""
    mock_biz.return_value = {"valid": True, "message": "사업자등록 확인됨"}
    _make_profile(db, "u1")

    res = client.post("/api/verify/submit", json=_valid_body(), headers=_auth(_token("u1")))
    data = res.json()
    assert data["status"] == "rejected"
    assert data["business_status_code"] == "03"
    assert db.get(UserProfile, "u1").role == "user"


@patch("routers.verify.check_business_status", return_value="")
@patch("routers.verify.verify_business_registration")
def test_submit_status_unregistered_pending(mock_biz, mock_status, client, db):
    """진위 통과 + 미등록("") → pending(수동심사), role 미부여 (validate-status 모순)"""
    mock_biz.return_value = {"valid": True, "message": "사업자등록 확인됨"}
    _make_profile(db, "u1")

    res = client.post("/api/verify/submit", json=_valid_body(), headers=_auth(_token("u1")))
    data = res.json()
    assert data["status"] == "pending"
    assert data["auto_approved"] is False
    assert data["business_verified"] is True  # 진위는 통과
    assert db.get(UserProfile, "u1").role == "user"


@patch("routers.verify.search_broker_office", return_value=_BROKER_MATCH)
@patch("routers.verify.check_business_status", return_value=None)
@patch("routers.verify.verify_business_registration")
def test_submit_status_lookup_failed_auto_approved(mock_biz, mock_status, mock_broker, client, db):
    """진위 통과 + status 조회실패(None) + 중개사 매칭 → 자동승인 유지 (안전망 실패해도 진위·중개사 완료)"""
    mock_biz.return_value = {"valid": True, "message": "사업자등록 확인됨"}
    _make_profile(db, "u1")

    res = client.post("/api/verify/submit", json=_valid_body(), headers=_auth(_token("u1")))
    data = res.json()
    assert data["status"] == "approved"
    assert data["auto_approved"] is True
    assert db.get(UserProfile, "u1").role == "expert"


@patch("routers.verify.check_business_status")
@patch("routers.verify.verify_business_registration")
def test_submit_validate_failed_skips_status(mock_biz, mock_status, client, db):
    """진위 실패 → status 미조회(외부호출 절약), pending"""
    mock_biz.return_value = {"valid": False, "message": "유효하지 않음"}
    _make_profile(db, "u1")

    res = client.post("/api/verify/submit", json=_valid_body(), headers=_auth(_token("u1")))
    assert res.json()["status"] == "pending"
    mock_status.assert_not_called()


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


# ── V-WORLD 중개사 대조 게이트 (세션 308 PR B — 진짜 중개사무소 검증) ──


@patch("routers.verify.search_broker_office", return_value=_BROKER_NO_MATCH)
@patch("routers.verify.check_business_status", return_value="01")
@patch("routers.verify.verify_business_registration")
def test_submit_broker_no_match_pending(mock_biz, mock_status, mock_broker, client, db):
    """국세청 통과 + 영업중인데 V-WORLD 미매칭(식당·카페 등) → pending(자동승인 안 함)"""
    mock_biz.return_value = {"valid": True, "message": "사업자등록 확인됨"}
    _make_profile(db, "u1")

    res = client.post("/api/verify/submit", json=_valid_body(), headers=_auth(_token("u1")))
    data = res.json()
    assert data["status"] == "pending"
    assert data["auto_approved"] is False
    assert data["business_verified"] is True  # 국세청은 통과
    # role 미부여 + broker 미검증
    assert db.get(UserProfile, "u1").role == "user"
    v = db.query(AgentVerification).filter_by(user_id="u1").one()
    assert v.broker_verified is False
    assert v.broker_status == "국토부 미매칭"


@patch("routers.verify.search_broker_office")
@patch("routers.verify.check_business_status", return_value="01")
@patch("routers.verify.verify_business_registration")
def test_submit_broker_matched_but_closed_pending(mock_biz, mock_status, mock_broker, client, db):
    """V-WORLD 매칭됐으나 폐업 중개사 → pending (자동승인 안 함)"""
    mock_biz.return_value = {"valid": True, "message": "사업자등록 확인됨"}
    mock_broker.return_value = {
        "matched": True, "active": False, "status_code": "5",
        "status_name": "폐업", "jurirno": "나92...", "office_name": "길동부동산",
    }
    _make_profile(db, "u1")

    res = client.post("/api/verify/submit", json=_valid_body(), headers=_auth(_token("u1")))
    data = res.json()
    assert data["status"] == "pending"
    assert data["auto_approved"] is False
    assert db.get(UserProfile, "u1").role == "user"
    v = db.query(AgentVerification).filter_by(user_id="u1").one()
    assert v.broker_verified is False
    assert v.broker_status == "폐업"


@patch("routers.verify.search_broker_office", return_value=None)
@patch("routers.verify.check_business_status", return_value="01")
@patch("routers.verify.verify_business_registration")
def test_submit_broker_api_failure_pending(mock_biz, mock_status, mock_broker, client, db):
    """V-WORLD 조회 실패(None — 키 미설정·타임아웃) → pending (silent 자동승인 금지)"""
    mock_biz.return_value = {"valid": True, "message": "사업자등록 확인됨"}
    _make_profile(db, "u1")

    res = client.post("/api/verify/submit", json=_valid_body(), headers=_auth(_token("u1")))
    data = res.json()
    assert data["status"] == "pending"
    assert data["auto_approved"] is False
    assert db.get(UserProfile, "u1").role == "user"


def test_submit_missing_office_name_422(client, db):
    """중개사무소명 누락 → 422 (V-WORLD 대조 키 필수, 세션 308)"""
    _make_profile(db, "u1")
    body = _valid_body()
    del body["office_name"]
    res = client.post("/api/verify/submit", json=body, headers=_auth(_token("u1")))
    assert res.status_code == 422


# ── 연락처(phone) 수집 (세션 306 PR C1) ──


@patch("routers.verify.search_broker_office", return_value=_BROKER_MATCH)
@patch("routers.verify.check_business_status", return_value="01")
@patch("routers.verify.verify_business_registration")
def test_submit_phone_saved(mock_biz, mock_status, mock_broker, client, db):
    """연락처 입력 시 AgentVerification.phone 에 저장 (하이픈 제거)"""
    mock_biz.return_value = {"valid": True, "message": "사업자등록 확인됨"}
    _make_profile(db, "u1")

    body = _valid_body()
    body["phone"] = "010-1234-5678"
    res = client.post("/api/verify/submit", json=body, headers=_auth(_token("u1")))
    assert res.status_code == 200

    v = db.query(AgentVerification).filter_by(user_id="u1").one()
    assert v.phone == "01012345678"  # 하이픈 제거 후 저장


@patch("routers.verify.search_broker_office", return_value=_BROKER_MATCH)
@patch("routers.verify.check_business_status", return_value="01")
@patch("routers.verify.verify_business_registration")
def test_submit_phone_empty_ok(mock_biz, mock_status, mock_broker, client, db):
    """연락처 미입력(선택 입력) → 정상 처리, phone 은 None"""
    mock_biz.return_value = {"valid": True, "message": "사업자등록 확인됨"}
    _make_profile(db, "u1")

    # _valid_body() 는 phone 미포함 (선택 입력)
    res = client.post("/api/verify/submit", json=_valid_body(), headers=_auth(_token("u1")))
    assert res.status_code == 200

    v = db.query(AgentVerification).filter_by(user_id="u1").one()
    assert v.phone is None


def test_submit_phone_invalid_422(client, db):
    """형식 오류 연락처(숫자 외) → 422"""
    _make_profile(db, "u1")
    body = _valid_body()
    body["phone"] = "abc"
    res = client.post("/api/verify/submit", json=body, headers=_auth(_token("u1")))
    assert res.status_code == 422


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


@patch("routers.verify.search_broker_office", return_value=_BROKER_MATCH)
@patch("routers.verify.check_business_status", return_value="01")
@patch("routers.verify.verify_business_registration")
def test_status_approved(mock_biz, mock_status, mock_broker, client, db):
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
