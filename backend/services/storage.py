"""Supabase Storage 연동 — 자격증 서류 업로드/Signed URL 생성"""

import logging
import os

import httpx

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
BUCKET = "license-docs"
SIGNED_URL_EXPIRY = 3600  # 1시간


def _headers() -> dict:
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    }


def upload_license_doc(path: str, content: bytes, content_type: str) -> dict:
    """Supabase Storage에 파일 업로드. 동일 경로 존재 시 덮어쓰기(upsert)."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        logger.warning("[storage] SUPABASE_URL/SERVICE_KEY 미설정")
        return {"success": False, "message": "스토리지 미설정"}

    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}"
    headers = {**_headers(), "Content-Type": content_type, "x-upsert": "true"}

    try:
        resp = httpx.put(url, content=content, headers=headers, timeout=30)
        if resp.status_code in (200, 201):
            return {"success": True, "message": "업로드 완료"}
        logger.warning("[storage] 업로드 실패: %d %s", resp.status_code, resp.text[:200])
        return {"success": False, "message": f"업로드 실패 ({resp.status_code})"}
    except Exception:
        logger.warning("[storage] 업로드 오류", exc_info=True)
        return {"success": False, "message": "스토리지 연결 실패"}


def create_signed_url(path: str) -> str | None:
    """Supabase Storage signed URL 생성 (1시간 만료). 실패 시 None."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY or not path:
        return None

    url = f"{SUPABASE_URL}/storage/v1/object/sign/{BUCKET}/{path}"
    headers = {**_headers(), "Content-Type": "application/json"}

    try:
        resp = httpx.post(
            url, json={"expiresIn": SIGNED_URL_EXPIRY}, headers=headers, timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            signed = data.get("signedURL", "")
            if signed:
                return f"{SUPABASE_URL}/storage/v1{signed}"
        logger.warning("[storage] signed URL 실패: %d", resp.status_code)
    except Exception:
        logger.warning("[storage] signed URL 오류", exc_info=True)
    return None
