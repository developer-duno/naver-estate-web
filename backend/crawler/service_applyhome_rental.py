"""공공지원 민간임대 청약 수집 잡 (이슈 #323).

apartments 로스터와 무관한 독립 매물 — house_manage_no 를 PK 삼아 전량 upsert.
주1회(월요일) 스케줄러 잡.
"""

import logging
import os

from crawler.applyhome_officetel_api import (
    fetch_rental_detail,
    fetch_rental_unit,
    parse_comma_amount,
    parse_compact_date,
)
from crawler.service_common import fail_job_safely
from db.database import SessionLocal
from db.mb_models import RentalScheduleOfficial, RentalUnitSupply
from db.models import CrawlJob
from utils import utcnow

logger = logging.getLogger(__name__)


def collect_rental_presale(batch_size: int = 1000, scheduler_job_id: str | None = None):
    """공공지원 민간임대 공고 + 평형별 공급정보 수집 → rental_* 테이블 upsert."""
    api_key = os.getenv("PUBLIC_DATA_API_KEY")
    if not api_key:
        logger.info("PUBLIC_DATA_API_KEY 미설정 — 민간임대 청약 수집 건너뜀")
        if scheduler_job_id:
            db = SessionLocal()
            job = CrawlJob(
                job_type="rental_presale", scheduler_job_id=scheduler_job_id,
                status="cancelled", started_at=utcnow(), completed_at=utcnow(),
                error_message="PUBLIC_DATA_API_KEY 미설정",
            )
            db.add(job)
            db.commit()
            db.close()
        return

    db = SessionLocal()
    job = CrawlJob(
        job_type="rental_presale", scheduler_job_id=scheduler_job_id,
        status="running", started_at=utcnow(),
    )
    db.add(job)
    db.commit()
    job_id = job.id

    try:
        detail_resp = fetch_rental_detail(page=1, per_page=batch_size)
        detail_rows = detail_resp.get("data", [])

        upserted = 0
        for row in detail_rows:
            hmn = row.get("HOUSE_MANAGE_NO")
            house_nm = row.get("HOUSE_NM")
            if not hmn or not house_nm:
                continue

            existing = (
                db.query(RentalScheduleOfficial)
                .filter(RentalScheduleOfficial.house_manage_no == hmn)
                .first()
            )
            recruit_date = parse_compact_date(row.get("RCRIT_PBLANC_DE"))
            if existing:
                existing.house_nm = house_nm
                existing.address = row.get("HSSPLY_ADRES")
                existing.recruit_date = recruit_date
                existing.tot_supply = row.get("TOT_SUPLY_HSHLDCO")
                existing.pblanc_url = row.get("PBLANC_URL")
                existing.biz_entity = row.get("BSNS_MBY_NM")
                existing.constructor = row.get("CNSTRCT_ENTRPS_NM")
                existing.region_code = row.get("SUBSCRPT_AREA_CODE")
                existing.region_name = row.get("SUBSCRPT_AREA_CODE_NM")
                existing.fetched_at = utcnow()
            else:
                db.add(
                    RentalScheduleOfficial(
                        house_manage_no=hmn,
                        pblanc_no=row.get("PBLANC_NO"),
                        house_nm=house_nm,
                        address=row.get("HSSPLY_ADRES"),
                        recruit_date=recruit_date,
                        tot_supply=row.get("TOT_SUPLY_HSHLDCO"),
                        pblanc_url=row.get("PBLANC_URL"),
                        biz_entity=row.get("BSNS_MBY_NM"),
                        constructor=row.get("CNSTRCT_ENTRPS_NM"),
                        region_code=row.get("SUBSCRPT_AREA_CODE"),
                        region_name=row.get("SUBSCRPT_AREA_CODE_NM"),
                        fetched_at=utcnow(),
                    )
                )
            upserted += 1
        db.commit()

        unit_resp = fetch_rental_unit(page=1, per_page=batch_size)
        unit_rows = unit_resp.get("data", [])
        unit_upserted = 0
        for row in unit_rows:
            hmn = row.get("HOUSE_MANAGE_NO")
            model_no = row.get("MODEL_NO")
            if not hmn or not model_no:
                continue

            existing_unit = (
                db.query(RentalUnitSupply)
                .filter(
                    RentalUnitSupply.house_manage_no == hmn,
                    RentalUnitSupply.model_no == model_no,
                )
                .first()
            )
            fields = {
                "house_ty": row.get("HOUSE_TY"),
                "supply_area": row.get("SUPLY_AR"),
                "exclusive_area": row.get("EXCLU_AR"),
                "contract_area": row.get("CNTRCT_AR"),
                "general_supply": row.get("GNRL_HSHLDCO"),
                "youth_supply": row.get("YGMN_HSHLDCO"),
                "newlywed_supply": row.get("NWWDS_HSHLDCO"),
                "elderly_supply": row.get("OLD_PARNTS_SUPORT_HSHLDCO"),
                "monthly_rent": parse_comma_amount(row.get("MTH_RENT_AMOUNT")),
                "deposit": parse_comma_amount(row.get("DEPOSIT_AMOUNT")),
            }
            if existing_unit:
                for k, v in fields.items():
                    setattr(existing_unit, k, v)
                existing_unit.fetched_at = utcnow()
            else:
                db.add(
                    RentalUnitSupply(
                        house_manage_no=hmn, model_no=model_no,
                        fetched_at=utcnow(), **fields,
                    )
                )
            unit_upserted += 1
        db.commit()

        job.status = "completed"
        job.total_items = len(detail_rows) + len(unit_rows)
        job.processed_items = upserted + unit_upserted
        job.completed_at = utcnow()
        db.commit()
        logger.info(
            "민간임대 청약 수집 완료: 공고 %d건, 평형 %d건", upserted, unit_upserted
        )
    except Exception as e:
        try:
            db.rollback()
            job.status = "failed"
            job.error_message = str(e)[:500]
            db.commit()
        except Exception:
            fail_job_safely(job_id, str(e)[:500])
        logger.exception("민간임대 청약 수집 실패")
    finally:
        db.close()
