"""환경 데이터 수집 오케스트레이터 — 대기질 + 응급의료

미분양 아파트(apartments 테이블)를 순회하며 공공데이터 API 호출 → infra 테이블 업데이트.
스케줄러에서 호출되는 최상위 함수.
"""

import logging
from datetime import date, datetime

from db.database import SessionLocal
from db.mb_models import AirQualityStation, Apartment, Infra

logger = logging.getLogger(__name__)


def _is_skip_day() -> bool:
    """매월 10일 토요일 — mibunyang building-info 쿼터 충돌 방지"""
    today = date.today()
    return today.day == 10 and today.weekday() == 5


def collect_air_quality(batch_size: int = 100):
    """에어코리아 대기질 수집 — 단지별 근접 측정소 + 실시간 측정값

    측정소 캐시(air_quality_stations)를 활용하여 API 호출을 최소화한다.
    """
    if _is_skip_day():
        logger.info("[air_quality] 매월 10일 토요일 — 쿼터 보호를 위해 건너뜀")
        return

    from crawler.air_quality_api import AirQualityAPI

    db = SessionLocal()
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
        logger.info("[air_quality] 완료: %d 수집, %d 실패 (배치 %d)", collected, failed, batch_size)
    finally:
        db.close()


def collect_emergency_data(batch_size: int = 100):
    """응급의료기관 수집 — 전국 기관목록 1회 조회 → 단지별 근접 매칭"""
    from crawler.emergency_api import EmergencyAPI

    db = SessionLocal()
    try:
        # 전국 응급의료기관 목록 (1회, ~400건)
        facilities = EmergencyAPI.get_emergency_list()
        if not facilities:
            logger.warning("[emergency] 응급의료기관 목록 조회 실패")
            return

        logger.info("[emergency] 전국 %d개 응급의료기관 조회 완료", len(facilities))

        apts = db.query(Apartment.id, Apartment.latitude, Apartment.longitude).filter(
            Apartment.latitude.isnot(None),
            Apartment.longitude.isnot(None),
        ).limit(batch_size).all()

        collected, failed = 0, 0
        for apt_id, lat, lng in apts:
            try:
                result = EmergencyAPI.find_nearest(lat, lng, facilities)
                infra = db.get(Infra, apt_id)
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
        logger.info("[emergency] 완료: %d 수집, %d 실패 (배치 %d)", collected, failed, batch_size)
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
