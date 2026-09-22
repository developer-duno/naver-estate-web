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


def test_collect_rental_presale_update_without_region_field_clears_region_name(db):
    """갱신 응답에 SUBSCRPT_AREA_CODE_NM 이 없으면 기존 region_name 이 None 으로
    덮어써진다 (현재 동작 고정 — service_applyhome_rental.py:77 이 row.get() 을
    무조건 대입하는 기존 설계. house_nm 등 다른 필드도 동일 패턴이라 이 함수만의
    결함이 아니라 이 잡 전체의 "응답을 항상 전체 최신값으로 신뢰" 가정이다.
    청약홈이 실제로 회차마다 이 필드를 빠뜨리는지는 별도 확인 필요 — 이 테스트는
    "빠뜨리면 어떻게 되는가"만 고정한다)."""
    from db.mb_models import RentalScheduleOfficial
    from utils import utcnow

    db.add(
        RentalScheduleOfficial(
            house_manage_no="2026800003",
            house_nm="옛이름",
            region_code="100",
            region_name="서울",
            fetched_at=utcnow(),
        )
    )
    db.commit()

    from crawler.service_applyhome_rental import collect_rental_presale

    fake_detail = {
        "data": [
            {
                "HOUSE_MANAGE_NO": "2026800003",
                "HOUSE_NM": "새이름",
                "RCRIT_PBLANC_DE": "2026-08-07",
                # SUBSCRPT_AREA_CODE / SUBSCRPT_AREA_CODE_NM 필드 자체가 없는 응답
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

    row = (
        db.query(RentalScheduleOfficial)
        .filter(RentalScheduleOfficial.house_manage_no == "2026800003")
        .first()
    )
    assert row.house_nm == "새이름"
    assert row.region_code is None
    assert row.region_name is None


# ---------------------------------------------------------------------------
# 실제 API 응답 픽스처 회귀 가드 (세션557)
#
# 왜 이 가드가 필요한가: 위 테스트들의 fake 응답은 **코드가 찾는 필드명으로 직접
# 만들어져** 있어, 실제 청약홈 응답과 이름이 달라도 늘 통과했다. 그래서
# rental_unit_supply 8칸·rental_schedule_official 4칸이 운영에서 전수 0% 인 것을
# 1년 가까이 아무도 못 봤다. rental_schedule_official 은 mb.py:283 에서 실제
# 호출돼 그 빈 값이 손님에게 그대로 나갔다. rental_unit_supply 는 직렬화 함수
# (rental_unit_supply_to_dict)가 있으나 어느 라우터에서도 호출되지 않아 현재는
# 손님 화면에 안 닿는다(적대검증 2026-09-22 확인) — DB 값 자체가 틀린 것은 사실이라 고친다.
#
# 아래 픽스처는 2026-09-22 라이브 응답 100행 전수를 그대로 옮긴 것이다
# (getPblPvtRentLttotPblancMdl / getPblPvtRentLttotPblancDetail, 전 필드 100/100 출현).
# 필드명을 다시 잘못 적으면 이 가드가 먼저 red 가 된다.
# ---------------------------------------------------------------------------

#: 평형별 공급 — 라이브 응답 그대로 (필드명·자료형 포함)
LIVE_UNIT_ROW = {
    "HOUSE_MANAGE_NO": "2026850049",
    "MODEL_NO": "01",
    "TP": "59A-1",
    "SUPLY_AR": "82.8550",
    "EXCLUSE_AR": "59.8947",
    "CNTRCT_AR": "126.3517",
    "GNSPLY_HSHLDCO": 30,
    "SPSPLY_YGMN_HSHLDCO": 0,
    "SPSPLY_NEW_MRRG_HSHLDCO": 0,
    "SPSPLY_AGED_HSHLDCO": 0,
    "SUPLY_HSHLDCO": 30,
    "SUPLY_AMOUNT": "19380",
    "SUBSCRPT_REQST_AMOUNT": "10",
    "GP": "-",
    "PBLANC_NO": "2026850049",
}

#: 공고 상세 — 라이브 응답 그대로
LIVE_DETAIL_ROW = {
    "HOUSE_MANAGE_NO": "2026850049",
    "PBLANC_NO": "2026850049",
    "HOUSE_NM": "부경경마공원역 대방 디에트르 더리버(AP1BL)",
    "HSSPLY_ADRES": "부산광역시 강서구 범방동 2008번지",
    "RCRIT_PBLANC_DE": "20260921",
    "SUBSCRPT_RCEPT_BGNDE": "20260928",
    "SUBSCRPT_RCEPT_ENDDE": "20260929",
    "PRZWNER_PRESNATN_DE": "20261002",
    "CNTRCT_CNCLS_BGNDE": "20261006",
    "CNTRCT_CNCLS_ENDDE": "20261007",
    "MVN_PREARNGE_YM": "202712",
    "TOT_SUPLY_HSHLDCO": 80,
    "BSNS_MBY_NM": "대방건설 주식회사",
    "SUBSCRPT_AREA_CODE": "600",
    "SUBSCRPT_AREA_CODE_NM": "부산",
    "PBLANC_URL": "https://www.applyhome.co.kr/ai/aia/selectPRMOLttotPblancDetailView.do",
}


def _collect_with_live_fixture(monkeypatch=None):
    """라이브 픽스처로 수집 1회 — 두 테스트가 공유."""
    from crawler.service_applyhome_rental import collect_rental_presale

    with (
        patch.dict(os.environ, {"PUBLIC_DATA_API_KEY": "fake-key-for-test"}),
        patch(
            "crawler.service_applyhome_rental.fetch_rental_detail",
            return_value={"data": [LIVE_DETAIL_ROW], "totalCount": 1},
        ),
        patch(
            "crawler.service_applyhome_rental.fetch_rental_unit",
            return_value={"data": [LIVE_UNIT_ROW], "totalCount": 1},
        ),
    ):
        collect_rental_presale(scheduler_job_id="test_rental_live")


def test_rental_unit_supply_fills_from_live_field_names(db):
    """평형별 공급 — 실제 응답 필드명으로 8칸이 채워진다.

    옛 코드는 EXCLU_AR·GNRL_HSHLDCO·HOUSE_TY 등을 찾아 **전수 0%** 였다.
    """
    from db.mb_models import RentalUnitSupply

    _collect_with_live_fixture()

    row = (
        db.query(RentalUnitSupply)
        .filter(
            RentalUnitSupply.house_manage_no == "2026850049",
            RentalUnitSupply.model_no == "01",
        )
        .first()
    )
    assert row is not None
    assert row.house_ty == "59A-1"            # TP
    assert row.supply_area == 82.8550         # SUPLY_AR
    assert row.exclusive_area == 59.8947      # EXCLUSE_AR (옛 EXCLU_AR)
    assert row.contract_area == 126.3517      # CNTRCT_AR
    assert row.general_supply == 30           # GNSPLY_HSHLDCO (옛 GNRL_HSHLDCO)
    assert row.youth_supply == 0              # SPSPLY_YGMN_HSHLDCO
    assert row.newlywed_supply == 0           # SPSPLY_NEW_MRRG_HSHLDCO
    assert row.elderly_supply == 0            # SPSPLY_AGED_HSHLDCO
    assert row.supply_amount == 19380         # SUPLY_AMOUNT (신설)
    assert row.subscrpt_reqst_amount == 10  # SUBSCRPT_REQST_AMOUNT (신설)
    # 월세·보증금은 이 API 가 주지 않는다 — 비어 있는 것이 정상이다.
    assert row.monthly_rent is None
    assert row.deposit is None


def test_rental_schedule_fills_dates_from_live_response(db):
    """공고 일정 — 접수·당첨발표·계약·입주월 4칸이 채워진다.

    옛 코드는 이 4칸을 **아예 매핑하지 않아** DB 컬럼이 있는데도 전수 0% 였다.
    """
    from datetime import date

    from db.mb_models import RentalScheduleOfficial

    _collect_with_live_fixture()

    row = (
        db.query(RentalScheduleOfficial)
        .filter(RentalScheduleOfficial.house_manage_no == "2026850049")
        .first()
    )
    assert row is not None
    assert row.receipt_bgnde == date(2026, 9, 28)         # SUBSCRPT_RCEPT_BGNDE
    assert row.receipt_endde == date(2026, 9, 29)         # SUBSCRPT_RCEPT_ENDDE
    assert row.winner_announce_date == date(2026, 10, 2)  # PRZWNER_PRESNATN_DE
    assert row.contract_bgnde == date(2026, 10, 6)        # CNTRCT_CNCLS_BGNDE
    assert row.contract_endde == date(2026, 10, 7)        # CNTRCT_CNCLS_ENDDE
    assert row.move_in_ym == "202712"                     # MVN_PREARNGE_YM
    # 시공사는 이 API 가 주지 않는다(사업주체 BSNS_MBY_NM 만 준다).
    assert row.biz_entity == "대방건설 주식회사"
    assert row.constructor is None


def test_rental_schedule_dates_fill_on_update_path_too(db):
    """**갱신 분기**도 일정 4칸을 채운다.

    운영 DB 에는 이미 186행이 있어 실제로 도는 것은 `if existing:` 쪽이다.
    신규 삽입만 검증하면 운영에서만 빈칸이 남는다 — 같은 수집을 두 번 돌려
    두 번째(=갱신 경로)에서도 값이 들어오는지 본다.
    """
    from datetime import date

    from db.mb_models import RentalScheduleOfficial, RentalUnitSupply

    _collect_with_live_fixture()  # 1회차 = 신규 삽입
    _collect_with_live_fixture()  # 2회차 = 갱신 분기

    rows = (
        db.query(RentalScheduleOfficial)
        .filter(RentalScheduleOfficial.house_manage_no == "2026850049")
        .all()
    )
    assert len(rows) == 1, "upsert 인데 중복 행이 생겼다"
    assert rows[0].receipt_bgnde == date(2026, 9, 28)
    assert rows[0].winner_announce_date == date(2026, 10, 2)
    assert rows[0].move_in_ym == "202712"

    units = (
        db.query(RentalUnitSupply)
        .filter(RentalUnitSupply.house_manage_no == "2026850049")
        .all()
    )
    assert len(units) == 1, "평형 upsert 인데 중복 행이 생겼다"
    assert units[0].exclusive_area == 59.8947
    assert units[0].general_supply == 30
    assert units[0].supply_amount == 19380
