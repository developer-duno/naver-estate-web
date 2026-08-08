"""오피스텔·민간임대 청약 API 회귀 가드 (이슈 #323)."""
from datetime import date

from fastapi.testclient import TestClient

from db.mb_models import (
    Apartment,
    PresaleScheduleOfficial,
    RentalScheduleOfficial,
)


def test_get_officetel_rental_returns_both_kinds(client: TestClient, db):
    """오피스텔(apartments 연결) + 민간임대(독립) 를 한 목록에 합쳐 반환, 각 kind 필드로 구분."""
    apt = Apartment(id="ah-9990001", name="오피스텔A", region="서울")
    db.add(apt)
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


def test_get_officetel_rental_empty_when_no_data(client: TestClient, db):
    """데이터 0건이어도 200 + 빈 배열 (에러 아님, error-propagation.md 반례 아님 — 정상 빈 상태)."""
    resp = client.get("/api/mb/presale/officetel-rental")
    assert resp.status_code == 200
    assert resp.json()["items"] == []
    assert resp.json()["total"] == 0
