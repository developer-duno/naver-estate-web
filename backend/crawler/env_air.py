"""대기질 수집 — 에어코리아 API → infra 테이블 반영"""

import logging
from datetime import datetime

from crawler.env_common import _complete_job, _fail_job, _is_skip_day, _record_job
from db.database import SessionLocal
from db.mb_models import AirQualityStation, Apartment, Infra
from utils import utcnow

logger = logging.getLogger(__name__)


def collect_air_quality(batch_size: int = 100):
    """에어코리아 대기질 수집 — 단지별 근접 측정소 + 실시간 측정값

    측정소 캐시(air_quality_stations)를 활용하여 API 호출을 최소화한다.
    """
    db = SessionLocal()
    if _is_skip_day():
        logger.info("[air_quality] 매월 10일 토요일 — 쿼터 보호를 위해 건너뜀")
        job = _record_job(db, "air_quality", "collect_air_quality")
        job.status = "cancelled"
        job.error_message = "쿼터 보호 건너뜀 (매월 10일 토요일)"
        job.completed_at = utcnow()
        db.commit()
        db.close()
        return

    from crawler.air_quality_api import AirQualityAPI

    job = _record_job(db, "air_quality", "collect_air_quality")
    try:
        apts = db.query(Apartment.id, Apartment.latitude, Apartment.longitude).filter(
            Apartment.latitude.isnot(None),
            Apartment.longitude.isnot(None),
        ).limit(batch_size).all()

        collected, failed = 0, 0
        # 측정소 캐시: {station_name: realtime_data}
        station_cache: dict[str, dict | None] = {}

        for apt_id, lat, lng in apts:
            try:
                # 1) 근접 측정소 조회
                station = AirQualityAPI.get_nearby_station(lat, lng)
                if not station or not station["station_name"]:
                    failed += 1
                    continue

                sname = station["station_name"]

                # 측정소 캐시 테이블에 저장
                _upsert_station(db, sname, station.get("addr", ""))

                # 2) 실시간 대기질 (같은 측정소는 캐시)
                if sname not in station_cache:
                    station_cache[sname] = AirQualityAPI.get_realtime_air(sname)
                air = station_cache[sname]

                # 3) infra 테이블 업데이트
                infra = db.get(Infra, apt_id)
                if not infra:
                    failed += 1
                    continue

                infra.air_station_name = sname
                infra.air_station_dist = round(station.get("tm", 0) * 1000, 1)  # km → m
                if air:
                    infra.air_pm10 = air["pm10"]
                    infra.air_pm25 = air["pm25"]
                    infra.air_o3 = air["o3"]
                    infra.air_grade = air["grade"]
                    infra.air_updated_at = datetime.now()

                collected += 1
            except Exception:
                logger.exception("[air_quality] 단지 %s 처리 실패", apt_id)
                failed += 1

        db.commit()
        _complete_job(db, job, collected, failed)
        logger.info("[air_quality] 완료: %d 수집, %d 실패 (배치 %d)", collected, failed, batch_size)
    except Exception as exc:
        _fail_job(db, job, str(exc))
        logger.exception("[air_quality] 수집 실패")
    finally:
        db.close()


def _upsert_station(db, station_name: str, addr: str):
    """에어코리아 측정소 캐시 upsert"""
    existing = db.get(AirQualityStation, station_name)
    if existing:
        return
    station = AirQualityStation(
        station_name=station_name,
        address=addr,
        updated_at=datetime.now(),
    )
    db.merge(station)
