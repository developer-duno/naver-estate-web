"""응급의료기관 수집 — NEMC API → infra 테이블 반영"""

import logging

from crawler.env_common import (
    _complete_job,
    _fail_job,
    _prefetch_infra_map,
    _record_job,
)
from db.database import SessionLocal
from db.mb_models import Apartment

logger = logging.getLogger(__name__)


def collect_emergency_data(batch_size: int = 100):
    """응급의료기관 수집 — 전국 기관목록 1회 조회 → 단지별 근접 매칭"""
    from crawler.emergency_api import EmergencyAPI

    db = SessionLocal()
    job = _record_job(db, "emergency", "collect_emergency")
    try:
        # 전국 응급의료기관 목록 (1회, ~400건)
        facilities = EmergencyAPI.get_emergency_list()
        if not facilities:
            # 전국 목록이 비면 단지 매칭 자체가 불가 = 명백한 장애.
            # '완료(0,0)' 위장 대신 failed 로 알려야 monitor 가 텔레그램 알림 (세션 280).
            logger.warning("[emergency] 응급의료기관 목록 조회 실패")
            _fail_job(db, job, "응급의료기관 목록 조회 실패 (API 빈 응답)")
            return

        logger.info("[emergency] 전국 %d개 응급의료기관 조회 완료", len(facilities))

        apts = db.query(Apartment.id, Apartment.latitude, Apartment.longitude).filter(
            Apartment.latitude.isnot(None),
            Apartment.longitude.isnot(None),
        ).limit(batch_size).all()

        # Infra 일괄 prefetch — 루프 내 db.get() 라운드트립 제거 (env_common._prefetch_infra_map 공통 답습)
        apt_ids = [row[0] for row in apts]
        infra_map = _prefetch_infra_map(db, apt_ids)

        collected, failed = 0, 0
        for apt_id, lat, lng in apts:
            try:
                result = EmergencyAPI.find_nearest(lat, lng, facilities)
                infra = infra_map.get(apt_id)
                if not infra:
                    failed += 1
                    continue

                infra.emergency_hospital = result["count"]
                infra.emergency_hospital_dist = result["nearest_dist"]
                infra.emergency_beds = result["nearest_beds"]
                infra.emergency_level = result["nearest_level"]
                collected += 1
            except Exception:
                logger.exception("[emergency] 단지 %s 처리 실패", apt_id)
                failed += 1

        db.commit()
        # silent failure 가드 (세션 280 — childcare 패턴 답습): 단지는 있는데 한 건도
        # 못 채웠으면(전 단지 Infra 부재/매칭 실패) '완료(0)' 위장 대신 failed 로 알린다.
        if collected == 0 and len(apts) > 0:
            _fail_job(db, job, f"단지 {len(apts)}개 전부 매칭 실패 (수집 0건)")
            logger.error("[emergency] silent failure 감지: 단지 %d개 전부 매칭 실패", len(apts))
        else:
            _complete_job(db, job, collected, failed)
            logger.info("[emergency] 완료: %d 수집, %d 실패 (배치 %d)", collected, failed, batch_size)
    except Exception as exc:
        _fail_job(db, job, str(exc))
        logger.exception("[emergency] 수집 실패")
    finally:
        db.close()
