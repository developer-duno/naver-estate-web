"""어린이집 수집 — CPMS API → infra 테이블 반영"""

import logging

from crawler.env_common import _complete_job, _fail_job, _is_skip_day, _record_job
from db.database import SessionLocal
from db.mb_models import Apartment, Infra
from utils import utcnow

logger = logging.getLogger(__name__)


def collect_childcare_data(batch_size: int = 100):
    """어린이집 수집 — 시군구별 어린이집 목록 1회 → 단지별 근접 매칭 (반경 1km)"""
    db = SessionLocal()
    if _is_skip_day():
        logger.info("[childcare] 매월 10일 토요일 — 쿼터 보호를 위해 건너뜀")
        job = _record_job(db, "childcare", "collect_childcare")
        job.status = "cancelled"
        job.error_message = "쿼터 보호 건너뜀 (매월 10일 토요일)"
        job.completed_at = utcnow()
        db.commit()
        db.close()
        return

    from crawler.childcare_api import ChildcareAPI, resolve_sigungu_code

    job = _record_job(db, "childcare", "collect_childcare")
    try:
        apts = db.query(
            Apartment.id, Apartment.latitude, Apartment.longitude,
            Apartment.region, Apartment.gu,
        ).filter(
            Apartment.latitude.isnot(None),
            Apartment.longitude.isnot(None),
        ).limit(batch_size).all()

        # 시군구별 어린이집 캐시: {sigungu_code: [facilities]}
        gu_cache: dict[str, list[dict]] = {}
        collected, failed = 0, 0

        for apt_id, lat, lng, region, gu in apts:
            try:
                # 시군구 키로 캐시 (같은 지역 단지들은 재조회 불필요)
                cache_key = f"{region}_{gu}"
                if cache_key not in gu_cache:
                    sigungu_code = resolve_sigungu_code(region, gu)
                    if sigungu_code:
                        try:
                            gu_cache[cache_key] = ChildcareAPI.get_childcare_list(sigungu_code)
                            logger.info("[childcare] %s (code=%s) → %d건",
                                        cache_key, sigungu_code, len(gu_cache[cache_key]))
                        except Exception:
                            logger.exception("[childcare] %s API 조회 실패", cache_key)
                            gu_cache[cache_key] = []
                    else:
                        gu_cache[cache_key] = []
                        logger.warning("[childcare] %s → sigungu_code 매핑 없음", cache_key)

                facilities = gu_cache[cache_key]
                if not facilities:
                    failed += 1
                    continue

                result = ChildcareAPI.find_nearest(lat, lng, facilities)
                infra = db.get(Infra, apt_id)
                if not infra:
                    failed += 1
                    continue

                infra.childcare_count = result["count"]
                infra.childcare_nearest_dist = result["nearest_dist"]
                infra.childcare_nearest_name = result["nearest_name"]
                infra.childcare_nearest_capacity = result["nearest_capacity"]
                infra.childcare_nearest_type = result.get("nearest_type", "")
                infra.childcare_nearest_teachers = result.get("nearest_teachers", 0)
                collected += 1
            except Exception:
                logger.exception("[childcare] 단지 %s 처리 실패", apt_id)
                failed += 1

        db.commit()
        _complete_job(db, job, collected, failed)
        logger.info("[childcare] 완료: %d 수집, %d 실패 (배치 %d)", collected, failed, batch_size)
    except Exception as exc:
        _fail_job(db, job, str(exc))
        logger.exception("[childcare] 수집 실패")
    finally:
        db.close()
