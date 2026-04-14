"""어린이집 수집 — cpmsapi030 1회 호출 + 시군구 캐시 + 반경 1km 필터

세션 40 재작성:
- 기존 버그: params["stcode"] = "" 빈 문자열이 ERROR-100 유발 (4개월 silent failure)
- 수정: childcare_api.py에서 stcode 키 자체 제거 → arcode만으로 시군구 전체 상세 응답
- 시군구당 030 1회 호출 → 응답 캐싱 → 같은 시군구 단지는 재사용
- 치명적 에러(쿼터 초과/인증 실패)는 ChildcareAPIError로 배치 중단
"""

import logging

from crawler.env_common import _complete_job, _fail_job, _is_skip_day, _record_job
from db.database import SessionLocal
from db.mb_models import Apartment, Infra
from utils import utcnow

logger = logging.getLogger(__name__)


def collect_childcare_data(batch_size: int = 100):
    """어린이집 수집 — 시군구별 1회 API 호출 + 단지별 반경 1km 매칭"""
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

    from crawler.childcare_api import ChildcareAPI, ChildcareAPIError, resolve_sigungu_code

    job = _record_job(db, "childcare", "collect_childcare")
    try:
        apts = db.query(
            Apartment.id, Apartment.latitude, Apartment.longitude,
            Apartment.region, Apartment.gu,
        ).filter(
            Apartment.latitude.isnot(None),
            Apartment.longitude.isnot(None),
        ).limit(batch_size).all()

        # Infra 일괄 prefetch — 루프 내 db.get() 라운드트립 제거 (Supabase pooler 7분 timeout 대응)
        apt_ids = [row[0] for row in apts]
        infra_map: dict[str, Infra] = {
            obj.apartment_id: obj
            for obj in db.query(Infra).filter(Infra.apartment_id.in_(apt_ids)).all()
        } if apt_ids else {}

        # 시군구별 어린이집 캐시: {sigungu_code: [facilities]}
        gu_cache: dict[str, list[dict]] = {}
        collected, failed = 0, 0

        for apt_id, lat, lng, region, gu in apts:
            try:
                sigungu_code = resolve_sigungu_code(region, gu)
                if not sigungu_code:
                    logger.warning("[childcare] %s %s → 시군구 코드 매핑 없음", region, gu)
                    failed += 1
                    continue

                if sigungu_code not in gu_cache:
                    try:
                        gu_cache[sigungu_code] = (
                            ChildcareAPI.get_childcare_list(sigungu_code)
                        )
                        logger.info(
                            "[childcare] %s %s (code=%s) → %d건",
                            region, gu, sigungu_code, len(gu_cache[sigungu_code]),
                        )
                    except ChildcareAPIError:
                        raise
                    except Exception:
                        logger.exception("[childcare] %s API 조회 실패", sigungu_code)
                        gu_cache[sigungu_code] = []

                facilities = gu_cache[sigungu_code]
                if not facilities:
                    failed += 1
                    continue

                result = ChildcareAPI.find_nearest(lat, lng, facilities)
                infra = infra_map.get(apt_id)
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
            except ChildcareAPIError:
                raise
            except Exception:
                logger.exception("[childcare] 단지 %s 처리 실패", apt_id)
                failed += 1

        db.commit()

        # silent success 가드 (세션 39)
        if collected == 0:
            empty_gus = sum(1 for v in gu_cache.values() if not v)
            total_gus = len(gu_cache)
            job.status = "failed"
            job.processed_items = 0
            job.total_items = failed
            job.error_message = (
                f"0건 수집 — 시군구 {total_gus}개 중 API empty {empty_gus}개"
            )[:500]
            job.completed_at = utcnow()
            db.commit()
            logger.error(
                "[childcare] silent failure 감지: 시군구 %d개 중 empty %d개 (배치 %d)",
                total_gus, empty_gus, batch_size,
            )
        else:
            _complete_job(db, job, collected, failed)
            logger.info(
                "[childcare] 완료: %d 수집, %d 실패 (배치 %d)",
                collected, failed, batch_size,
            )
    except ChildcareAPIError as exc:
        _fail_job(db, job, f"CPMS 치명적 에러: {exc}")
        logger.error("[childcare] CPMS 쿼터/인증 에러 — 배치 중단: %s", exc)
    except Exception as exc:
        _fail_job(db, job, str(exc))
        logger.exception("[childcare] 수집 실패")
    finally:
        db.close()
