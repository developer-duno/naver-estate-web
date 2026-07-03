"""backend.log 로테이션 유틸 (의존성 0, import 부작용 0).

startup_orchestrator.py 의 start_backend() 에서 분리 — 순수 함수라 부작용 없이
테스트 가능 (backend/tests/test_log_rotation.py). FileHandler·telegram import 를
끌어오지 않으려 별도 모듈로 둔다 (scripts/pid_util.py 선례 답습).

배경: start_backend() 가 backend.log 를 매번 "w" 모드로 열어 재시작마다 어제
크래시 로그가 통째로 사라졌다 (rotation 없음). 재시작 직전에 기존 backend.log 를
타임스탬프 아카이브(backend_<mtime>.log)로 옮겨 보존하고, keep_days 보다 오래된
아카이브만 정리한다.
"""

import glob
import logging
import os
import time

logger = logging.getLogger("startup")

BACKEND_LOG_NAME = "backend.log"
ARCHIVE_PREFIX = "backend_"
ARCHIVE_SUFFIX = ".log"
ARCHIVE_TS_FMT = "%Y%m%dT%H%M%S"


def rotate_backend_log(scripts_dir: str, keep_days: int = 7) -> str:
    """backend.log 로테이션 후, 새로 쓸 backend.log 경로를 반환한다.

    1. 기존 backend.log 가 존재하고 비어있지 않으면, 그 파일의 mtime 기준
       타임스탬프로 backend_<mtime>.log 아카이브로 rename 한다 (현재 시각이
       아니라 로그파일 자신의 mtime 사용 — 테스트 결정론 + "언제 만들어진
       로그인지"를 정확히 반영).
    2. keep_days 보다 오래된 아카이브(backend_*.log)는 mtime 기준으로 삭제한다.
    3. 반환값은 항상 안정 경로 backend.log (release.md §2 의
       "head -1 scripts/backend.log" 부팅시각 확인이 계속 이 경로를 본다).

    파일시스템 작업은 전부 try/except 로 감싸 rotation 실패가 백엔드 기동을
    막지 않도록 한다 (best-effort, logger.warning 로만 기록).
    """
    backend_log = os.path.join(scripts_dir, BACKEND_LOG_NAME)

    try:
        if os.path.exists(backend_log) and os.path.getsize(backend_log) > 0:
            mtime = os.path.getmtime(backend_log)
            ts = time.strftime(ARCHIVE_TS_FMT, time.localtime(mtime))
            archive_path = os.path.join(
                scripts_dir, f"{ARCHIVE_PREFIX}{ts}{ARCHIVE_SUFFIX}"
            )
            # 같은 초에 재시작 반복 등으로 아카이브명이 겹치면 rename 이 덮어쓰므로
            # 겹치지 않을 때까지 초 단위로 suffix 를 늘린다.
            suffix = 1
            base_archive_path = archive_path
            while os.path.exists(archive_path):
                archive_path = base_archive_path[: -len(ARCHIVE_SUFFIX)] + f"_{suffix}{ARCHIVE_SUFFIX}"
                suffix += 1
            os.rename(backend_log, archive_path)
            logger.info(f"backend.log 로테이션: {archive_path} 로 보존")
    except OSError as e:
        logger.warning(f"backend.log 로테이션 실패 (기동 계속 진행): {e}")

    try:
        _prune_old_archives(scripts_dir, keep_days)
    except OSError as e:
        logger.warning(f"오래된 backend.log 아카이브 정리 실패: {e}")

    return backend_log


def _prune_old_archives(scripts_dir: str, keep_days: int) -> None:
    """keep_days 보다 오래된 backend_*.log 아카이브를 mtime 기준으로 삭제."""
    cutoff = time.time() - keep_days * 86400
    pattern = os.path.join(scripts_dir, f"{ARCHIVE_PREFIX}*{ARCHIVE_SUFFIX}")
    for path in glob.glob(pattern):
        try:
            if os.path.getmtime(path) < cutoff:
                os.remove(path)
                logger.info(f"오래된 backend.log 아카이브 삭제: {path}")
        except OSError as e:
            logger.warning(f"아카이브 삭제 실패 ({path}): {e}")
