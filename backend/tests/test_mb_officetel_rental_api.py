"""오피스텔·민간임대 청약 API 회귀 가드 (이슈 #323)."""
from datetime import date

from fastapi.testclient import TestClient

from db.mb_models import (
    PresaleScheduleOfficial,
    RentalScheduleOfficial,
)


def test_get_officetel_rental_returns_both_kinds(client: TestClient, db):
    """오피스텔(house_manage_no 기준 전량 upsert) + 민간임대(독립) 를 한 목록에
    합쳐 반환, 각 kind 필드로 구분."""
    db.add(
        PresaleScheduleOfficial(
            apartment_id="ah-9990001",
            house_manage_no="9990001",
            house_type="officetel",
            recruit_date=date(2026, 8, 1),
        )
    )
    db.add(
        RentalScheduleOfficial(
            house_manage_no="9990002",
            house_nm="임대B",
            recruit_date=date(2026, 8, 2),
        )
    )
    db.commit()

    resp = client.get("/api/mb/presale/officetel-rental")
    assert resp.status_code == 200
    data = resp.json()
    kinds = {item["kind"] for item in data["items"]}
    assert kinds == {"officetel", "rental"}
    assert data["total"] == 2

    # 근본수정 회귀(2026-08-08): 오피스텔은 apartments 로스터와 매칭될 상대가
    # 구조적으로 없다 — apartment_name JOIN 을 기대하지 않는다(항상 None).
    # apartment_id 는 자체 발급 placeholder 로 그대로 노출.
    officetel_item = next(item for item in data["items"] if item["kind"] == "officetel")
    assert officetel_item["apartment_name"] is None
    assert officetel_item["apartment_id"] == "ah-9990001"


def test_get_officetel_rental_officetel_without_apartment_row_still_returned(client: TestClient, db):
    """apartments 로스터에 매칭되는 단지가 없는 게 정상 상태다 (2026-08-08 근본수정
    — 매칭 게이트 자체를 제거) — 목록에서 빠지지 않고 apartment_name=None 으로 표시."""
    db.add(
        PresaleScheduleOfficial(
            apartment_id="ah-missing",
            house_manage_no="9990003",
            house_type="officetel",
            recruit_date=date(2026, 8, 3),
        )
    )
    db.commit()

    resp = client.get("/api/mb/presale/officetel-rental")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["apartment_name"] is None
    assert data["items"][0]["apartment_id"] == "ah-missing"


def test_get_officetel_rental_empty_when_no_data(client: TestClient, db):
    """데이터 0건이어도 200 + 빈 배열 (에러 아님, error-propagation.md 반례 아님 — 정상 빈 상태)."""
    resp = client.get("/api/mb/presale/officetel-rental")
    assert resp.status_code == 200
    assert resp.json()["items"] == []
    assert resp.json()["total"] == 0
