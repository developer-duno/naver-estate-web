"""오피스텔·도시형 청약 수집 잡 (이슈 #323).

기존 아파트 청약(mibunyang collect-applyhome-detail.mjs)과 별개로
naver-estate-web 이 자체 수집. mibunyang 은 오피스텔 API(getUrbtyOfctl*) 를
호출하지 않고(설계 §범위 밖 확정) apartments 로스터를 채우는 API 도 청약홈
아파트/무순위 채널(getRemndrLttotPblancDetail 등)이라 오피스텔 house_manage_no
와 애초에 매칭될 상대가 없다 — 구조적으로 항상 0건 매칭 (2026-08-08 최종
전체검토에서 발견, 근본 수정). apartments 매칭 게이트 없이 house_manage_no
기준 전량 upsert 로 재설계 (rental 수집기와 동일 패턴).

apartment_id 컬럼은 nullable=False 제약이 있어 완전히 비울 수 없다 —
`ah-{HOUSE_MANAGE_NO}` 형태 값을 자체 발급 placeholder 로 채우되, 이 값이
apartments 로스터와 실제로 매칭될 필요는 없다(매칭 확인 로직 자체를 제거).

주1회(월요일) 스케줄러 잡. crawler/service_public.py 의 job 기록·에러 처리
패턴(CrawlJob cancelled/completed/failed)을 그대로 따른다.
"""

import logging
import os

from crawler.applyhome_officetel_api import (
    fetch_officetel_detail,
    fetch_officetel_unit,
    parse_comma_amount,
    parse_compact_date,
)
from crawler.service_common import fail_job_safely
from db.database import SessionLocal
from db.mb_models import ApplyhomeUnitSupply, PresaleScheduleOfficial
from db.models import CrawlJob
from utils import utcnow

logger = logging.getLogger(__name__)


def collect_officetel_presale(batch_size: int = 1000, scheduler_job_id: str | None = None):
    """오피스텔/도시형 청약 공고 + 평형별 공급정보 수집 → 기존 청약 테이블 upsert.

    services/upsert._do_upsert() 는 V044 작업(공시가격 기반)에서 복합 키를 지원하도록
    확장됐지만(pk_col: str | list[str]), 이 테이블들의 (apartment_id, house_manage_no)
    는 비즈니스 키일 뿐 **DB 레벨 UNIQUE 제약이 없어**(id 가 별도 SERIAL PK) ON CONFLICT
    추론 대상이 되지 못한다 — 그래서 여전히 수동 SELECT-then-write 유지
    (oss-first.md 예외 사유 명시).
    """
    api_key = os.getenv("PUBLIC_DATA_API_KEY")
    if not api_key:
        logger.info("PUBLIC_DATA_API_KEY 미설정 — 오피스텔 청약 수집 건너뜀")
        if scheduler_job_id:
            db = SessionLocal()
            job = CrawlJob(
                job_type="officetel_presale", scheduler_job_id=scheduler_job_id,
                status="cancelled", started_at=utcnow(), completed_at=utcnow(),
                error_message="PUBLIC_DATA_API_KEY 미설정",
            )
            db.add(job)
            db.commit()
            db.close()
        return

    db = SessionLocal()
    job = CrawlJob(
        job_type="officetel_presale", scheduler_job_id=scheduler_job_id,
        status="running", started_at=utcnow(),
    )
    db.add(job)
    db.commit()
    job_id = job.id

    try:
        detail_resp = fetch_officetel_detail(page=1, per_page=batch_size)
        detail_rows = detail_resp.get("data", [])

        matched = 0
        for row in detail_rows:
            hmn = row.get("HOUSE_MANAGE_NO")
            if not hmn:
                continue
            apartment_id = f"ah-{hmn}"  # 자체 발급 placeholder (apartments 로스터 매칭 아님)

            existing = (
                db.query(PresaleScheduleOfficial)
                .filter(
                    PresaleScheduleOfficial.apartment_id == apartment_id,
                    PresaleScheduleOfficial.house_manage_no == hmn,
                )
                .first()
            )
            recruit_date = parse_compact_date(row.get("RCRIT_PBLANC_DE"))
            house_nm = row.get("HOUSE_NM")
            if existing:
                existing.house_type = "officetel"
                existing.house_nm = house_nm
                existing.recruit_date = recruit_date
                existing.tot_supply = row.get("TOT_SUPLY_HSHLDCO")
                existing.pblanc_url = row.get("PBLANC_URL")
                existing.biz_entity = row.get("BSNS_MBY_NM")
                existing.constructor = row.get("CNSTRCT_ENTRPS_NM")
                existing.fetched_at = utcnow()
            else:
                db.add(
                    PresaleScheduleOfficial(
                        apartment_id=apartment_id,
                        house_manage_no=hmn,
                        pblanc_no=row.get("PBLANC_NO"),
                        house_nm=house_nm,
                        recruit_date=recruit_date,
                        tot_supply=row.get("TOT_SUPLY_HSHLDCO"),
                        pblanc_url=row.get("PBLANC_URL"),
                        biz_entity=row.get("BSNS_MBY_NM"),
                        constructor=row.get("CNSTRCT_ENTRPS_NM"),
                        house_type="officetel",
                        fetched_at=utcnow(),
                    )
                )
            matched += 1
        db.commit()

        unit_resp = fetch_officetel_unit(page=1, per_page=batch_size)
        unit_rows = unit_resp.get("data", [])
        unit_matched = 0
        for row in unit_rows:
            hmn = row.get("HOUSE_MANAGE_NO")
            model_no = row.get("MODEL_NO")
            if not hmn or not model_no:
                continue
            apartment_id = f"ah-{hmn}"  # 자체 발급 placeholder (apartments 로스터 매칭 아님)

            existing_unit = (
                db.query(ApplyhomeUnitSupply)
                .filter(
                    ApplyhomeUnitSupply.apartment_id == apartment_id,
                    ApplyhomeUnitSupply.house_manage_no == hmn,
                    ApplyhomeUnitSupply.model_no == model_no,
                )
                .first()
            )
            top_amount = parse_comma_amount(row.get("LTTOT_TOP_AMOUNT"))
            if existing_unit:
                existing_unit.house_type = "officetel"
                existing_unit.top_amount = top_amount
                existing_unit.fetched_at = utcnow()
            else:
                db.add(
                    ApplyhomeUnitSupply(
                        apartment_id=apartment_id,
                        house_manage_no=hmn,
                        model_no=model_no,
                        house_ty=row.get("HOUSE_TY"),
                        top_amount=top_amount,
                        house_type="officetel",
                        fetched_at=utcnow(),
                    )
                )
            unit_matched += 1
        db.commit()

        job.status = "completed"
        job.total_items = len(detail_rows) + len(unit_rows)
        job.processed_items = matched + unit_matched
        job.completed_at = utcnow()
        db.commit()
        logger.info(
            "오피스텔 청약 수집 완료: 공고 %d/%d upsert, 평형 %d/%d upsert",
            matched, len(detail_rows), unit_matched, len(unit_rows),
        )
    except Exception as e:
        try:
            db.rollback()
            job.status = "failed"
            job.error_message = str(e)[:500]
            db.commit()
        except Exception:
            fail_job_safely(job_id, str(e)[:500])
        logger.exception("오피스텔 청약 수집 실패")
    finally:
        db.close()
