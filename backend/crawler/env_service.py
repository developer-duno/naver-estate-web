"""환경 데이터 수집 barrel re-export — 기존 import 호환 유지

실제 구현은 도메인별 모듈로 분리됨:
  env_common.py — CrawlJob 기록 헬퍼
  env_emergency.py — 응급의료 수집
  env_childcare.py — 어린이집 수집
(범죄통계 3모듈은 세션 473 에 삭제 — 아무도 안 보는 값이라 잡을 내렸다)
"""

from crawler.env_childcare import collect_childcare_data  # noqa: F401
from crawler.env_common import (  # noqa: F401
    _complete_job,
    _fail_job,
    _record_job,
)
from crawler.env_emergency import collect_emergency_data  # noqa: F401
