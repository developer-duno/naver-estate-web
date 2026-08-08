"""오피스텔 청약 수집 잡 회귀 가드 (이슈 #323).

핵심 검증: house_manage_no 기준 전량 upsert (apartments 로스터 매칭 게이트 없음
— 2026-08-08 근본수정. mibunyang 은 오피스텔 API 를 아예 호출하지 않아 매칭
게이트가 구조적으로 항상 0건이었던 결함), PUBLIC_DATA_API_KEY 미설정 시 조용히
cancelled 기록 (기존 collect_public_trade_data 패턴).
"""
import os
from unittest.mock import patch

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
    """API 응답의 house_manage_no 를 apartments 매칭 여부와 무관하게 upsert."""
    from crawler.service_applyhome_officetel import collect_officetel_presale

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


def test_collect_officetel_presale_upserts_without_apartment_row(db):
    """apartments 로스터에 매칭되는 단지가 전혀 없어도 house_manage_no 기준 upsert
    (결함 수정 회귀 — 옛 매칭 게이트는 mibunyang 이 오피스텔 API 를 호출하지 않아
    apartments 에 대응 행이 구조적으로 존재할 수 없다는 사실을 놓쳐 항상 skip시켰다)."""
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
    assert row is not None
    assert row.house_type == "officetel"
    assert row.apartment_id == "ah-2026999999"

    job = (
        db.query(CrawlJob)
        .filter(CrawlJob.job_type == "officetel_presale")
        .order_by(CrawlJob.id.desc())
        .first()
    )
    assert job.status == "completed"
