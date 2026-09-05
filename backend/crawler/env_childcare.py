"""어린이집 수집 — cpmsapi030 1회 호출 + 시군구 캐시 + 반경 1km 필터

세션 40 재작성:
- 기존 버그: params["stcode"] = "" 빈 문자열이 ERROR-100 유발 (4개월 silent failure)
- 수정: childcare_api.py에서 stcode 키 자체 제거 → arcode만으로 시군구 전체 상세 응답
- 시군구당 030 1회 호출 → 응답 캐싱 → 같은 시군구 단지는 재사용
- 치명적 에러(쿼터 초과/인증 실패)는 ChildcareAPIError로 배치 중단
"""

import logging

from crawler.env_common import (
    _complete_job,
    _fail_job,
    _is_skip_day,
    _prefetch_infra_map,
    _record_job,
)
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
        # "오래된 것 우선" 순환 (세션 392 결함 수정).
        # 이전: ORDER BY 없이 limit(batch_size) → DB 가 돌려주는 임의(사실상 고정)
        # 순서의 앞쪽 100개만 매월 재갱신 → prod 실측 901/2,938(30.7%)가 5개월간
        # childcare_count NULL 방치. 이제 ①한 번도 안 받은 것(NULL) ②가장 오래된 것
        # 순으로 돌아 전 단지가 한 바퀴씩 채워진다.
        # outerjoin 필수 — Infra 행 자체가 없는 단지도 NULL 로 잡혀 최우선이 된다
        # (inner join 이면 그 단지들이 영영 선정 대상에서 빠진다).
        apts = db.query(
            Apartment.id, Apartment.latitude, Apartment.longitude,
            Apartment.region, Apartment.gu,
        ).outerjoin(
            Infra, Infra.apartment_id == Apartment.id,
        ).filter(
            Apartment.latitude.isnot(None),
            Apartment.longitude.isnot(None),
        ).order_by(
            Infra.childcare_updated_at.asc().nullsfirst(),
        ).limit(batch_size).all()

        # Infra 일괄 prefetch — 루프 내 db.get() 라운드트립 제거 (env_common._prefetch_infra_map 공통 답습)
        apt_ids = [row[0] for row in apts]
        infra_map = _prefetch_infra_map(db, apt_ids)

        # 시군구별 어린이집 캐시: {sigungu_code: [facilities]}
        gu_cache: dict[str, list[dict]] = {}
        # collected=전체 기록 수, collected_with_matches=반경 1km 내 매칭 >0인 수
        # (세션 41: empty 시군구를 count=0으로 기록해도 silent failure 감지가 무력화되지 않도록 분리)
        collected, collected_with_matches, failed = 0, 0, 0

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
                # empty facilities여도 find_nearest가 count=0 반환 → count=0으로 정상 기록
                # (세션 41: 제주시 등 CPMS가 시군구 0건 반환하는 케이스 구제)
                result = ChildcareAPI.find_nearest(lat, lng, facilities)

                infra = infra_map.get(apt_id)
                if not infra:
                    # Infra 행 자동 생성 — mibunyang 전 collectors가 upsert(onConflict=apartment_id)
                    # 이므로 PK 충돌 없음. 검증: /f/mibunyang/scripts/collectors/*.mjs (세션 41)
                    infra = Infra(apartment_id=apt_id)
                    db.add(infra)
                    infra_map[apt_id] = infra

                infra.childcare_count = result["count"]
                infra.childcare_nearest_dist = result["nearest_dist"]
                infra.childcare_nearest_name = result["nearest_name"]
                infra.childcare_nearest_capacity = result["nearest_capacity"]
                infra.childcare_nearest_type = result.get("nearest_type", "")
                infra.childcare_nearest_teachers = result.get("nearest_teachers", 0)
                # 순환 키 갱신 (세션 392) — 이 시각이 안 찍히면 위 order_by 가 영원히
                # 같은 단지를 최우선으로 되돌려 순환 자체가 성립하지 않는다.
                # count=0(반경 내 어린이집 없음)도 정상 수집 결과이므로 함께 찍는다
                # — 안 찍으면 시골 단지가 매 회차 재조회돼 순환이 그 자리에서 막힌다.
                # (air_updated_at 의 "측정값 있을 때만" 보류 규칙과 다른 이유: air 는
                #  값이 전부 None 이면 화면이 빈값이라 신선도 green 이 거짓말이 되지만,
                #  childcare count=0 은 "주변에 없음"이라는 확정된 참값이다.)
                infra.childcare_updated_at = utcnow()
                collected += 1
                if result["count"] > 0:
                    collected_with_matches += 1
            except ChildcareAPIError:
                raise
            except Exception:
                logger.exception("[childcare] 단지 %s 처리 실패", apt_id)
                failed += 1

        db.commit()

        # silent success 가드 (세션 39 + 41 재설계)
        # 매칭 >0인 단지가 0이고, 적어도 하나의 시군구를 조회한 경우 → 전역 장애
        if collected_with_matches == 0 and len(gu_cache) > 0:
            empty_gus = sum(1 for v in gu_cache.values() if not v)
            total_gus = len(gu_cache)
            job.status = "failed"
            job.processed_items = 0
            job.total_items = failed
            job.error_message = (
                f"매칭 0건 — 시군구 {total_gus}개 중 API empty {empty_gus}개, "
                f"collected={collected}"
            )[:500]
            job.completed_at = utcnow()
            db.commit()
            logger.error(
                "[childcare] silent failure 감지: 시군구 %d개 중 empty %d개, "
                "collected=%d with_matches=0 (배치 %d)",
                total_gus, empty_gus, collected, batch_size,
            )
        else:
            _complete_job(db, job, collected, failed)
            logger.info(
                "[childcare] 완료: %d 수집 (매칭 %d), %d 실패 (배치 %d)",
                collected, collected_with_matches, failed, batch_size,
            )
    except ChildcareAPIError as exc:
        _fail_job(db, job, f"CPMS 치명적 에러: {exc}")
        logger.error("[childcare] CPMS 쿼터/인증 에러 — 배치 중단: %s", exc)
    except Exception as exc:
        _fail_job(db, job, str(exc))
        logger.exception("[childcare] 수집 실패")
    finally:
        db.close()
