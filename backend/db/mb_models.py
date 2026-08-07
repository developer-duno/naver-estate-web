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
    # 대기질 — 에어코리아 (V012)
    air_station_name: Mapped[str | None] = mapped_column(Text)
    air_station_dist: Mapped[float | None] = mapped_column(Float)
    air_pm10: Mapped[float | None] = mapped_column(Float)
    air_pm25: Mapped[float | None] = mapped_column(Float)
    air_o3: Mapped[float | None] = mapped_column(Float)
    air_grade: Mapped[str | None] = mapped_column(Text)
    air_updated_at: Mapped[datetime | None] = mapped_column(DateTime)
    # 어린이집 (V013)
    childcare_count: Mapped[int | None] = mapped_column(Integer)
    childcare_nearest_dist: Mapped[float | None] = mapped_column(Float)
    childcare_nearest_name: Mapped[str | None] = mapped_column(Text)
    childcare_nearest_capacity: Mapped[int | None] = mapped_column(Integer)
    childcare_nearest_type: Mapped[str | None] = mapped_column(Text)  # V019
    childcare_nearest_teachers: Mapped[int | None] = mapped_column(Integer)  # V019
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
