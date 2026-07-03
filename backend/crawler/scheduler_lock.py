"""스케줄러 단일 인스턴스 파일락 (프로세스 간 중복 실행 차단).

배경: uvicorn 프로세스가 여러 개 뜨면 각 lifespan 이 create_scheduler().start() 를
호출해 같은 스케줄러 잡(크롤·결제·VACUUM 13개)을 중복 실행한다. APScheduler
max_instances=1 은 "한 스케줄러 안의 자기중복"만 막지 프로세스 간은 못 막는다.
이 모듈은 파일락으로 "스케줄러를 돌리는 backend 는 딱 하나"를 프로세스 간 보장한다.

설계(pid_util.py·log_rotation.py 선례 답습): 순수 로직 분리, import 부작용 0,
telegram·FileHandler 안 끌어옴. filelock 3.29.0 WindowsFileLock 은 프로세스가
급사(os._exit/SIGKILL)해도 OS 가 파일 핸들을 닫아 stale 락을 자동 해제한다
(세션 341 직접 실측 확인) — "재부팅해야 스케줄러 뜨는" 조용한 버그가 없다.

3-state 반환 규약 (호출처 lifespan 이 이걸로 스케줄러 시작 여부 판정):
- 락 비활성(SCHEDULER_FILELOCK_ENABLED=false, CI/테스트) → nullcontext sentinel
  (= 스케줄러 돌려라, release 는 no-op). None 아님 — false 를 None 으로 표현하면
  스케줄러가 스킵돼버리는 버그.
- 락 획득 성공 → FileLock 객체 (= 스케줄러 돌림).
- 락 경합(filelock.Timeout, 이미 다른 backend 보유) → None (= 스케줄러 스킵).
- 그 외 예외(디스크 꽉참·권한 등, 경합이 아닌 진짜 에러) → logger.error 로 남기고
  None (앱은 살림, "경합"과 "진짜 에러"를 로그로 구분).
"""

import contextlib
import logging
import os

logger = logging.getLogger("crawler.scheduler_lock")

# 락 파일 = orchestrator.pid 와 같은 scripts/ 디렉토리 (backend/ 의 부모/scripts).
_SCRIPTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "scripts")
LOCK_PATH = os.path.join(_SCRIPTS_DIR, "scheduler.lock")


def _filelock_enabled() -> bool:
    """SCHEDULER_FILELOCK_ENABLED (기본 true). false 면 락 비활성 (CI/테스트 격리)."""
    return os.getenv("SCHEDULER_FILELOCK_ENABLED", "true").strip().lower() != "false"


def acquire_scheduler_lock(lock_path: str | None = None):
    """스케줄러 단일 인스턴스 락 획득 시도. 3-state 반환 (모듈 docstring 참조).

    반환:
        - nullcontext (락 비활성) 또는 획득한 FileLock → 진실성 True, 스케줄러 돌림
        - None → 락 경합 또는 진짜 에러, 스케줄러 스킵

    호출처는 `if lock is None: 스킵 / else: 스케줄러 시작` 후 종료 시 `lock.release()`.
    nullcontext·FileLock 모두 release() 를 안전하게 지원(sentinel 은 no-op).
    """
    if not _filelock_enabled():
        logger.info("SCHEDULER_FILELOCK_ENABLED=false — 파일락 비활성 (스케줄러 시작)")
        return _NoopLock()

    path = lock_path or LOCK_PATH

    # filelock import 는 함수 안에서 (모듈 import 부작용 0 유지 + 미설치 시 안전 폴백).
    try:
        from filelock import FileLock, Timeout
    except ImportError:
        logger.error("filelock 미설치 — 파일락 없이 스케줄러 시작 (중복 방지 불가)")
        return _NoopLock()

    lock = FileLock(path, timeout=0)
    try:
        lock.acquire()
        logger.info("스케줄러 락 획득 (%s) — 이 backend 가 스케줄러 담당", path)
        return lock
    except Timeout:
        logger.warning(
            "스케줄러 락 경합 — 다른 backend 가 이미 보유 (%s). 스케줄러 시작 스킵 "
            "(중복 방지). health/API 는 정상 응답.", path
        )
        return None
    except OSError as e:
        # 경합이 아닌 진짜 에러(디스크·권한 등) — 경합과 구분해 error + 텔레그램.
        # 경합(Timeout)=None 은 "다른 backend 가 스케줄러 담당"이라 조용해도 옳지만,
        # OSError=None 은 "정상 단일 backend 인데 파일 오류로 스케줄러 영영 스킵"이라
        # 크롤·결제·VACUUM 이 통째로 멈출 수 있다. /health 는 이걸 못 잡으므로
        # 운영자에게 능동 알림한다(job_error_listener._send_alert 선례 답습, best-effort).
        logger.error("스케줄러 락 파일 에러 (%s): %s — 스케줄러 시작 스킵", path, e)
        _alert_scheduler_lock_error(path, e)
        return None


def _alert_scheduler_lock_error(path: str, err: Exception) -> None:
    """스케줄러 락 진짜 에러(OSError)를 운영자에게 텔레그램 알림 — best-effort, lazy import.

    발송 실패해도 앱을 죽이지 않는다(job_error_listener._send_alert 선례 답습).
    경합(Timeout)에는 호출 안 함 — 그건 정상 중복방지라 알림 노이즈만 된다.
    """
    try:
        from services.telegram import send_telegram
        send_telegram(
            f"🚨 스케줄러 락 파일 에러 — 이 backend 가 스케줄러(크롤/결제/VACUUM)를 "
            f"시작하지 못했습니다. 확인 필요: {path} ({err})"
        )
    except Exception:
        logger.warning("스케줄러 락 에러 텔레그램 알림 발송 실패", exc_info=True)


class _NoopLock(contextlib.nullcontext):
    """락 비활성 sentinel — release()/__exit__ 가 no-op. FileLock 인터페이스 호환."""

    def release(self) -> None:  # FileLock.release() 시그니처 호환
        pass
