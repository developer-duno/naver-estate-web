"""범죄통계 수집 — 경찰청 odcloud API / CSV 폴백 → infra 테이블 반영"""

import logging
from datetime import datetime

from crawler.env_common import _complete_job, _fail_job, _record_job
from crawler.env_crime_lookup import _build_score_lookup, _compute_median_score, _lookup_score
from crawler.env_crime_population import _build_population_map
from db.database import SessionLocal
from db.mb_models import Apartment, Infra

logger = logging.getLogger(__name__)


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
