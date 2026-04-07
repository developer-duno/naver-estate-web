"""
Windows 시작 시 백엔드 서버 + Cloudflare 터널 + Vercel 배포 자동화 스크립트.

실행 흐름:
1. 기존 프로세스 정리 (port 8002 + cloudflared)
2. 백엔드 서버 시작 → health check 대기
3. Cloudflare 터널 시작 → URL 추출
4. Vercel 환경변수 업데이트 + 배포
5. Watchdog (프로세스 생존 감시, 죽으면 재시작)
"""

import logging
import os
import re
import socket
import subprocess
import sys
import time
import urllib.request

# ── 경로 상수 ──────────────────────────────────────────────
PYTHON_EXE = r"C:\Users\user\AppData\Local\Programs\Python\Python312\python.exe"
CLOUDFLARED_EXE = r"C:\Users\user\AppData\Local\Microsoft\WinGet\Links\cloudflared.exe"
NPX_CMD = r"C:\Program Files\nodejs\npx.cmd"
PROJECT_ROOT = r"D:\cursor\naver-estate-web"
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
SCRIPTS_DIR = os.path.join(PROJECT_ROOT, "scripts")
BACKEND_PORT = 8002
STARTUP_LOG = os.path.join(SCRIPTS_DIR, "startup.log")
BACKEND_LOG = os.path.join(SCRIPTS_DIR, "backend.log")
CLOUDFLARED_LOG = os.path.join(SCRIPTS_DIR, "cloudflared.log")

# ── 타임아웃 설정 ──────────────────────────────────────────
INITIAL_DELAY = 10  # 부팅 후 네트워크 안정화 대기 (초)
BACKEND_HEALTH_TIMEOUT = 30
TUNNEL_URL_TIMEOUT = 60
WATCHDOG_INTERVAL = 30

# ── 로깅 설정 ──────────────────────────────────────────────
logger = logging.getLogger("startup")
logger.setLevel(logging.INFO)
fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")

fh = logging.FileHandler(STARTUP_LOG, encoding="utf-8")
fh.setFormatter(fmt)
logger.addHandler(fh)

ch = logging.StreamHandler()
ch.setFormatter(fmt)
logger.addHandler(ch)


def kill_existing_processes():
    """기존 cloudflared + port 8002 프로세스 정리."""
    logger.info("기존 프로세스 정리 중...")

    # cloudflared 종료
    subprocess.run(
        ["taskkill", "/F", "/IM", "cloudflared.exe"],
        capture_output=True,
        timeout=10,
    )

    # port 8002 점유 프로세스 종료 + 포트 해제 대기
    _kill_port(BACKEND_PORT)
    logger.info("프로세스 정리 완료")


def _is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("localhost", port)) == 0


def start_backend() -> subprocess.Popen:
    """백엔드 서버 시작, Popen 객체 반환."""
    logger.info("백엔드 서버 시작 중...")
    log_file = open(BACKEND_LOG, "w", encoding="utf-8")
    proc = subprocess.Popen(
        [PYTHON_EXE, "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", str(BACKEND_PORT)],
        cwd=BACKEND_DIR,
        stdout=log_file,
        stderr=subprocess.STDOUT,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )
    logger.info(f"백엔드 프로세스 시작됨 (PID: {proc.pid})")
    return proc


def wait_for_backend(timeout: int = BACKEND_HEALTH_TIMEOUT) -> bool:
    """백엔드 health check 대기."""
    logger.info(f"백엔드 health check 대기 (최대 {timeout}초)...")
    url = f"http://localhost:{BACKEND_PORT}/health"
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            resp = urllib.request.urlopen(url, timeout=3)
            if resp.status == 200:
                logger.info("백엔드 health check 성공")
                return True
        except Exception:
            pass
        time.sleep(2)
    logger.error("백엔드 health check 타임아웃")
    return False


def start_tunnel() -> subprocess.Popen:
    """Cloudflare 터널 시작, Popen 객체 반환."""
    logger.info("Cloudflare 터널 시작 중...")

    # 이전 로그 파일 초기화 (오래된 URL 매칭 방지)
    with open(CLOUDFLARED_LOG, "w", encoding="utf-8") as f:
        f.write("")

    proc = subprocess.Popen(
        [CLOUDFLARED_EXE, "tunnel", "--url", f"http://localhost:{BACKEND_PORT}", "--logfile", CLOUDFLARED_LOG],
        creationflags=subprocess.CREATE_NO_WINDOW,
    )
    logger.info(f"터널 프로세스 시작됨 (PID: {proc.pid})")
    return proc


def extract_tunnel_url(proc: subprocess.Popen, timeout: int = TUNNEL_URL_TIMEOUT) -> str:
    """cloudflared 로그 파일에서 trycloudflare.com URL 추출."""
    logger.info(f"터널 URL 추출 대기 (최대 {timeout}초)...")
    pattern = re.compile(r"(https://[a-zA-Z0-9-]+\.trycloudflare\.com)")
    deadline = time.time() + timeout

    while time.time() < deadline:
        if proc.poll() is not None:
            logger.error(f"터널 프로세스가 종료됨 (exit code: {proc.returncode})")
            raise RuntimeError("cloudflared 프로세스 비정상 종료")

        try:
            with open(CLOUDFLARED_LOG, "r", encoding="utf-8") as f:
                content = f.read()
            match = pattern.search(content)
            if match:
                url = match.group(1)
                logger.info(f"터널 URL 추출 성공: {url}")
                return url
        except Exception:
            pass
        time.sleep(3)

    raise RuntimeError("터널 URL 추출 타임아웃")


def update_vercel_env(tunnel_url: str):
    """Vercel 환경변수 NEXT_PUBLIC_API_URL 업데이트."""
    logger.info(f"Vercel 환경변수 업데이트: {tunnel_url}")

    # 기존 변수 삭제 (없어도 에러 무시)
    subprocess.run(
        [NPX_CMD, "vercel", "env", "rm", "NEXT_PUBLIC_API_URL", "production", "-y"],
        cwd=PROJECT_ROOT,
        capture_output=True,
        timeout=60,
    )
    logger.info("기존 NEXT_PUBLIC_API_URL 삭제 완료")

    # 새 변수 추가
    result = subprocess.run(
        [NPX_CMD, "vercel", "env", "add", "NEXT_PUBLIC_API_URL", "production", "--value", tunnel_url],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        timeout=60,
    )
    if result.returncode != 0:
        logger.error(f"Vercel env add 실패: {result.stderr}")
        raise RuntimeError("Vercel 환경변수 추가 실패")
    logger.info("NEXT_PUBLIC_API_URL 추가 완료")


def deploy_vercel():
    """Vercel 프로덕션 배포."""
    logger.info("Vercel 프로덕션 배포 시작...")
    result = subprocess.run(
        [NPX_CMD, "vercel", "--prod", "--yes"],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        timeout=600,
    )
    if result.returncode != 0:
        logger.error(f"Vercel 배포 실패: {result.stderr}")
        raise RuntimeError("Vercel 배포 실패")
    logger.info(f"Vercel 배포 완료")


def _kill_port(port: int):
    """특정 포트를 점유 중인 프로세스를 강제 종료하고 해제 대기."""
    if not _is_port_in_use(port):
        return
    try:
        result = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        for line in result.stdout.splitlines():
            if f":{port}" in line and "LISTENING" in line:
                pid = line.split()[-1]
                logger.info(f"포트 {port} 점유 PID {pid} 강제 종료")
                subprocess.run(
                    ["taskkill", "/F", "/PID", pid],
                    capture_output=True,
                    timeout=10,
                )
    except Exception as e:
        logger.warning(f"포트 {port} 정리 실패: {e}")

    # 포트 해제 대기 (최대 10초)
    for _ in range(20):
        if not _is_port_in_use(port):
            return
        time.sleep(0.5)
    logger.warning(f"포트 {port} 해제 대기 타임아웃")


def watchdog(backend_proc: subprocess.Popen, tunnel_proc: subprocess.Popen):
    """프로세스 생존 감시 + 자동 재시작."""
    logger.info("Watchdog 시작 (30초 간격 감시)")
    backend_fail_count = 0

    while True:
        time.sleep(WATCHDOG_INTERVAL)

        # 백엔드 체크
        if backend_proc.poll() is not None:
            backend_fail_count += 1
            logger.warning(f"백엔드 프로세스 종료 감지 — 재시작 (연속 실패: {backend_fail_count})")

            # 포트 정리 후 재시작
            _kill_port(BACKEND_PORT)
            backend_proc = start_backend()
            if not wait_for_backend():
                logger.error("백엔드 재시작 실패")
                if backend_fail_count >= 5:
                    logger.error("연속 5회 재시작 실패 — 60초 대기 후 재시도")
                    time.sleep(60)
                    backend_fail_count = 0
                continue
            backend_fail_count = 0
        else:
            backend_fail_count = 0

        # 터널 체크
        if tunnel_proc.poll() is not None:
            logger.warning("터널 프로세스 종료 감지 — 재시작 + Vercel 재배포")
            tunnel_proc = start_tunnel()
            try:
                new_url = extract_tunnel_url(tunnel_proc)
                update_vercel_env(new_url)
                deploy_vercel()
            except Exception as e:
                logger.error(f"터널 재시작 후 Vercel 업데이트 실패: {e}")


def main():
    logger.info("=" * 60)
    logger.info("서버 자동 시작 스크립트 실행")
    logger.info("=" * 60)

    # 1. 네트워크 안정화 대기
    logger.info(f"{INITIAL_DELAY}초 대기 (네트워크 안정화)...")
    time.sleep(INITIAL_DELAY)

    # 2. 기존 프로세스 정리
    kill_existing_processes()

    # 3. 백엔드 시작
    backend_proc = start_backend()
    if not wait_for_backend():
        logger.error("백엔드 시작 실패 — 스크립트 종료")
        sys.exit(1)

    # 4. 터널 시작 + URL 추출
    tunnel_proc = start_tunnel()
    tunnel_url = extract_tunnel_url(tunnel_proc)

    # 5. Vercel 업데이트 + 배포
    update_vercel_env(tunnel_url)
    deploy_vercel()

    logger.info("모든 서비스 정상 시작 완료!")

    # 6. Watchdog
    watchdog(backend_proc, tunnel_proc)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        logger.exception("치명적 오류 발생")
        sys.exit(1)
