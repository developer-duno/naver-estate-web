"""오피스텔 청약 수집 잡 회귀 가드 (이슈 #323, V045 완전 분리 테이블).

핵심 검증: house_manage_no 기준 전량 upsert (apartments 로스터 매칭 게이트 없음
— V045 완전 분리 테이블이라 애초에 apartments 를 참조하지 않는다), PUBLIC_DATA_API_KEY
미설정 시 조용히 cancelled 기록 (기존 collect_public_trade_data 패턴), 페이지네이션,
odcloud 실측 필드 매핑(TP/EXCLUSE_AR/SUPLY_HSHLDCO).
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

    from db.mb_models import OfficetelPresaleSchedule

    row = (
        db.query(OfficetelPresaleSchedule)
        .filter(OfficetelPresaleSchedule.house_manage_no == "2026000999")
        .first()
    )
    assert row is not None
    assert row.house_nm == "테스트오피스텔"
    assert row.tot_supply == 50


def test_collect_officetel_presale_upserts_without_apartment_table_at_all(db):
    """P0 재발방지 가드 — apartments 테이블에 대응 행이 전혀 없어도(SQLite 테스트 DB에
    apartments fixture 자체를 안 만들어도) officetel upsert 가 성공함을 명시적으로
    증명한다. V045 완전 분리 테이블은 apartments 를 참조(FK 포함)조차 하지 않으므로
    이 테스트는 애초에 apartments 관련 fixture/import 를 일절 사용하지 않는다 —
    그 자체가 증명이다(옛 매칭 게이트는 mibunyang 이 오피스텔 API 를 호출하지 않아
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

    from db.mb_models import OfficetelPresaleSchedule

    row = (
        db.query(OfficetelPresaleSchedule)
        .filter(OfficetelPresaleSchedule.house_manage_no == "2026999999")
        .first()
    )
    assert row is not None
    assert row.house_nm == "미등록오피스텔"

    job = (
        db.query(CrawlJob)
        .filter(CrawlJob.job_type == "officetel_presale")
        .order_by(CrawlJob.id.desc())
        .first()
    )
    assert job.status == "completed"


def test_collect_officetel_presale_paginates_detail_until_short_page(db):
    """totalCount > per_page 일 때 detail 이 전체 페이지 수집됨을 확인.

    len(rows) < per_page 로 마지막 페이지를 판정하는 단순 방식 — 1페이지가
    per_page 로 꽉 차면 계속 진행하고, 짧은 페이지를 받으면 종료한다.
    """
    from crawler.service_applyhome_officetel import collect_officetel_presale

    page1 = {
        "data": [
            {"HOUSE_MANAGE_NO": f"P1-{i}", "HOUSE_NM": f"단지{i}", "RCRIT_PBLANC_DE": "2026-08-01"}
            for i in range(2)
        ],
        "totalCount": 3,
    }
    page2 = {
        "data": [{"HOUSE_MANAGE_NO": "P2-0", "HOUSE_NM": "단지마지막", "RCRIT_PBLANC_DE": "2026-08-02"}],
        "totalCount": 3,
    }
    fake_unit = {"data": [], "totalCount": 0}

    with (
        patch.dict(os.environ, {"PUBLIC_DATA_API_KEY": "fake-key-for-test"}),
        patch(
            "crawler.service_applyhome_officetel.fetch_officetel_detail",
            side_effect=[page1, page2],
        ) as mock_detail,
        patch(
            "crawler.service_applyhome_officetel.fetch_officetel_unit",
            return_value=fake_unit,
        ),
    ):
        collect_officetel_presale(batch_size=2, scheduler_job_id="test_officetel")

    assert mock_detail.call_count == 2

    from db.mb_models import OfficetelPresaleSchedule

    rows = db.query(OfficetelPresaleSchedule).all()
    house_manage_nos = {r.house_manage_no for r in rows}
    assert house_manage_nos == {"P1-0", "P1-1", "P2-0"}


def test_collect_officetel_presale_paginates_unit_until_short_page(db):
    """unit 도 동일 페이지네이션 적용 — totalCount > per_page 시 전체 페이지 수집."""
    from crawler.service_applyhome_officetel import collect_officetel_presale

    fake_detail = {
        "data": [{"HOUSE_MANAGE_NO": "H1", "HOUSE_NM": "단지1", "RCRIT_PBLANC_DE": "2026-08-01"}],
        "totalCount": 1,
    }
    unit_page1 = {
        "data": [
            {"HOUSE_MANAGE_NO": "H1", "MODEL_NO": "01", "TP": "59A"},
            {"HOUSE_MANAGE_NO": "H1", "MODEL_NO": "02", "TP": "59B"},
        ],
        "totalCount": 3,
    }
    unit_page2 = {
        "data": [{"HOUSE_MANAGE_NO": "H1", "MODEL_NO": "03", "TP": "84A"}],
        "totalCount": 3,
    }

    with (
        patch.dict(os.environ, {"PUBLIC_DATA_API_KEY": "fake-key-for-test"}),
        patch(
            "crawler.service_applyhome_officetel.fetch_officetel_detail",
            return_value=fake_detail,
        ),
        patch(
            "crawler.service_applyhome_officetel.fetch_officetel_unit",
            side_effect=[unit_page1, unit_page2],
        ) as mock_unit,
    ):
        collect_officetel_presale(batch_size=2, scheduler_job_id="test_officetel")

    assert mock_unit.call_count == 2

    from db.mb_models import OfficetelUnitSupply

    rows = db.query(OfficetelUnitSupply).filter(OfficetelUnitSupply.house_manage_no == "H1").all()
    model_nos = {r.model_no for r in rows}
    assert model_nos == {"01", "02", "03"}


def test_collect_officetel_presale_stores_unit_supply_fields(db):
    """신규 컬럼(supply_area/supply_hshldco/supply_amount/subscrpt_reqst_amount) 저장 확인.

    odcloud 실측(2026-08-10 재검증): 이 오퍼레이션은 HOUSE_TY/SUPLY_AR/특별공급
    유형별 필드가 없다 — 실제로는 TP(주택형)/EXCLUSE_AR(전용면적)/SUPLY_HSHLDCO
    (통합 공급세대수)/SUPLY_AMOUNT(공급금액)/SUBSCRPT_REQST_AMOUNT(청약신청금)뿐이다.
    처음 만들었던 general_supply/special_supply/special_by_type(아파트 청약 틀 복사)은
    원본 데이터가 API 에 없어 재설계로 제거됐다. top_amount 는 아파트 청약과 공유하는
    키라 컬럼만 유지되고 이 오퍼레이션에선 항상 None.
    """
    from crawler.service_applyhome_officetel import collect_officetel_presale

    fake_detail = {
        "data": [{"HOUSE_MANAGE_NO": "H2", "HOUSE_NM": "단지2", "RCRIT_PBLANC_DE": "2026-08-01"}],
        "totalCount": 1,
    }
    fake_unit = {
        "data": [
            {
                "HOUSE_MANAGE_NO": "H2",
                "MODEL_NO": "01",
                "TP": "75OA",
                "EXCLUSE_AR": "75.8112",
                "SUPLY_HSHLDCO": 3,
                "SUPLY_AMOUNT": "73970",
                "SUBSCRPT_REQST_AMOUNT": "300",
            }
        ],
        "totalCount": 1,
    }

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

    from db.mb_models import OfficetelUnitSupply

    row = (
        db.query(OfficetelUnitSupply)
        .filter(OfficetelUnitSupply.house_manage_no == "H2", OfficetelUnitSupply.model_no == "01")
        .first()
    )
    assert row is not None
    assert row.house_ty == "75OA"
    assert row.supply_area == 75.8112
    assert row.supply_hshldco == 3
    assert row.supply_amount == 73970
    assert row.subscrpt_reqst_amount == 300
    assert row.top_amount is None


def test_collect_officetel_presale_stores_region_name(db):
    """SUBSCRPT_AREA_CODE_NM(청약 지역명) 이 region_name 컬럼에 저장됨을 확인.

    지역 필터 로직 자체는 아직 미구현(get_officetel_schedules() dead parameter) —
    데이터 적재만 이번 리뉴얼 범위(2026-08-10).
    """
    from crawler.service_applyhome_officetel import collect_officetel_presale

    fake_detail = {
        "data": [
            {
                "HOUSE_MANAGE_NO": "H3",
                "HOUSE_NM": "단지3",
                "RCRIT_PBLANC_DE": "2026-08-01",
                "SUBSCRPT_AREA_CODE_NM": "경기",
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

    from db.mb_models import OfficetelPresaleSchedule

    row = (
        db.query(OfficetelPresaleSchedule)
        .filter(OfficetelPresaleSchedule.house_manage_no == "H3")
        .first()
    )
    assert row is not None
    assert row.region_name == "경기"
