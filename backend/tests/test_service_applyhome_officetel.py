"""오피스텔 청약 수집 잡 회귀 가드 (이슈 #323).

핵심 검증: house_manage_no 매칭 대상 단지가 apartments 에 없으면 skip(에러 아님),
PUBLIC_DATA_API_KEY 미설정 시 조용히 cancelled 기록 (기존 collect_public_trade_data 패턴).
"""
import os
from unittest.mock import patch

from db.mb_models import Apartment
from db.models import CrawlJob


def test_collect_officetel_presale_skips_when_key_missing(db):
    """API 키 미설정 시 API 호출 없이 cancelled job 기록."""
    from crawler.service_applyhome_officetel import collect_officetel_presale

    with patch.dict(os.environ, {}, clear=False):
        os.environ.pop("PUBLIC_DATA_API_KEY", None)
        collect_officetel_presale(scheduler_job_id="test_officetel")

    job = (
        db.query(CrawlJob)
        .filter(CrawlJob.job_type == "officetel_presale")
        .order_by(CrawlJob.id.desc())
        .first()
    )
    assert job is not None
    assert job.status == "cancelled"


def test_collect_officetel_presale_upserts_matched_apartment(db):
    """API 응답의 house_manage_no 가 이미 apartments 에 등록돼 있으면 upsert."""
    from crawler.service_applyhome_officetel import collect_officetel_presale

    apt = Apartment(id="ah-2026000999", name="테스트오피스텔", region="서울")
    db.add(apt)
    db.commit()

    fake_detail = {
        "data": [
            {
                "HOUSE_MANAGE_NO": "2026000999",
                "PBLANC_NO": "2026000999",
                "HOUSE_NM": "테스트오피스텔",
                "RCRIT_PBLANC_DE": "2026-08-06",
                "TOT_SUPLY_HSHLDCO": 50,
            }
        ],
        "totalCount": 1,
    }
    fake_unit = {"data": [], "totalCount": 0}

    with (
        patch.dict(os.environ, {"PUBLIC_DATA_API_KEY": "fake-key-for-test"}),
        patch(
            "crawler.service_applyhome_officetel.fetch_officetel_detail",
            return_value=fake_detail,
        ),
        patch(
            "crawler.service_applyhome_officetel.fetch_officetel_unit",
            return_value=fake_unit,
        ),
    ):
        collect_officetel_presale(scheduler_job_id="test_officetel")

    from db.mb_models import PresaleScheduleOfficial

    row = (
        db.query(PresaleScheduleOfficial)
        .filter(PresaleScheduleOfficial.house_manage_no == "2026000999")
        .first()
    )
    assert row is not None
    assert row.house_type == "officetel"
    assert row.apartment_id == "ah-2026000999"


def test_collect_officetel_presale_skips_unmatched_apartment(db):
    """apartments 에 없는 house_manage_no 는 저장하지 않고 넘어간다 (에러 아님)."""
    from crawler.service_applyhome_officetel import collect_officetel_presale

    fake_detail = {
        "data": [
            {
                "HOUSE_MANAGE_NO": "2026999999",
                "HOUSE_NM": "미등록오피스텔",
                "RCRIT_PBLANC_DE": "2026-08-06",
            }
        ],
        "totalCount": 1,
    }
    fake_unit = {"data": [], "totalCount": 0}

    with (
        patch.dict(os.environ, {"PUBLIC_DATA_API_KEY": "fake-key-for-test"}),
        patch(
            "crawler.service_applyhome_officetel.fetch_officetel_detail",
            return_value=fake_detail,
        ),
        patch(
            "crawler.service_applyhome_officetel.fetch_officetel_unit",
            return_value=fake_unit,
        ),
    ):
        collect_officetel_presale(scheduler_job_id="test_officetel")

    from db.mb_models import PresaleScheduleOfficial

    row = (
        db.query(PresaleScheduleOfficial)
        .filter(PresaleScheduleOfficial.house_manage_no == "2026999999")
        .first()
    )
    assert row is None

    job = (
        db.query(CrawlJob)
        .filter(CrawlJob.job_type == "officetel_presale")
        .order_by(CrawlJob.id.desc())
        .first()
    )
    assert job.status == "completed"
