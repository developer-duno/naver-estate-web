"""대기질 수집 — 에어코리아 API → infra 테이블 반영"""

import logging

from crawler.env_common import (
    _complete_job,
    _fail_job,
    _is_skip_day,
    _prefetch_infra_map,
    _record_job,
)
from db.database import SessionLocal
from db.mb_models import AirQualityStation, Apartment, Infra
from services.upsert import _do_upsert
from utils import utcnow

logger = logging.getLogger(__name__)


def collect_air_quality(batch_size: int = 100):
    """에어코리아 대기질 수집 — 단지별 근접 측정소 + 실시간 측정값

    측정소 캐시(air_quality_stations)를 활용하여 API 호출을 최소화한다.

    대상 선정은 air_attempted_at "오래된 것 우선" 순환 (V055, 세션 394).

    ⚠ 배치 100 은 유지한다 (응급의료 V054 의 전량 전환과 다른 결정). 이 수집기는
    단지마다 AirQualityAPI.get_nearby_station 호출이 나가므로 배치 크기가 곧 외부 호출
    수다 — 전량(2,938단지)이면 매일 ~3,000콜로 data.go.kr 공유 쿼터(일 10,000,
    mibunyang 과 공유)를 압박한다. 배치 100 이면 하루 ~100콜이고, 순환이 도는 한
    전 단지 한 바퀴 ≈ 30일(2,938 ÷ 100)이다. 매일 도는 잡이라 30일 주기면 충분하다.
    (응급의료는 전국 목록 1회 + 로컬 거리계산뿐이라 배치가 호출 수와 무관해 전량이
     공짜였다. childcare 는 시군구당 1콜이라 마찬가지. 대기질만 단지당 1콜이다.)
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
        # "오래된 것 우선" 순환 (세션 394 결함 수정 — 세션 392 childcare/V053,
        # 세션 394 emergency/V054 선례 답습).
        # 이전: ORDER BY 없이 limit(batch_size) → DB 가 돌려주는 임의(사실상 고정)
        # 순서의 앞쪽 100개만 매일 재갱신 → prod 실측 2026-09-05: 위경도 보유
        # 2,938단지 중 913개가 한 번도 수집된 적 없고, 최근 30일 내 갱신은 977개뿐.
        # 매일 100개 × 30일 = 3,000슬롯을 쓰고도 977개만 닿았다 = 같은 단지 반복.
        # 이제 ①한 번도 시도 안 한 것(NULL) ②가장 오래 전에 시도한 것 순으로 돌아
        # 전 단지가 ≈30일에 한 바퀴씩 채워진다.
        #
        # ⚠ 순환 키가 air_updated_at 이 아니라 air_attempted_at 인 이유(V055 핵심):
        #   air_updated_at 은 측정값이 하나라도 있을 때만 찍힌다(아래 세션 280 규칙).
        #   그걸 순환 키로 쓰면 측정값이 안 나오는 단지가 영원히 NULL 로 남아
        #   NULLS FIRST 앞자리를 매일 독점 → 순환이 그 자리에서 멈춘다(결함 재현).
        # outerjoin 필수 — Infra 행 자체가 없는 단지도 NULL 로 잡혀 최우선이 된다
        # (inner join 이면 그 단지들이 영영 선정 대상에서 빠진다).
        query = db.query(
            Apartment.id, Apartment.latitude, Apartment.longitude,
        ).outerjoin(
            Infra, Infra.apartment_id == Apartment.id,
        ).filter(
            Apartment.latitude.isnot(None),
            Apartment.longitude.isnot(None),
        ).order_by(
            Infra.air_attempted_at.asc().nullsfirst(),
        )
        # ⚠ 배치 유지(전량 전환 안 함) — 단지당 API 1콜이라 전량이면 쿼터 압박.
        #   0 이하는 전량으로 해석(운영 긴급 시 폴백 경로, emergency 시그니처와 통일).
        if batch_size > 0:
            query = query.limit(batch_size)
        apts = query.all()

        # Infra 일괄 prefetch — 루프 내 db.get() 라운드트립 제거 (env_common._prefetch_infra_map 공통 답습)
        apt_ids = [row[0] for row in apts]
        infra_map = _prefetch_infra_map(db, apt_ids)

        collected, failed = 0, 0
        # 측정소 캐시: {station_name: realtime_data}
        station_cache: dict[str, dict | None] = {}

        for apt_id, lat, lng in apts:
            try:
                # Infra 행 확보 — 순환 키(air_attempted_at)를 어느 분기에서도 찍으려면
                # 측정소 조회보다 **먼저** 행이 있어야 한다.
                # 행이 없으면 자동 생성: mibunyang 전 collectors 가
                # upsert(onConflict=apartment_id) 이므로 PK 충돌 없음
                # (env_childcare·env_emergency 검증 패턴 답습, 세션 41·394).
                # 옛 동작(행 없으면 skip)은 mibunyang 미수집 단지를 영영 못 채워
                # 순환 전환의 취지(전 단지 커버)를 정면으로 깎았다.
                infra = infra_map.get(apt_id)
                if not infra:
                    infra = Infra(apartment_id=apt_id)
                    db.add(infra)
                    infra_map[apt_id] = infra

                # 순환 키 갱신 (V055, 세션 394) — 측정소 미발견·측정값 전무를 포함해
                # **이번 회차에 손댄 모든 단지**에 찍는다. 성공한 단지에만 찍으면
                # 실패 단지가 NULLS FIRST 앞자리를 매일 독점해 순환이 그 자리에서
                # 멈추고 뒤 단지들이 영영 순번을 못 받는다(결함의 국소 재현).
                # 아래 continue 분기보다 **앞**에 둬야 하는 이유가 이것이다.
                infra.air_attempted_at = utcnow()

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
                infra.air_station_name = sname
                infra.air_station_dist = round(station.get("tm", 0) * 1000, 1)  # km → m
                # 측정값이 하나라도 있을 때만 갱신 — get_realtime_air 는 항상 dict 를
                # 반환하나 pm10/pm25/o3 가 전부 None('-')일 수 있다. 전부 None 인데
                # air_updated_at 을 찍으면 신선도 green 인데 화면값 빈값(stale 오표시).
                # 측정값 있을 때만 updated_at 갱신 (세션 280).
                if air and any(air.get(k) is not None for k in ("pm10", "pm25", "o3")):
                    infra.air_pm10 = air["pm10"]
                    infra.air_pm25 = air["pm25"]
                    infra.air_o3 = air["o3"]
                    infra.air_grade = air["grade"]
                    infra.air_updated_at = utcnow()

                collected += 1
            except Exception:
                logger.exception("[air_quality] 단지 %s 처리 실패", apt_id)
                failed += 1

        db.commit()
        # silent failure 가드 (세션 280 — childcare 패턴 답습): 단지는 있는데 한 건도
        # 못 채웠으면(전 측정소 None/전 Infra 부재) '완료(0)' 위장 대신 failed 로 알린다.
        if collected == 0 and len(apts) > 0:
            _fail_job(db, job, f"단지 {len(apts)}개 전부 측정소 매칭 실패 (수집 0건)")
            logger.error("[air_quality] silent failure 감지: 단지 %d개 전부 매칭 실패", len(apts))
        else:
            _complete_job(db, job, collected, failed)
            logger.info("[air_quality] 완료: %d 수집, %d 실패 (배치 %d)", collected, failed, batch_size)
    except Exception as exc:
        _fail_job(db, job, str(exc))
        logger.exception("[air_quality] 수집 실패")
    finally:
        db.close()


def _upsert_station(db, station_name: str, addr: str):
    """에어코리아 측정소 캐시 upsert — ON CONFLICT DO UPDATE.

    동일 배치 내 같은 station_name이 여러 단지에서 반복 호출돼도
    UniqueViolation 없이 안전 (기존 db.merge + SELECT 체크는 flush 전 중복 감지 불가).
    """
    _do_upsert(
        db,
        AirQualityStation,
        {
            "station_name": station_name,
            "address": addr,
            "updated_at": utcnow(),
        },
        "station_name",
    )
