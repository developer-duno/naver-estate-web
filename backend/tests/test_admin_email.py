"""ADMIN_EMAIL 환경변수 테스트 — 미설정 시 관리자 접근 차단 (fail-closed)
실행: python -m pytest tests/test_admin_email.py -v
"""
import jwt

from db.models import UserProfile

JWT_SECRET = "test-secret-key-for-testing-only"


def _token(sub, email=None):
    return jwt.encode(
        {"sub": sub, "aud": "authenticated", "email": email or f"{sub}@test.com"},
        JWT_SECRET,
        algorithm="HS256",
    )


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _make_profile(db, uid, role="user", status="approved", email=None):
    p = UserProfile(user_id=uid, email=email or f"{uid}@test.com", role=role, status=status)
    db.add(p)
    db.commit()
    return p


class TestAdminEmailEnv:
    """ADMIN_EMAILS 환경변수와 관리자 권한 부여 검증"""

    def test_empty_admin_email_blocks_admin_access(self, client, db):
        """ADMIN_EMAIL 빈 문자열 → 관리자 접근 차단"""
        import deps

        original = deps.ADMIN_EMAILS
        deps.ADMIN_EMAILS = set()  # 빈 set으로 설정

        try:
            _make_profile(db, "u1", role="user")
            res = client.get("/api/admin/users", headers=_auth(_token("u1")))
            assert res.status_code == 403
        finally:
            deps.ADMIN_EMAILS = original

    def test_matching_admin_email_grants_access(self, client, db):
        """ADMIN_EMAIL에 포함된 이메일 → 관리자 접근 허용"""
        import deps

        original = deps.ADMIN_EMAILS
        deps.ADMIN_EMAILS = {"admin@test.com"}

        try:
            _make_profile(db, "a1", role="admin", email="admin@test.com")
            res = client.get("/api/admin/users", headers=_auth(_token("a1", email="admin@test.com")))
            assert res.status_code == 200
        finally:
            deps.ADMIN_EMAILS = original

    def test_non_matching_admin_email_blocked(self, client, db):
        """ADMIN_EMAIL에 없는 이메일 → 관리자 접근 차단 (role=user)"""
        import deps

        original = deps.ADMIN_EMAILS
        deps.ADMIN_EMAILS = {"other@test.com"}

        try:
            _make_profile(db, "u2", role="user", email="u2@test.com")
            res = client.get("/api/admin/users", headers=_auth(_token("u2", email="u2@test.com")))
            assert res.status_code == 403
        finally:
            deps.ADMIN_EMAILS = original

    def test_first_login_no_auto_admin_when_empty(self, client, db):
        """ADMIN_EMAILS 빈 set → 첫 로그인 시 자동 관리자 부여 안 됨"""
        import deps

        original = deps.ADMIN_EMAILS
        deps.ADMIN_EMAILS = set()

        try:
            # 프로필이 없는 새 사용자 — 첫 로그인
            token = _token("new1", email="new1@test.com")
            # 아무 인증 필요 엔드포인트 호출 (프로필 자동 생성 트리거)
            res = client.get("/api/admin/users", headers=_auth(token))
            # 관리자 아님 → 403
            assert res.status_code == 403

            # DB에서 생성된 프로필 확인
            profile = db.get(UserProfile, "new1")
            assert profile is not None
            assert profile.role == "user"  # admin이 아님
        finally:
            deps.ADMIN_EMAILS = original
