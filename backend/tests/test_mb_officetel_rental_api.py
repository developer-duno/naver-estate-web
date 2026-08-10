"""오피스텔·민간임대 청약 API 회귀 가드 (이슈 #323, V045 완전 분리 테이블)."""
from datetime import date

from fastapi.testclient import TestClient

from db.mb_models import (
    OfficetelPresaleSchedule,
    RentalScheduleOfficial,
)


def test_get_officetel_rental_returns_both_kinds(client: TestClient, db):
    """오피스텔(house_manage_no 기준 전량 upsert, V045 독립 테이블) + 민간임대(독립)를
    한 목록에 합쳐 반환, 각 kind 필드로 구분."""
    db.add(
        OfficetelPresaleSchedule(
            house_manage_no="9990001",
            house_nm="테스트오피스텔A",
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

    # V045 근본수정: OfficetelPresaleSchedule 은 apartments 로스터와 완전 독립
    # (FK 없음)이라 apartment_id/apartment_name 키 자체가 응답에 없다.
    officetel_item = next(item for item in data["items"] if item["kind"] == "officetel")
    assert "apartment_id" not in officetel_item
    assert "apartment_name" not in officetel_item
    assert officetel_item["house_nm"] == "테스트오피스텔A"
    assert officetel_item["house_manage_no"] == "9990001"


def test_get_officetel_rental_officetel_without_apartment_table_row(client: TestClient, db):
    """apartments 로스터와 완전 독립이므로 애초에 매칭 여부 자체가 무의미하다
    (V045 — apartments 관련 fixture 를 전혀 만들지 않고도 정상 응답됨이 그 증명)."""
    db.add(
        OfficetelPresaleSchedule(
            house_manage_no="9990003",
            house_nm="미등록오피스텔",
            recruit_date=date(2026, 8, 3),
        )
    )
    db.commit()

    resp = client.get("/api/mb/presale/officetel-rental")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["house_nm"] == "미등록오피스텔"
    assert data["items"][0]["house_manage_no"] == "9990003"


def test_get_officetel_rental_empty_when_no_data(client: TestClient, db):
    """데이터 0건이어도 200 + 빈 배열 (에러 아님, error-propagation.md 반례 아님 — 정상 빈 상태)."""
    resp = client.get("/api/mb/presale/officetel-rental")
    assert resp.status_code == 200
    assert resp.json()["items"] == []
    assert resp.json()["total"] == 0


def test_get_officetel_rental_region_filters_only_rental_not_officetel(client: TestClient, db):
    """결함1 회귀 가드 — region 쿼리 파라미터를 넘기면 민간임대만 필터링되고,
    오피스텔은 region 컬럼 자체가 없어(V045) 전국 그대로 반환된다.

    OfficetelPresaleSchedule 에는 region 관련 컬럼이 없어 get_officetel_schedules() 는
    region 인자를 무시(dead parameter, 문서화됨) — 이 테스트는 그 사실을 오피스텔
    행이 region 값과 무관하게 항상 나타나는 것으로 검증한다. 민간임대는
    RentalScheduleOfficial.region_code 로 실제 필터링되므로, region_code 가
    일치하지 않는 행은 결과에서 빠져야 한다.
    """
    db.add(
        OfficetelPresaleSchedule(
            house_manage_no="8880001",
            house_nm="전국오피스텔",
            recruit_date=date(2026, 8, 1),
        )
    )
    db.add(
        RentalScheduleOfficial(
            house_manage_no="8880002",
            house_nm="서울임대",
            region_code="11",
            recruit_date=date(2026, 8, 2),
        )
    )
    db.add(
        RentalScheduleOfficial(
            house_manage_no="8880003",
            house_nm="부산임대",
            region_code="26",
            recruit_date=date(2026, 8, 3),
        )
    )
    db.commit()

    resp = client.get("/api/mb/presale/officetel-rental", params={"region": "11"})
    assert resp.status_code == 200
    data = resp.json()
    house_manage_nos = {item["house_manage_no"] for item in data["items"]}

    # 오피스텔은 region 필터와 무관하게 그대로 포함
    assert "8880001" in house_manage_nos
    # 민간임대는 region_code 일치분만 포함, 불일치분은 제외
    assert "8880002" in house_manage_nos
    assert "8880003" not in house_manage_nos
