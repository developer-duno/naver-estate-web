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


def test_get_officetel_rental_region_filters_officetel_by_region_name(client: TestClient, db):
    """오피스텔 region_name 필터 회귀 가드 (2026-08-24 세션382 구현).

    OfficetelPresaleSchedule.region_name 은 prod 실측(17개 시도명 mibunyang
    Apartment.region 과 완전 일치 확인)을 근거로 필터링 대상이 됐다 —
    region_name 이 일치하는 행만 반환되고 불일치분은 제외된다.

    민간임대(RentalScheduleOfficial.region_name) 는 아래
    test_get_officetel_rental_region_filters_rental_by_region_name 이 별도로
    다룬다 (V049 근본수정, 세션 384 — 옛 region_code 숫자코드 결함 해소).
    """
    db.add(
        OfficetelPresaleSchedule(
            house_manage_no="8880001",
            house_nm="서울오피스텔",
            region_name="서울",
            recruit_date=date(2026, 8, 1),
        )
    )
    db.add(
        OfficetelPresaleSchedule(
            house_manage_no="8880002",
            house_nm="부산오피스텔",
            region_name="부산",
            recruit_date=date(2026, 8, 2),
        )
    )
    db.commit()

    resp = client.get("/api/mb/presale/officetel-rental", params={"region": "서울"})
    assert resp.status_code == 200
    data = resp.json()
    house_manage_nos = {item["house_manage_no"] for item in data["items"]}

    assert "8880001" in house_manage_nos
    assert "8880002" not in house_manage_nos


def test_get_officetel_rental_no_region_returns_all_officetel(client: TestClient, db):
    """region 파라미터 없으면 오피스텔 전량 반환 (정상 케이스 — 필터 부작용 없음)."""
    db.add(
        OfficetelPresaleSchedule(
            house_manage_no="8880004",
            house_nm="전국오피스텔",
            region_name="경기",
            recruit_date=date(2026, 8, 1),
        )
    )
    db.commit()

    resp = client.get("/api/mb/presale/officetel-rental")
    assert resp.status_code == 200
    data = resp.json()
    house_manage_nos = {item["house_manage_no"] for item in data["items"]}
    assert "8880004" in house_manage_nos


def test_get_officetel_rental_region_filters_rental_by_region_name(client: TestClient, db):
    """민간임대 region_name 필터 회귀 가드 — V049 근본수정 (세션 384).

    옛 region_code(숫자코드, "100" 등) 필터는 한글 시도명과 절대 매칭되지
    않아 region 파라미터를 넘기면 민간임대 행이 항상 0건이었다(세션 383 발견).
    region_name(한글 지역명) 필터로 전환한 뒤에는 오피스텔과 동일하게 정상
    필터링돼야 한다 — 뮤테이션 검증: 이 assert 를 region_code 비교로 되돌리면
    "서울" 필터에 아무 것도 안 걸려 실패함을 확인(원상복구 완료).
    """
    db.add(
        RentalScheduleOfficial(
            house_manage_no="7770001",
            house_nm="서울임대",
            region_name="서울",
            recruit_date=date(2026, 8, 1),
        )
    )
    db.add(
        RentalScheduleOfficial(
            house_manage_no="7770002",
            house_nm="부산임대",
            region_name="부산",
            recruit_date=date(2026, 8, 2),
        )
    )
    db.commit()

    resp = client.get("/api/mb/presale/officetel-rental", params={"region": "서울"})
    assert resp.status_code == 200
    data = resp.json()
    house_manage_nos = {item["house_manage_no"] for item in data["items"]}

    assert "7770001" in house_manage_nos
    assert "7770002" not in house_manage_nos


def test_get_officetel_rental_region_pending_recollect_rental_excluded(client: TestClient, db):
    """V049 적용 이전 수집분(region_name NULL)은 region 필터 시 제외된다 —
    데이터 유실이 아니라 재수집 대기 상태임을 명시하는 회귀 가드 (세션 384)."""
    db.add(
        RentalScheduleOfficial(
            house_manage_no="7770003",
            house_nm="구버전임대",
            region_code="100",  # 옛 방식 — region_name 없음
            recruit_date=date(2026, 8, 3),
        )
    )
    db.commit()

    resp = client.get("/api/mb/presale/officetel-rental", params={"region": "서울"})
    assert resp.status_code == 200
    data = resp.json()
    house_manage_nos = {item["house_manage_no"] for item in data["items"]}
    assert "7770003" not in house_manage_nos

    # region 파라미터 없이 조회하면 정상적으로 보임 (재수집 전에도 목록 자체는 정상)
    resp_all = client.get("/api/mb/presale/officetel-rental")
    assert "7770003" in {item["house_manage_no"] for item in resp_all.json()["items"]}
