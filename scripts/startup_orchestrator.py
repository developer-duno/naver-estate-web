"""
Windows 시작 시 백엔드 서버 자동화 스크립트.

실행 흐름:
1. 기존 프로세스 정리 (port 8002)
2. 백엔드 서버 시작 → health check 대기
3. Watchdog (프로세스 생존 감시, 죽으면 재시작)

터널(api.2u.pe.kr)은 nssm 서비스 cloudflared-naver 가 전담한다 (2026-05-31 naver↔sangse
공유 터널 분리). 이 스크립트는 cloudflared 를 더 이상 건드리지 않는다 — taskkill /IM
cloudflared.exe 가 lawbrain·luxury·sangse 등 다른 프로젝트 터널까지 죽이던 크로스킬 해소.
"""

import logging
import os
import socket
import subprocess
import sys
import time
import urllib.request

from log_rotation import rotate_backend_log
from pid_util import pid_is_live_orchestrator
from telegram_notify import notify

# ── 경로 상수 ──────────────────────────────────────────────
PYTHON_EXE = r"C:\Users\user\AppData\Local\Programs\Python\Python312\python.exe"
PROJECT_ROOT = r"D:\naver-estate-web"
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
SCRIPTS_DIR = os.path.join(PROJECT_ROOT, "scripts")
BACKEND_PORT = 8002
STARTUP_LOG = os.path.join(SCRIPTS_DIR, "startup.log")
BACKEND_LOG = os.path.join(SCRIPTS_DIR, "backend.log")
PID_FILE = os.path.join(SCRIPTS_DIR, "orchestrator.pid")

# ── 타임아웃 설정 ──────────────────────────────────────────
INITIAL_DELAY = 10  # 부팅 후 네트워크 안정화 대기 (초)
BACKEND_HEALTH_TIMEOUT = 30
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
    """기존 port 8002 프로세스 정리 (cloudflared 는 nssm 서비스 cloudflared-naver 전담)."""
    logger.info("기존 프로세스 정리 중...")

    # port 8002 점유 프로세스 종료 + 포트 해제 대기 (naver 한정 — 다른 프로젝트 무영향)
    _kill_port(BACKEND_PORT)
    logger.info("프로세스 정리 완료")


def _is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("localhost", port)) == 0


def start_backend() -> subprocess.Popen:
    """백엔드 서버 시작, Popen 객체 반환."""
    logger.info("백엔드 서버 시작 중...")
    backend_log_path = rotate_backend_log(SCRIPTS_DIR)
    log_file = open(backend_log_path, "w", encoding="utf-8")
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


def watchdog(backend_proc: subprocess.Popen):
    """백엔드 생존 감시 + 자동 재시작. 다운 감지 시 텔레그램 알림.
    터널은 nssm 서비스 cloudflared-naver 가 자체 watchdog 으로 감시한다."""
    logger.info("Watchdog 시작 (30초 간격 감시)")
    backend_fail_count = 0
    health_fail_count = 0
    critical_alerted = False  # 🚨 5회 연속 실패 알림 1회만 — 복구 시 리셋

    while True:
        time.sleep(WATCHDOG_INTERVAL)

        # 백엔드 다운 판정: 프로세스 종료 OR health 무응답 연속 3회
        proc_dead = backend_proc.poll() is not None
        health_ok = _check_health()
        if health_ok:
            health_fail_count = 0
        else:
            health_fail_count += 1

        if proc_dead or health_fail_count >= 3:
            backend_fail_count += 1
            reason = "프로세스 종료" if proc_dead else "health 무응답 (hang)"
            logger.warning(f"백엔드 다운 감지 ({reason}) — 재시작 (연속 실패: {backend_fail_count})")
            notify(f"⚠ 백엔드 다운 ({reason}) — 재시작 시도 중")

            _kill_port(BACKEND_PORT)
            backend_proc = start_backend()
            health_fail_count = 0
            if not wait_for_backend():
                logger.error("백엔드 재시작 실패")
                notify("⚠ 백엔드 재시작 실패")
                if backend_fail_count >= 5:
                    logger.error("연속 5회 재시작 실패 — 60초 대기 후 재시도")
                    if not critical_alerted:
                        notify("\U0001f6a8 백엔드 5회 연속 재시작 실패 — 점검 필요")
                        critical_alerted = True
                    time.sleep(60)
                    backend_fail_count = 0
                continue
            backend_fail_count = 0
            critical_alerted = False
            notify("✅ 백엔드 복구 완료")
        else:
            backend_fail_count = 0


def _check_health() -> bool:
    """백엔드 /health 응답 확인 (3초 타임아웃)."""
    try:
        resp = urllib.request.urlopen(
            f"http://localhost:{BACKEND_PORT}/health", timeout=3
        )
        return resp.status == 200
    except Exception:
        return False


def _check_already_running() -> bool:
    """PID 파일로 중복 실행 방지. 이미 실행 중인 python 오케스트레이터면 True 반환.

    재부팅 후 OS 가 옛 PID 를 무관한 프로세스에 재할당하는 PID 재활용 함정 차단 —
    pid_util.pid_is_live_orchestrator 가 tasklist CSV 의 PID 컬럼 + 이미지명을
    정확 비교한다 (substring 오판·재활용 오판 둘 다 차단)."""
    if os.path.exists(PID_FILE):
        try:
            old_pid = int(open(PID_FILE).read().strip())
            result = subprocess.run(
                ["tasklist", "/FI", f"PID eq {old_pid}", "/FO", "CSV", "/NH"],
                capture_output=True, text=True, timeout=5,
            )
            if pid_is_live_orchestrator(result.stdout, old_pid):
                logger.error(f"오케스트레이터가 이미 실행 중 (PID: {old_pid}). 종료합니다.")
                return True
            logger.warning(f"PID 파일의 {old_pid} 은(는) 오케스트레이터가 아님 — 무시하고 진행")
        except (OSError, ValueError, subprocess.TimeoutExpired):
            pass  # PID 파일 손상 — 무시하고 진행
    # 현재 PID 기록
    with open(PID_FILE, "w") as f:
        f.write(str(os.getpid()))
    return False


def main():
    logger.info("=" * 60)
    logger.info("서버 자동 시작 스크립트 실행")
    logger.info("=" * 60)

    # 0. 중복 실행 방지
    if _check_already_running():
        sys.exit(0)

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

    logger.info("백엔드 정상 시작 완료! (터널은 nssm 서비스 cloudflared-naver 전담)")

    # 4. Watchdog
    watchdog(backend_proc)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.info("사용자에 의해 중단됨")
    except Exception:
        logger.exception("치명적 오류 발생")
        sys.exit(1)
    finally:
        # 내 PID 가 기록된 경우에만 삭제 — 중복 실행 감지로 일찍 종료할 때
        # 살아있는 인스턴스의 PID 파일을 지우지 않도록.
        try:
            with open(PID_FILE) as f:
                mine = f.read().strip() == str(os.getpid())
            if mine:
                os.remove(PID_FILE)
        except (OSError, ValueError):
            pass
