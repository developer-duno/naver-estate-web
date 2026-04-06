"""환경 데이터 수집 barrel re-export — 기존 import 호환 유지

실제 구현은 도메인별 모듈로 분리됨:
  env_common.py — CrawlJob 기록 헬퍼
  env_air.py — 대기질 수집
  env_emergency.py — 응급의료 수집
  env_childcare.py — 어린이집 수집
  env_crime_population.py — 범죄통계 인구맵
  env_crime_lookup.py — 범죄통계 점수 조회
  env_crime.py — 범죄통계 수집
"""

from crawler.env_air import collect_air_quality  # noqa: F401
from crawler.env_childcare import collect_childcare_data  # noqa: F401
from crawler.env_common import (  # noqa: F401
    _complete_job,
    _fail_job,
    _is_skip_day,
    _record_job,
)
from crawler.env_crime import collect_crime_stats, load_crime_stats  # noqa: F401
from crawler.env_crime_lookup import (  # noqa: F401
    _build_score_lookup,
    _compute_median_score,
    _lookup_score,
)
from crawler.env_crime_population import _build_population_map  # noqa: F401
from crawler.env_emergency import collect_emergency_data  # noqa: F401
