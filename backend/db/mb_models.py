"""mibunyang 테이블 ORM 모델 — 같은 Supabase DB, 기존 Base 상속

apartments(97), unsold_history, regions, trades, prices, trade_stats,
builders, infra, schools, transport, presale_schedule_official,
applyhome_unit_supply 12개 테이블 매핑.
apartments는 핵심 컬럼만 매핑 (SQLAlchemy는 매핑 안 된 컬럼 무시).
"""

from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    Integer,
    Numeric,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from db.database import Base

# ── 아파트 단지 (mibunyang 핵심) ──────────────────────────────


class Apartment(Base):
    """미분양 아파트 단지 정보 (97컬럼 중 핵심만 매핑)"""

    __tablename__ = "apartments"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    region: Mapped[str] = mapped_column(Text, nullable=False)
    gu: Mapped[str | None] = mapped_column(Text)
    dong: Mapped[str | None] = mapped_column(Text)
    address: Mapped[str | None] = mapped_column(Text)
    latitude: Mapped[float | None] = mapped_column("lat", Float)
    longitude: Mapped[float | None] = mapped_column("lng", Float)

    # 기본 정보
    builder: Mapped[str | None] = mapped_column(Text)
    units: Mapped[int | None] = mapped_column(Integer)
    unsold: Mapped[int | None] = mapped_column(Integer)
    unsold_rate: Mapped[float | None] = mapped_column(Float)
    completion: Mapped[str | None] = mapped_column(Text)
    heating: Mapped[str | None] = mapped_column(Text)
    max_floor: Mapped[int | None] = mapped_column(Integer)
    parking_ratio: Mapped[float | None] = mapped_column(Float)
    floor_area_ratio: Mapped[float | None] = mapped_column(Float)
    building_coverage_ratio: Mapped[float | None] = mapped_column(Numeric)
    exclusive_ratio: Mapped[float | None] = mapped_column(Float)  # 전용률 (%)

    # 혜택
    discount_pct: Mapped[float | None] = mapped_column(Float)
    balcony_free: Mapped[bool | None] = mapped_column(Boolean)
    balcony_value: Mapped[int | None] = mapped_column(Integer)
    option_free: Mapped[bool | None] = mapped_column(Boolean)
    option_value: Mapped[int | None] = mapped_column(Integer)
    cashback: Mapped[int | None] = mapped_column(Integer)
    benefits: Mapped[dict | None] = mapped_column(JSON)

    # 분양 정보
    presale_min_price: Mapped[int | None] = mapped_column(Integer)
    presale_max_price: Mapped[int | None] = mapped_column(Integer)
    presale_pp: Mapped[int | None] = mapped_column(Integer)
    presale_type: Mapped[str | None] = mapped_column(Text)
    presale_stage: Mapped[str | None] = mapped_column(Text)
    presale_move_in: Mapped[str | None] = mapped_column(Text)

    # 네이버 연동
    naver_nearby_median: Mapped[int | None] = mapped_column(Integer)
    naver_jeonse_rate: Mapped[float | None] = mapped_column(Float)
    naver_sell_count: Mapped[int | None] = mapped_column(Integer)
    naver_build_year: Mapped[int | None] = mapped_column(Integer)
    naver_school_walk_min: Mapped[float | None] = mapped_column(Float)  # 학교 도보 시간 (분)

    # 규제/환경
    is_regulated: Mapped[bool | None] = mapped_column(Boolean)
    noise: Mapped[float | None] = mapped_column(Float)
    noxious_dist: Mapped[float | None] = mapped_column(Float)  # 가장 가까운 유해시설까지 거리 (m)
    road_address: Mapped[str | None] = mapped_column(Text)
    district: Mapped[str | None] = mapped_column(Text)

    # 세대당 월 관리비 합산 (mibunyang 수집, 만원)
    avg_maintenance_cost: Mapped[int | None] = mapped_column(Integer)

    # 관리비 5 항목 분리 (mibunyang W3, 2026-05-13 동기화)
    maint_heat: Mapped[int | None] = mapped_column(Integer)
    maint_hotwater: Mapped[int | None] = mapped_column(Integer)
    maint_gas: Mapped[int | None] = mapped_column(Integer)
    maint_elec: Mapped[int | None] = mapped_column(Integer)
    maint_water: Mapped[int | None] = mapped_column(Integer)

    # 청약 경쟁률 (mibunyang 수집, 약 63% 채움)
    competition_rate: Mapped[float | None] = mapped_column(Float)
    competition_applicants: Mapped[int | None] = mapped_column(Integer)
    competition_supply: Mapped[int | None] = mapped_column(Integer)

    # 안전 — 단지 범죄 안전등급 1~5(낮을수록 안전, 약 97% 채움) / 내진설계 여부(약 64%)
    crime_safety_grade: Mapped[int | None] = mapped_column(Integer)
    quake_design: Mapped[bool | None] = mapped_column(Boolean)

    # 주거 환경 — 조망 / 주향 / 난방연료 / 복도구조 (mibunyang 수집)
    view: Mapped[str | None] = mapped_column(Text)
    primary_direction: Mapped[str | None] = mapped_column(Text)
    heat_fuel: Mapped[str | None] = mapped_column(Text)
    corridor_type: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime | None] = mapped_column(DateTime)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime)


# ── 미분양 이력 ──────────────────────────────────────────────


class UnsoldHistory(Base):
    """미분양 추이 (apartment_id FK, 월별)"""

    __tablename__ = "unsold_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    apartment_id: Mapped[str] = mapped_column(Text, nullable=False)
    base_month: Mapped[str] = mapped_column(Text, nullable=False)
    unsold_count: Mapped[int | None] = mapped_column(Integer)
    post_completion_unsold: Mapped[int | None] = mapped_column(Integer)
    change: Mapped[int | None] = mapped_column(Integer)
    recorded_at: Mapped[date] = mapped_column(Date, nullable=False)


# ── 지역 통계 ────────────────────────────────────────────────


class MBRegion(Base):
    """지역별 인구/세대/미분양/시세 통계"""

    __tablename__ = "regions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    region: Mapped[str] = mapped_column(Text, nullable=False)
    gu: Mapped[str | None] = mapped_column(Text)
    population: Mapped[int | None] = mapped_column(Integer)
    households: Mapped[int | None] = mapped_column(Integer)
    regional_unsold: Mapped[float | None] = mapped_column(Float)
    pop_growth: Mapped[float | None] = mapped_column(Float)
    avg_income: Mapped[int | None] = mapped_column(Integer)
    supply_ratio: Mapped[float | None] = mapped_column(Float)
    jeonse_rate: Mapped[float | None] = mapped_column(Float)
    avg_price: Mapped[int | None] = mapped_column(Integer)
    net_migration: Mapped[int | None] = mapped_column(Integer)
    price_index: Mapped[float | None] = mapped_column(Float)
    avg_price_sqm: Mapped[float | None] = mapped_column(Float)
    new_supply: Mapped[int | None] = mapped_column(Integer)
    initial_sale_rate: Mapped[float | None] = mapped_column(Float)
    land_cost_ratio: Mapped[float | None] = mapped_column(Float)
    recorded_at: Mapped[date] = mapped_column(Date, nullable=False)


# ── 실거래 ───────────────────────────────────────────────────


class MBTrade(Base):
    """실거래 데이터 (공공데이터 기반)"""

    __tablename__ = "trades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    region: Mapped[str] = mapped_column(Text, nullable=False)
    gu: Mapped[str | None] = mapped_column(Text)
    dong: Mapped[str | None] = mapped_column(Text)
    deal_month: Mapped[str | None] = mapped_column(Text)
    area: Mapped[float | None] = mapped_column(Float)
    price: Mapped[int | None] = mapped_column(Integer)
    floor: Mapped[int | None] = mapped_column(Integer)
    build_year: Mapped[int | None] = mapped_column(Integer)
    trade_type: Mapped[str | None] = mapped_column(Text)
    deposit: Mapped[int | None] = mapped_column(Integer)
    apt_name: Mapped[str | None] = mapped_column(Text)
    cancel_date: Mapped[str | None] = mapped_column(Text)
    dealing_type: Mapped[str | None] = mapped_column(Text)
    recorded_at: Mapped[date] = mapped_column(Date, nullable=False)


# ── 분양가 ───────────────────────────────────────────────────


class MBPrice(Base):
    """분양가/평당가 (apartment_id FK)"""

    __tablename__ = "prices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    apartment_id: Mapped[str] = mapped_column(Text, nullable=False)
    area: Mapped[float | None] = mapped_column(Float)
    supply_area: Mapped[float | None] = mapped_column(Float)
    price: Mapped[int | None] = mapped_column(Integer)
    pp: Mapped[int | None] = mapped_column(Integer)
    house_type: Mapped[str | None] = mapped_column(Text)
    supply_count: Mapped[int | None] = mapped_column(Integer)
    recorded_at: Mapped[date] = mapped_column(Date, nullable=False)


# ── 거래 통계 ────────────────────────────────────────────────


class TradeStats(Base):
    """단지별 거래 통계 (apartment_id PK)"""

    __tablename__ = "trade_stats"

    apartment_id: Mapped[str] = mapped_column(Text, primary_key=True)
    nearby_median: Mapped[int | None] = mapped_column(Integer)
    recent_trades_6m: Mapped[int | None] = mapped_column(Integer)
    jeonse_rate: Mapped[float | None] = mapped_column(Float)
    pir: Mapped[float | None] = mapped_column(Float)
    psr: Mapped[float | None] = mapped_column(Float)
    price_by_area: Mapped[dict | None] = mapped_column(JSON)
    rent_by_area: Mapped[dict | None] = mapped_column(JSON)
    jeonse_by_area: Mapped[dict | None] = mapped_column(JSON)
    price_by_floor: Mapped[dict | None] = mapped_column(JSON)
    avg_floor: Mapped[int | None] = mapped_column(Integer)
    floor_range: Mapped[str | None] = mapped_column(Text)
    cancel_ratio_6m: Mapped[float | None] = mapped_column(Float)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime)


# ── 시공사 ───────────────────────────────────────────────────


class Builder(Base):
    """시공사 재무/신용 정보"""

    __tablename__ = "builders"

    name: Mapped[str] = mapped_column(Text, primary_key=True)
    debt_ratio: Mapped[float | None] = mapped_column(Float)
    credit_grade: Mapped[str | None] = mapped_column(Text)
    hug_guarantee: Mapped[bool | None] = mapped_column(Boolean)
    corp_code: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime)


# ── 인프라 ───────────────────────────────────────────────────


class Infra(Base):
    """주변 인프라 (병원/마트/편의점/카페/공원 등 거리)"""

    __tablename__ = "infra"

    apartment_id: Mapped[str] = mapped_column(Text, primary_key=True)
    hospital: Mapped[int | None] = mapped_column(Integer)
    hospital_dist: Mapped[float | None] = mapped_column(Float)
    mart: Mapped[int | None] = mapped_column(Integer)
    mart_dist: Mapped[float | None] = mapped_column(Float)
    conv: Mapped[int | None] = mapped_column(Integer)
    conv_dist: Mapped[float | None] = mapped_column(Float)
    cafe: Mapped[int | None] = mapped_column(Integer)
    cafe_dist: Mapped[float | None] = mapped_column(Float)
    culture: Mapped[int | None] = mapped_column(Integer)
    culture_dist: Mapped[float | None] = mapped_column(Float)
    bank: Mapped[int | None] = mapped_column(Integer)
    bank_dist: Mapped[float | None] = mapped_column(Float)
    pharmacy: Mapped[int | None] = mapped_column(Integer)
    pharmacy_dist: Mapped[float | None] = mapped_column(Float)
    park: Mapped[int | None] = mapped_column(Integer)
    park_dist: Mapped[float | None] = mapped_column(Float)
    subway_dist: Mapped[float | None] = mapped_column(Float)
    nearby_facilities: Mapped[dict | None] = mapped_column(JSON)
    # 응급의료기관 (V012)
    emergency_hospital: Mapped[int | None] = mapped_column(Integer)
    emergency_hospital_dist: Mapped[float | None] = mapped_column(Float)
    emergency_beds: Mapped[int | None] = mapped_column(Integer)
    emergency_level: Mapped[str | None] = mapped_column(Text)
    # 응급의료기관 시설명/분류 (mibunyang W4, 2026-05-13 동기화)
    emergency_name: Mapped[str | None] = mapped_column(Text)
    emergency_type: Mapped[str | None] = mapped_column(Text)
    # V054: 응급의료 갱신 시각 — collect_emergency_data 의 "오래된 것 우선" 순환 키.
    # 공용 updated_at 은 mibunyang 도 갱신해 순환 키로 못 쓴다 (V054 주석 참조).
    emergency_updated_at: Mapped[datetime | None] = mapped_column(DateTime)
    # 대기질 — 에어코리아 (V012)
    air_station_name: Mapped[str | None] = mapped_column(Text)
    air_station_dist: Mapped[float | None] = mapped_column(Float)
    air_pm10: Mapped[float | None] = mapped_column(Float)
    air_pm25: Mapped[float | None] = mapped_column(Float)
    air_o3: Mapped[float | None] = mapped_column(Float)
    air_grade: Mapped[str | None] = mapped_column(Text)
    # 측정값을 실제로 받았을 때만 찍힌다 (세션 280 — 전부 None 인데 찍으면 신선도 green
    # 인데 화면은 빈값). 이 의미론 때문에 순환 키로는 못 쓴다 → V055 참조.
    air_updated_at: Mapped[datetime | None] = mapped_column(DateTime)
    # V055: 대기질 수집 "시도" 시각 — collect_air_quality 의 "오래된 것 우선" 순환 키.
    # 측정소 미발견·측정값 전무여도 찍는다(안 찍으면 그 단지가 NULLS FIRST 앞자리를
    # 영구 독점해 순환이 멈춘다). air_updated_at 과 분리한 사유는 V055 주석 참조.
    air_attempted_at: Mapped[datetime | None] = mapped_column(DateTime)
    # 어린이집 (V013)
    childcare_count: Mapped[int | None] = mapped_column(Integer)
    childcare_nearest_dist: Mapped[float | None] = mapped_column(Float)
    childcare_nearest_name: Mapped[str | None] = mapped_column(Text)
    childcare_nearest_capacity: Mapped[int | None] = mapped_column(Integer)
    childcare_nearest_type: Mapped[str | None] = mapped_column(Text)  # V019
    childcare_nearest_teachers: Mapped[int | None] = mapped_column(Integer)  # V019
    # V053: 어린이집 갱신 시각 — collect_childcare_data 의 "오래된 것 우선" 순환 키.
    # 공용 updated_at 은 mibunyang 도 갱신해 순환 키로 못 쓴다 (V053 주석 참조).
    childcare_updated_at: Mapped[datetime | None] = mapped_column(DateTime)
    # 범죄통계 (V013)
    crime_score: Mapped[int | None] = mapped_column(Integer)
    crime_grade: Mapped[str | None] = mapped_column(Text)
    crime_updated_at: Mapped[datetime | None] = mapped_column(DateTime)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime)


# ── 학군 ─────────────────────────────────────────────────────


class School(Base):
    """학군 정보 (apartment_id PK)"""

    __tablename__ = "schools"

    apartment_id: Mapped[str] = mapped_column(Text, primary_key=True)
    school_score: Mapped[int | None] = mapped_column(Integer)
    school_grade: Mapped[str | None] = mapped_column(Text)
    nearby_schools: Mapped[dict | None] = mapped_column(JSON)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime)


# ── 교통 ─────────────────────────────────────────────────────


class Transport(Base):
    """교통 정보 (지하철/버스/IC/KTX)"""

    __tablename__ = "transport"

    apartment_id: Mapped[str] = mapped_column(Text, primary_key=True)
    bus_routes: Mapped[int | None] = mapped_column(Integer)
    ic_dist: Mapped[float | None] = mapped_column(Float)
    ktx_dist: Mapped[float | None] = mapped_column(Float)
    subway_dist: Mapped[float | None] = mapped_column(Float)
    subway_name: Mapped[str | None] = mapped_column(Text)
    subway_lines: Mapped[str | None] = mapped_column(Text)
    bus_stop_names: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime)


# ── 에어코리아 측정소 캐시 ───────────────────────────────────


class AirQualityStation(Base):
    """에어코리아 측정소 위치 캐시 — 근접 측정소 매칭용"""

    __tablename__ = "air_quality_stations"

    station_name: Mapped[str] = mapped_column(Text, primary_key=True)
    address: Mapped[str | None] = mapped_column(Text)
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime)


# ── 청약홈 공식 분양 일정 (mibunyang collect-applyhome-detail.mjs 수집) ──


class PresaleScheduleOfficial(Base):
    """청약홈 공식 분양 일정 12종 (한국부동산원 getAPTLttotPblancDetail).

    mibunyang 의 collect-applyhome-detail.mjs 가 주 1회 수집.
    UNIQUE(apartment_id, house_manage_no): 차수별 복합키.
    """

    __tablename__ = "presale_schedule_official"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    apartment_id: Mapped[str] = mapped_column(Text, nullable=False)
    house_manage_no: Mapped[str] = mapped_column(Text, nullable=False)
    pblanc_no: Mapped[str | None] = mapped_column(Text)
    recruit_date: Mapped[date | None] = mapped_column(Date)
    special_receipt_bgnde: Mapped[date | None] = mapped_column(Date)
    special_receipt_endde: Mapped[date | None] = mapped_column(Date)
    general_rank1_bgnde: Mapped[date | None] = mapped_column(Date)
    general_rank1_endde: Mapped[date | None] = mapped_column(Date)
    general_rank2_bgnde: Mapped[date | None] = mapped_column(Date)
    general_rank2_endde: Mapped[date | None] = mapped_column(Date)
    winner_announce_date: Mapped[date | None] = mapped_column(Date)
    contract_bgnde: Mapped[date | None] = mapped_column(Date)
    contract_endde: Mapped[date | None] = mapped_column(Date)
    move_in_ym: Mapped[str | None] = mapped_column(Text)        # YYYYMM 문자열
    tot_supply: Mapped[int | None] = mapped_column(Integer)
    pblanc_url: Mapped[str | None] = mapped_column(Text)
    biz_entity: Mapped[str | None] = mapped_column(Text)        # 사업주체/시행
    constructor: Mapped[str | None] = mapped_column(Text)       # 시공사
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime)
    house_type: Mapped[str] = mapped_column(Text, nullable=False, default="apt")
    house_nm: Mapped[str | None] = mapped_column(Text)  # 오피스텔 청약홈 API 단지명(HOUSE_NM), 아파트 행은 NULL


# ── 청약홈 평형별 공급정보 (mibunyang collect-applyhome-detail.mjs 수집) ──


class ApplyhomeUnitSupply(Base):
    """청약홈 평형별 공급정보 (getAPTLttotPblancMdl). 단지당 평형 1:N.

    special_by_type JSON: 특공유형별 세대수
    (dazanyeo/sinhon/saengae_choecho/nobumo/cheongnyeon/sinsaenga/gigwan/etc).
    """

    __tablename__ = "applyhome_unit_supply"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    apartment_id: Mapped[str] = mapped_column(Text, nullable=False)
    house_manage_no: Mapped[str] = mapped_column(Text, nullable=False)
    model_no: Mapped[str] = mapped_column(Text, nullable=False)
    house_ty: Mapped[str | None] = mapped_column(Text)          # 주택형 "051.0000A"
    supply_area: Mapped[float | None] = mapped_column(Float)    # 공급면적 ㎡
    general_supply: Mapped[int | None] = mapped_column(Integer) # 일반공급 세대수
    special_supply: Mapped[int | None] = mapped_column(Integer) # 특별공급 합계
    special_by_type: Mapped[dict | None] = mapped_column(JSON)  # 유형별 세대수
    top_amount: Mapped[int | None] = mapped_column(Integer)     # 분양최고금액 (만원)
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime)
    house_type: Mapped[str] = mapped_column(Text, nullable=False, default="apt")


# ── 청약홈 공공지원 민간임대 (naver-estate-web 자체 수집, apartments 독립) ──


class RentalScheduleOfficial(Base):
    """청약홈 공공지원 민간임대 공고 일정 (getPblPvtRentLttotPblancDetail).

    apartments 테이블과 독립 — 임대주택은 우리 로스터에 없는 별도 매물.
    UNIQUE(house_manage_no): 공고 단위 유일.
    """

    __tablename__ = "rental_schedule_official"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    house_manage_no: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    pblanc_no: Mapped[str | None] = mapped_column(Text)
    house_nm: Mapped[str] = mapped_column(Text, nullable=False)
    address: Mapped[str | None] = mapped_column(Text)
    recruit_date: Mapped[date | None] = mapped_column(Date)
    receipt_bgnde: Mapped[date | None] = mapped_column(Date)
    receipt_endde: Mapped[date | None] = mapped_column(Date)
    winner_announce_date: Mapped[date | None] = mapped_column(Date)
    contract_bgnde: Mapped[date | None] = mapped_column(Date)
    contract_endde: Mapped[date | None] = mapped_column(Date)
    move_in_ym: Mapped[str | None] = mapped_column(Text)
    tot_supply: Mapped[int | None] = mapped_column(Integer)
    pblanc_url: Mapped[str | None] = mapped_column(Text)
    biz_entity: Mapped[str | None] = mapped_column(Text)
    constructor: Mapped[str | None] = mapped_column(Text)
    region_code: Mapped[str | None] = mapped_column(Text)
    # SUBSCRPT_AREA_CODE_NM(청약 지역명, "서울" 등) — V049 근본수정(세션 384).
    # region_code(숫자코드)는 필터 비교 대상(한글 시도명)과 맞지 않아 지역 필터가
    # 항상 빈 결과만 냈다(세션 383 발견). 오피스텔 짝꿍 컬럼(officetel_presale_
    # schedule.region_name)과 동일 패턴 — get_rental_schedules() 필터 기준 컬럼.
    region_name: Mapped[str | None] = mapped_column(Text)
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime)


class RentalUnitSupply(Base):
    """청약홈 공공지원 민간임대 평형별 공급정보 (getPblPvtRentLttotPblancMdl).

    house_manage_no 로 RentalScheduleOfficial 과 N:1.
    """

    __tablename__ = "rental_unit_supply"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    house_manage_no: Mapped[str] = mapped_column(Text, nullable=False)
    model_no: Mapped[str] = mapped_column(Text, nullable=False)
    house_ty: Mapped[str | None] = mapped_column(Text)
    supply_area: Mapped[float | None] = mapped_column(Float)
    exclusive_area: Mapped[float | None] = mapped_column(Float)
    contract_area: Mapped[float | None] = mapped_column(Float)
    general_supply: Mapped[int | None] = mapped_column(Integer)
    youth_supply: Mapped[int | None] = mapped_column(Integer)
    newlywed_supply: Mapped[int | None] = mapped_column(Integer)
    elderly_supply: Mapped[int | None] = mapped_column(Integer)
    monthly_rent: Mapped[int | None] = mapped_column(Integer)
    deposit: Mapped[int | None] = mapped_column(Integer)
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime)


# ── 청약홈 오피스텔·도시형 (naver-estate-web 자체 소유, V045) ──


class OfficetelPresaleSchedule(Base):
    """청약홈 오피스텔·도시형 청약 공고 일정 (getUrbtyOfctlLttotPblancDetail).

    naver-estate-web 자체 소유, mibunyang/apartments 와 완전 독립(FK 없음) —
    mibunyang 은 오피스텔 API 를 아예 호출하지 않아 apartments 로스터에 대응
    행이 구조적으로 존재할 수 없다(2026-08-08 근본수정, 이슈 #323).
    UNIQUE(house_manage_no): 공고 단위 유일.
    """

    __tablename__ = "officetel_presale_schedule"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    house_manage_no: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    pblanc_no: Mapped[str | None] = mapped_column(Text)
    house_nm: Mapped[str] = mapped_column(Text, nullable=False)
    recruit_date: Mapped[date | None] = mapped_column(Date)
    special_receipt_bgnde: Mapped[date | None] = mapped_column(Date)
    special_receipt_endde: Mapped[date | None] = mapped_column(Date)
    general_rank1_bgnde: Mapped[date | None] = mapped_column(Date)
    general_rank1_endde: Mapped[date | None] = mapped_column(Date)
    general_rank2_bgnde: Mapped[date | None] = mapped_column(Date)
    general_rank2_endde: Mapped[date | None] = mapped_column(Date)
    winner_announce_date: Mapped[date | None] = mapped_column(Date)
    contract_bgnde: Mapped[date | None] = mapped_column(Date)
    contract_endde: Mapped[date | None] = mapped_column(Date)
    move_in_ym: Mapped[str | None] = mapped_column(Text)
    tot_supply: Mapped[int | None] = mapped_column(Integer)
    pblanc_url: Mapped[str | None] = mapped_column(Text)
    biz_entity: Mapped[str | None] = mapped_column(Text)
    constructor: Mapped[str | None] = mapped_column(Text)
    # SUBSCRPT_AREA_CODE_NM(청약 지역명, "경기" 등) — 지역 필터 구현 완료
    # (get_officetel_schedules() region_name 필터, 세션 382). mojibake 우려는
    # 2026-08-24 실측으로 재현 안 됨 확인(API charset=UTF-8 명시, prod 저장값 정상 —
    # backend/db/mb_apartment_queries.py 주석 참조).
    region_name: Mapped[str | None] = mapped_column(Text)
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime)


class OfficetelUnitSupply(Base):
    """청약홈 오피스텔·도시형 평형별 공급정보 (getUrbtyOfctlLttotPblancMdl).

    naver-estate-web 자체 소유, mibunyang/apartments 와 완전 독립(FK 없음) —
    OfficetelPresaleSchedule 하나만 house_manage_no 로 참조(N:1).

    2026-08-10 재설계: 아파트 청약 API 필드(general_supply/special_supply/
    special_by_type)를 그대로 복사해 만들었으나 오피스텔 API는 이 필드들을
    전혀 주지 않는다(라이브 재검증 확정) — 실제 응답 필드(SUPLY_HSHLDCO/
    SUPLY_AMOUNT/SUBSCRPT_REQST_AMOUNT)로 교체.
    """

    __tablename__ = "officetel_unit_supply"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    house_manage_no: Mapped[str] = mapped_column(Text, nullable=False)
    model_no: Mapped[str] = mapped_column(Text, nullable=False)
    house_ty: Mapped[str | None] = mapped_column(Text)
    supply_area: Mapped[float | None] = mapped_column(Float)
    # SUPLY_HSHLDCO — 공급세대수(일반/특별 구분 없는 통합값).
    supply_hshldco: Mapped[int | None] = mapped_column(Integer)
    # SUPLY_AMOUNT — 공급금액(단위 미확인, 만원 추정).
    supply_amount: Mapped[int | None] = mapped_column(Integer)
    # SUBSCRPT_REQST_AMOUNT — 청약신청금(단위 미확인, 만원 추정).
    subscrpt_reqst_amount: Mapped[int | None] = mapped_column(Integer)
    # 아파트 청약(ApplyhomeUnitSupply)과 시리얼라이저·FE(MbUnitSupplyTable)가
    # 공유하는 키라 컬럼은 유지 — 오피스텔 API 응답엔 대응 필드가 없어 항상 NULL.
    top_amount: Mapped[int | None] = mapped_column(Integer)
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime)
