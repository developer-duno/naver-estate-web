"""민간임대 청약 수집 잡 회귀 가드 (이슈 #323).

오피스텔과 달리 apartments 매칭이 없다 — house_manage_no 자체가 PK라
전량 upsert (skip 로직 없음, 설계 §4-2: '로스터에 없는 별도 매물').
"""
import os
from unittest.mock import patch

from db.models import CrawlJob


def test_collect_rental_presale_skips_when_key_missing(db):
    from crawler.service_applyhome_rental import collect_rental_presale

    with patch.dict(os.environ, {}, clear=False):
        os.environ.pop("PUBLIC_DATA_API_KEY", None)
        collect_rental_presale(scheduler_job_id="test_rental")

    job = (
        db.query(CrawlJob)
        .filter(CrawlJob.job_type == "rental_presale")
        .order_by(CrawlJob.id.desc())
        .first()
    )
    assert job.status == "cancelled"


def test_collect_rental_presale_inserts_new_listing(db):
    """apartments 매칭 없이 house_manage_no 로 바로 upsert."""
    from crawler.service_applyhome_rental import collect_rental_presale

    fake_detail = {
        "data": [
            {
                "HOUSE_MANAGE_NO": "2026800001",
                "HOUSE_NM": "테스트행복주택",
                "HSSPLY_ADRES": "서울 강남구",
                "RCRIT_PBLANC_DE": "2026-08-06",
                "TOT_SUPLY_HSHLDCO": 30,
                "SUBSCRPT_AREA_CODE": "100",
                "SUBSCRPT_AREA_CODE_NM": "서울",
            }
        ],
        "totalCount": 1,
    }
    fake_unit = {"data": [], "totalCount": 0}

    with (
        patch.dict(os.environ, {"PUBLIC_DATA_API_KEY": "fake-key-for-test"}),
        patch(
            "crawler.service_applyhome_rental.fetch_rental_detail",
            return_value=fake_detail,
        ),
        patch(
            "crawler.service_applyhome_rental.fetch_rental_unit",
            return_value=fake_unit,
        ),
    ):
        collect_rental_presale(scheduler_job_id="test_rental")

    from db.mb_models import RentalScheduleOfficial

    row = (
        db.query(RentalScheduleOfficial)
        .filter(RentalScheduleOfficial.house_manage_no == "2026800001")
        .first()
    )
    assert row is not None
    assert row.house_nm == "테스트행복주택"
    assert row.region_code == "100"
    assert row.region_name == "서울"


def test_collect_rental_presale_updates_existing_listing(db):
    """이미 있는 house_manage_no 는 갱신(upsert), 중복행 생성 안 함."""
    from db.mb_models import RentalScheduleOfficial
    from utils import utcnow

    db.add(
        RentalScheduleOfficial(
            house_manage_no="2026800002",
            house_nm="옛이름",
            fetched_at=utcnow(),
        )
    )
    db.commit()

    from crawler.service_applyhome_rental import collect_rental_presale

    fake_detail = {
        "data": [
            {
                "HOUSE_MANAGE_NO": "2026800002",
                "HOUSE_NM": "새이름",
                "RCRIT_PBLANC_DE": "2026-08-07",
            }
        ],
        "totalCount": 1,
    }
    fake_unit = {"data": [], "totalCount": 0}

    with (
        patch.dict(os.environ, {"PUBLIC_DATA_API_KEY": "fake-key-for-test"}),
        patch(
            "crawler.service_applyhome_rental.fetch_rental_detail",
            return_value=fake_detail,
        ),
        patch(
            "crawler.service_applyhome_rental.fetch_rental_unit",
            return_value=fake_unit,
        ),
    ):
        collect_rental_presale(scheduler_job_id="test_rental")

    rows = (
        db.query(RentalScheduleOfficial)
        .filter(RentalScheduleOfficial.house_manage_no == "2026800002")
        .all()
    )
    assert len(rows) == 1
    assert rows[0].house_nm == "새이름"
