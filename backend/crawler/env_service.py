"""환경 데이터 수집 오케스트레이터 — 대기질 + 응급의료 + 어린이집 + 범죄통계

미분양 아파트(apartments 테이블)를 순회하며 공공데이터 API 호출 → infra 테이블 업데이트.
스케줄러에서 호출되는 최상위 함수.
"""

import logging
from datetime import date, datetime

from db.database import SessionLocal
from db.mb_models import AirQualityStation, Apartment, Infra
from db.models import CrawlJob
from utils import utcnow

logger = logging.getLogger(__name__)


def _record_job(db, job_type: str, scheduler_job_id: str) -> CrawlJob:
    """CrawlJob 레코드 생성 — 수집 시작 기록"""
    job = CrawlJob(
        job_type=job_type,
        scheduler_job_id=scheduler_job_id,
        status="running",
        started_at=utcnow(),
    )
    db.add(job)
    db.commit()
    return job


def _complete_job(db, job: CrawlJob, collected: int, failed: int):
    """CrawlJob 완료 기록"""
    job.status = "completed"
    job.processed_items = collected
    job.total_items = collected + failed
    job.completed_at = utcnow()
    db.commit()


def _fail_job(db, job: CrawlJob, error: str):
    """CrawlJob 실패 기록"""
    db.rollback()
    job.status = "failed"
    job.error_message = error[:500]
    job.completed_at = utcnow()
    db.commit()


def _is_skip_day() -> bool:
    """매월 10일 토요일 — mibunyang building-info 쿼터 충돌 방지"""
    today = date.today()
    return today.day == 10 and today.weekday() == 5


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


def collect_emergency_data(batch_size: int = 100):
    """응급의료기관 수집 — 전국 기관목록 1회 조회 → 단지별 근접 매칭"""
    from crawler.emergency_api import EmergencyAPI

    db = SessionLocal()
    job = _record_job(db, "emergency", "collect_emergency")
    try:
        # 전국 응급의료기관 목록 (1회, ~400건)
        facilities = EmergencyAPI.get_emergency_list()
        if not facilities:
            logger.warning("[emergency] 응급의료기관 목록 조회 실패")
            _complete_job(db, job, 0, 0)
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
        _complete_job(db, job, collected, failed)
        logger.info("[emergency] 완료: %d 수집, %d 실패 (배치 %d)", collected, failed, batch_size)
    except Exception as exc:
        _fail_job(db, job, str(exc))
        logger.exception("[emergency] 수집 실패")
    finally:
        db.close()


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


def _build_population_map(pop_rows) -> dict[str, int]:
    """DB region/gu → 다양한 키 형식의 인구수 맵 생성

    범죄통계 API 키(서울특별시_강남구)와 DB 키(경기_수원시) 양쪽 모두 매칭되도록
    여러 형식의 키를 동시에 등록한다.
    """
    from crawler.crime_stats_api import _REGION_ALIAS

    # DB 축약명 → 정식명 (API _REGION_ALIAS와 별도: DB는 "경기", API는 "경기도")
    _DB_ALIAS: dict[str, str] = {
        **_REGION_ALIAS,
        "서울": "서울특별시",
        "부산": "부산광역시",
        "대구": "대구광역시",
        "인천": "인천광역시",
        "광주": "광주광역시",
        "대전": "대전광역시",
        "울산": "울산광역시",
        "세종": "세종특별자치시",
        "경기": "경기도",
        "강원": "강원특별자치도",
        "충북": "충청북도",
        "충남": "충청남도",
        "전북": "전북특별자치도",
        "전남": "전라남도",
        "경북": "경상북도",
        "경남": "경상남도",
        "제주": "제주특별자치도",
    }

    pop_map: dict[str, int] = {}
    _GU_SUFFIXES = ("구", "시", "군")

    for r, g, pop in pop_rows:
        # 원본 키: DB 그대로
        exact = f"{r}_{g}" if g else r
        pop_map[exact] = pop

        # 정식 명칭 키: 서울→서울특별시, 경기→경기도
        long_r = _DB_ALIAS.get(r, r)
        if long_r != r:
            long_key = f"{long_r}_{g}" if g else long_r
            pop_map[long_key] = pop

        # gu에 접미사(구/시/군) 추가한 변형 키
        if g and not any(g.endswith(s) for s in _GU_SUFFIXES):
            for suffix in _GU_SUFFIXES:
                pop_map[f"{r}_{g}{suffix}"] = pop
                if long_r != r:
                    pop_map[f"{long_r}_{g}{suffix}"] = pop

        # region-only 키 (세종 등 단일 시도 매칭용, 첫 번째 값 우선)
        pop_map.setdefault(r, pop)
        if long_r != r:
            pop_map.setdefault(long_r, pop)

    return pop_map


def _build_score_lookup(scored: dict[str, dict]) -> dict[str, dict]:
    """scored 결과를 다양한 키 형식으로 조회 가능하게 확장

    scored 키(서울특별시_강남구)를 축약형(서울_강남, 서울_강남구, 경기_수원시 등)으로도
    조회할 수 있도록 역방향 매핑을 추가한다.
    """
    # 정식명 → DB 축약명 (모든 가능한 축약형)
    _LONG_TO_SHORT: dict[str, list[str]] = {
        "서울특별시": ["서울"],
        "부산광역시": ["부산"],
        "대구광역시": ["대구"],
        "인천광역시": ["인천"],
        "광주광역시": ["광주"],
        "대전광역시": ["대전"],
        "울산광역시": ["울산"],
        "세종특별자치시": ["세종", "세종시"],
        "경기도": ["경기"],
        "강원특별자치도": ["강원", "강원도"],
        "충청북도": ["충북"],
        "충청남도": ["충남"],
        "전북특별자치도": ["전북"],
        "전라남도": ["전남"],
        "경상북도": ["경북"],
        "경상남도": ["경남"],
        "제주특별자치도": ["제주"],
    }

    lookup: dict[str, dict] = dict(scored)

    for key, val in scored.items():
        # stats 키에서 region/gu 분리
        if "_" in key:
            r_part, g_part = key.split("_", 1)
        else:
            r_part, g_part = key, ""

        short_names = _LONG_TO_SHORT.get(r_part, [])

        # 축약 키 등록 (서울특별시→서울, 경기도→경기 등)
        for short_r in short_names:
            short_key = f"{short_r}_{g_part}" if g_part else short_r
            lookup.setdefault(short_key, val)

        # gu 접미사 제거 변형 (강남구→강남, 수원시→수원 등)
        if g_part:
            for suffix in ("구", "시", "군"):
                if g_part.endswith(suffix) and len(g_part) > 1:
                    stripped = g_part[:-1]
                    lookup.setdefault(f"{r_part}_{stripped}", val)
                    for short_r in short_names:
                        lookup.setdefault(f"{short_r}_{stripped}", val)

    return lookup


# 상위 시 없이 구만 저장된 경우의 매핑 (기흥구→용인시 등)
_GU_TO_PARENT_CITY: dict[str, str] = {
    # 용인시
    "기흥구": "용인시", "수지구": "용인시", "처인구": "용인시",
    # 수원시
    "장안구": "수원시", "권선구": "수원시", "팔달구": "수원시", "영통구": "수원시",
    # 성남시
    "수정구": "성남시", "중원구": "성남시", "분당구": "성남시",
    # 안양시
    "만안구": "안양시", "동안구": "안양시",
    # 안산시
    "상록구": "안산시", "단원구": "안산시",
    # 고양시
    "덕양구": "고양시", "일산동구": "고양시", "일산서구": "고양시",
    # 화성시 (동탄은 공식 구가 아니지만 데이터에 존재)
    "동탄": "화성시", "동탄구": "화성시",
    # 부천시 (구제도 폐지되었지만 데이터 잔존)
    "소사구": "부천시", "원미구": "부천시", "오정구": "부천시",
    # 천안시
    "동남구": "천안시", "서북구": "천안시",
    # 청주시
    "상당구": "청주시", "서원구": "청주시", "흥덕구": "청주시", "청원구": "청주시",
    # 전주시
    "완산구": "전주시", "덕진구": "전주시",
    # 창원시
    "의창구": "창원시", "성산구": "창원시",
    "마산합포구": "창원시", "마산회원구": "창원시", "진해구": "창원시",
    # 포항시
    "남구": "포항시", "북구": "포항시",  # region으로 구분 가능 (경북만 해당)
}


def _lookup_score(score_lookup: dict, region: str, gu: str | None) -> dict | None:
    """score_lookup에서 region/gu 조합으로 점수 조회 (다단계 폴백)

    1차: 정확한 키 (경기_수원시 영통구)
    2차: 상위 시 단위 (경기_수원시) — gu에 공백+하위 구가 있는 경우
    3차: 구→상위시 매핑 (경기_기흥구 → 경기_용인시) — gu에 상위시 없이 구만 있는 경우
    4차: 시↔군 접미사 교체 (홍천시→홍천군, 홍천군→홍천시)
    5차: region만 (세종 등 gu가 특수한 경우)
    """
    db_key = f"{region}_{gu}" if gu else region
    result = score_lookup.get(db_key)
    if result:
        return result

    if not gu:
        return None

    # 2차: "수원시 영통구" → "수원시"
    if " " in gu:
        parent_gu = gu.split(" ")[0]
        result = score_lookup.get(f"{region}_{parent_gu}")
        if result:
            return result

    # 3차: 구→상위시 매핑 (기흥구→용인시)
    parent_city = _GU_TO_PARENT_CITY.get(gu)
    if parent_city:
        result = score_lookup.get(f"{region}_{parent_city}")
        if result:
            return result

    # 4차: 시↔군 접미사 교체 (홍천시→홍천군)
    if gu.endswith("시"):
        swapped = gu[:-1] + "군"
        result = score_lookup.get(f"{region}_{swapped}")
        if result:
            return result
    elif gu.endswith("군"):
        swapped = gu[:-1] + "시"
        result = score_lookup.get(f"{region}_{swapped}")
        if result:
            return result

    # 5차: region만 (세종 등)
    result = score_lookup.get(region)
    return result


def _compute_median_score(scored: dict[str, dict]) -> dict | None:
    """scored 결과의 중앙값 점수 산출 (인구 데이터 누락 지역 폴백용)"""
    from crawler.crime_stats_api import _GRADE_THRESHOLDS

    scores = [v["crime_score"] for v in scored.values()]
    if not scores:
        return None
    scores.sort()
    median = scores[len(scores) // 2]
    grade = "D"
    for threshold, g in _GRADE_THRESHOLDS:
        if median >= threshold:
            grade = g
            break
    logger.info("[crime] 중앙값 폴백: %d점 (%s등급)", median, grade)
    return {"crime_score": median, "crime_grade": grade}


def collect_crime_stats():
    """경찰청 범죄통계 API → infra 테이블 반영 (스케줄러/수동 트리거용)

    odcloud API에서 전국 시군구별 범죄 건수를 조회하고,
    regions 테이블의 인구수로 범죄율을 계산하여 안전 점수를 산출한다.
    API 실패 시 기존 CSV 로더로 폴백한다.
    """
    from crawler.crime_stats_api import CrimeStatsAPI
    from db.mb_models import MBRegion

    # 1) API 호출
    rows = CrimeStatsAPI.fetch_all()
    if not rows:
        logger.warning("[crime] API 실패 — CSV 폴백 시도")
        load_crime_stats()
        return

    # 2) 시군구별 합산
    stats = CrimeStatsAPI.aggregate_by_region(rows)
    if not stats:
        logger.warning("[crime] 집계 실패 — CSV 폴백 시도")
        load_crime_stats()
        return

    # 3) 인구수 조회 (regions 테이블, 최신 recorded_at 기준)
    db = SessionLocal()
    job = _record_job(db, "crime_stats", "collect_crime_stats")
    try:
        from sqlalchemy import func

        # 지역별 최신 인구수 서브쿼리
        subq = (
            db.query(
                MBRegion.region,
                MBRegion.gu,
                func.max(MBRegion.recorded_at).label("max_date"),
            )
            .group_by(MBRegion.region, MBRegion.gu)
            .subquery()
        )
        pop_rows = (
            db.query(MBRegion.region, MBRegion.gu, MBRegion.population)
            .join(
                subq,
                (MBRegion.region == subq.c.region)
                & (MBRegion.gu == subq.c.gu)
                & (MBRegion.recorded_at == subq.c.max_date),
            )
            .filter(MBRegion.population.isnot(None))
            .all()
        )

        # 다양한 키 형식으로 인구수 맵 생성 (DB 축약명 ↔ API 정식명)
        population_map = _build_population_map(pop_rows)
        logger.info("[crime] 인구수 %d개 항목 (원본 %d 시군구)", len(population_map), len(pop_rows))

        # 4) 안전 점수 산출
        scored = CrimeStatsAPI.compute_scores(stats, population_map)
        if not scored:
            logger.warning("[crime] 점수 산출 실패 — CSV 폴백 시도")
            _complete_job(db, job, 0, 0)
            load_crime_stats()
            return

        # 5) infra 테이블 업데이트 — scored를 다양한 키로 조회 가능하게 확장
        score_lookup = _build_score_lookup(scored)

        # 인구 데이터 누락 지역용 중앙값 폴백 (강원/전북/세종 등)
        median_result = _compute_median_score(scored)

        apts = db.query(Apartment.id, Apartment.region, Apartment.gu).all()
        collected, fallback_count, skipped = 0, 0, 0

        for apt_id, region, gu in apts:
            result = _lookup_score(score_lookup, region, gu)
            is_fallback = False
            if not result and median_result:
                result = median_result
                is_fallback = True

            if not result:
                skipped += 1
                continue

            infra = db.get(Infra, apt_id)
            if not infra:
                skipped += 1
                continue

            infra.crime_score = result["crime_score"]
            infra.crime_grade = result["crime_grade"]
            infra.crime_updated_at = datetime.now()
            collected += 1
            if is_fallback:
                fallback_count += 1

        db.commit()
        _complete_job(db, job, collected, skipped)
        logger.info(
            "[crime] 완료: %d 수집 (중앙값 폴백 %d), %d 건너뜀",
            collected, fallback_count, skipped,
        )
    except Exception as exc:
        _fail_job(db, job, str(exc))
        logger.exception("[crime] 수집 실패")
    finally:
        db.close()


def load_crime_stats(csv_path: str | None = None):
    """범죄통계 CSV → infra 테이블 반영 (수동/폴백용)"""
    from crawler.crime_stats_loader import CrimeStatsLoader

    raw = CrimeStatsLoader.load_from_csv(csv_path)
    if not raw:
        logger.warning("[crime] CSV 데이터 없음 — 건너뜀")
        return

    scored = CrimeStatsLoader.compute_scores(raw)
    if not scored:
        logger.warning("[crime] 점수 산출 실패 — 건너뜀")
        return

    # 다양한 키 형식으로 조회 가능하게 확장
    score_lookup = _build_score_lookup(scored)
    median_result = _compute_median_score(scored)

    db = SessionLocal()
    try:
        apts = db.query(Apartment.id, Apartment.region, Apartment.gu).all()
        collected, skipped = 0, 0

        for apt_id, region, gu in apts:
            result = _lookup_score(score_lookup, region, gu)
            if not result and median_result:
                result = median_result
            if not result:
                skipped += 1
                continue

            infra = db.get(Infra, apt_id)
            if not infra:
                skipped += 1
                continue

            infra.crime_score = result["crime_score"]
            infra.crime_grade = result["crime_grade"]
            infra.crime_updated_at = datetime.now()
            collected += 1

        db.commit()
        logger.info("[crime] CSV 폴백 완료: %d 수집, %d 건너뜀", collected, skipped)
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
