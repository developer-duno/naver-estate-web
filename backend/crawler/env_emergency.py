"""응급의료기관 수집 — NEMC API → infra 테이블 반영"""

import logging

from crawler.env_common import (
    _complete_job,
    _fail_job,
    _prefetch_infra_map,
    _record_job,
)
from db.database import SessionLocal
from db.mb_models import Apartment, Infra
from utils import utcnow

logger = logging.getLogger(__name__)

# 중간 저장 주기 (단지 수). 전량 전환(세션 394)으로 1회 실행이 100단지에서
# 2,938단지로 늘어, 마지막 단일 commit 만 두면 도중 사망(DB 다운·프로세스 종료) 시
# 그 달 성과가 통째로 증발한다(월 1회 잡이라 피해 = 한 달 지연).
#
# ⚠ commit 은 세션의 다른 인스턴스(infra_map 의 나머지 Infra)를 expire 시키지만,
#   이 루프의 각 순회는 자기 infra 에 **대입만** 하고 읽지 않으므로 lazy-load SELECT
#   유발 0 이다 (세션 342 lazy-load 폭풍은 "commit 후 속성을 읽는" 다른 조건).
# (env_childcare._COMMIT_EVERY 와 같은 값·같은 사유 — 세션 393 선례 답습)
_COMMIT_EVERY = 500


def batch_label(batch_size: int) -> str:
    """로그용 배치 표시 — 0 은 전량(무제한)을 뜻한다 (scheduler 등록 로그도 공유)"""
    return "전량" if batch_size <= 0 else str(batch_size)


def collect_emergency_data(batch_size: int = 0):
    """응급의료기관 수집 — 전국 기관목록 1회 조회 → 단지별 근접 매칭

    batch_size=0(기본) = 전량. 이 수집기는 EmergencyAPI.get_emergency_list() 로 전국
    목록을 **1회** 받고 단지별 처리는 find_nearest(순수 로컬 거리계산)뿐이라, 배치
    크기가 외부 API 호출 수와 전혀 무관하다 — 전량(2,938단지)이어도 API 비용 증가 0.
    옛 배치 100 은 아무 이득 없이 커버리지만 깎아먹었다(prod 실측 2026-09-05: 위경도
    보유 2,938단지 중 496개(16.9%)만 채워지고 83%가 영구 방치 — 세션 394).
    """
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

        # "오래된 것 우선" 순환 (세션 394 결함 수정 — 세션 392 childcare 선례 답습).
        # 이전: ORDER BY 없이 limit(batch_size) → DB 가 돌려주는 임의(사실상 고정)
        # 순서의 앞쪽 100개만 매월 재갱신 → prod 실측 2,442/2,938(83.1%)가
        # emergency_hospital NULL 방치. 이제 ①한 번도 안 받은 것(NULL) ②가장 오래된 것
        # 순으로 돌아 전 단지가 한 바퀴씩 채워진다.
        # outerjoin 필수 — Infra 행 자체가 없는 단지도 NULL 로 잡혀 최우선이 된다
        # (inner join 이면 그 단지들이 영영 선정 대상에서 빠진다).
        #
        # ⚠ 전량(batch_size=0)으로 전환된 뒤에도 ORDER BY 는 유지한다:
        #   ① 운영 사정으로 부분 배치로 되돌릴 때의 폴백 ② 전량 실행이 도중에 끊겨도
        #   다음 회차가 미수집분부터 이어받는 안전망. 정렬을 빼면 그 두 경우에 곧바로
        #   본 결함(앞쪽만 반복 갱신)이 재현된다.
        query = db.query(
            Apartment.id, Apartment.latitude, Apartment.longitude,
        ).outerjoin(
            Infra, Infra.apartment_id == Apartment.id,
        ).filter(
            Apartment.latitude.isnot(None),
            Apartment.longitude.isnot(None),
        ).order_by(
            Infra.emergency_updated_at.asc().nullsfirst(),
        )
        if batch_size > 0:
            query = query.limit(batch_size)
        apts = query.all()

        # Infra 일괄 prefetch — 루프 내 db.get() 라운드트립 제거 (env_common._prefetch_infra_map 공통 답습)
        apt_ids = [row[0] for row in apts]
        infra_map = _prefetch_infra_map(db, apt_ids)

        collected, failed = 0, 0
        for apt_id, lat, lng in apts:
            try:
                result = EmergencyAPI.find_nearest(lat, lng, facilities)

                infra = infra_map.get(apt_id)
                if not infra:
                    # Infra 행 자동 생성 — mibunyang 전 collectors 가 upsert(onConflict=apartment_id)
                    # 이므로 PK 충돌 없음 (env_childcare 검증 패턴 답습, 세션 41·394).
                    # 옛 동작(행 없으면 skip)은 mibunyang 미수집 단지를 영영 못 채워
                    # 순환 전환의 취지(전 단지 커버)를 정면으로 깎았다.
                    infra = Infra(apartment_id=apt_id)
                    db.add(infra)
                    infra_map[apt_id] = infra

                infra.emergency_hospital = result["count"]
                infra.emergency_hospital_dist = result["nearest_dist"]
                infra.emergency_beds = result["nearest_beds"]
                infra.emergency_level = result["nearest_level"]
                # 순환 키 갱신 (세션 394) — 이 시각이 안 찍히면 위 order_by 가 영원히
                # 같은 단지를 최우선으로 되돌려 순환 자체가 성립하지 않는다.
                # count=0(반경 내 응급의료기관 없음)도 정상 수집 결과이므로 함께 찍는다
                # — 안 찍으면 외딴 단지가 매 회차 재조회돼 순환이 그 자리에서 막힌다.
                # (air_updated_at 의 "측정값 있을 때만" 보류 규칙과 다른 이유: air 는
                #  값이 전부 None 이면 화면이 빈값이라 신선도 green 이 거짓말이 되지만,
                #  emergency count=0 은 "주변에 없음"이라는 확정된 참값이다.)
                infra.emergency_updated_at = utcnow()
                collected += 1

                # 중간 저장 — 전량 실행이 도중에 죽어도 여기까지는 남는다 (세션 394).
                # 다음 회차는 ORDER BY(오래된 것 우선) 덕에 저장된 단지를 건너뛰고
                # 미수집분부터 이어받으므로, 부분 성과가 그대로 다음 달로 이어진다.
                if collected % _COMMIT_EVERY == 0:
                    db.commit()
            except Exception:
                logger.exception("[emergency] 단지 %s 처리 실패", apt_id)
                failed += 1

        db.commit()
        # silent failure 가드 (세션 280 — childcare 패턴 답습): 단지는 있는데 한 건도
        # 못 채웠으면(전 단지 매칭 실패) '완료(0)' 위장 대신 failed 로 알린다.
        if collected == 0 and len(apts) > 0:
            _fail_job(db, job, f"단지 {len(apts)}개 전부 매칭 실패 (수집 0건)")
            logger.error("[emergency] silent failure 감지: 단지 %d개 전부 매칭 실패", len(apts))
        else:
            _complete_job(db, job, collected, failed)
            logger.info(
                "[emergency] 완료: %d 수집, %d 실패 (배치 %s)",
                collected, failed, batch_label(batch_size),
            )
    except Exception as exc:
        _fail_job(db, job, str(exc))
        logger.exception("[emergency] 수집 실패")
    finally:
        db.close()
