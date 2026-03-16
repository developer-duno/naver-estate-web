"""SQLAlchemy ORM 모델"""

from datetime import datetime, timezone

from sqlalchemy import (
    String, Integer, Float, Boolean, Text, DateTime, ARRAY, Index, JSON,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from db.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Complex(Base):
    __tablename__ = "complexes"
    __table_args__ = (
        Index("ix_complexes_region", "sido", "sigungu", "dong"),
    )

    complex_no: Mapped[str] = mapped_column(String(20), primary_key=True)
    complex_name: Mapped[str] = mapped_column(String(200), nullable=False)
    cortar_no: Mapped[str | None] = mapped_column(String(20))
    real_estate_type_code: Mapped[str | None] = mapped_column(String(10))
    real_estate_type_name: Mapped[str | None] = mapped_column(String(50))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    total_household_count: Mapped[int | None] = mapped_column(Integer)
    high_floor: Mapped[int | None] = mapped_column(Integer)
    low_floor: Mapped[int | None] = mapped_column(Integer)
    use_approve_ymd: Mapped[str | None] = mapped_column(String(8))
    total_dong_count: Mapped[int | None] = mapped_column(Integer)
    min_supply_area_m2: Mapped[float | None] = mapped_column(Float)
    max_supply_area_m2: Mapped[float | None] = mapped_column(Float)
    cortar_address: Mapped[str | None] = mapped_column(String(500))
    # 비정규화 지역 컬럼
    sido: Mapped[str | None] = mapped_column(String(30))
    sigungu: Mapped[str | None] = mapped_column(String(30))
    dong: Mapped[str | None] = mapped_column(String(30))
    last_crawled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # 단지 상세 정보 (get_complex_detail API)
    heat_method_type: Mapped[str | None] = mapped_column(String(50))
    total_parking_count: Mapped[int | None] = mapped_column(Integer)
    construction_company: Mapped[str | None] = mapped_column(String(200))
    floor_area_ratio: Mapped[str | None] = mapped_column(String(20))
    building_coverage_ratio: Mapped[str | None] = mapped_column(String(20))
    detail_crawled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # 단지 상세 보완 필드
    address: Mapped[str | None] = mapped_column(String(500))
    road_address: Mapped[str | None] = mapped_column(String(500))
    heat_fuel_type: Mapped[str | None] = mapped_column(String(50))
    parking_count_by_household: Mapped[float | None] = mapped_column(Float)
    management_office_tel: Mapped[str | None] = mapped_column(String(30))
    # Phase 1: 시세 관련
    nearby_median_price: Mapped[int | None] = mapped_column(Integer)
    jeonse_rate: Mapped[float | None] = mapped_column(Float)
    recent_trades_6m: Mapped[int | None] = mapped_column(Integer)
    has_pool: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Article(Base):
    __tablename__ = "articles"
    __table_args__ = (
        Index("ix_articles_complex_active", "complex_no", "is_active"),
    )

    article_no: Mapped[str] = mapped_column(String(20), primary_key=True)
    complex_no: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    trade_type_name: Mapped[str | None] = mapped_column(String(20))
    building_name: Mapped[str | None] = mapped_column(String(50))
    floor_info: Mapped[str | None] = mapped_column(String(20))
    deal_or_warrant_prc: Mapped[str | None] = mapped_column(String(50))
    rent_prc: Mapped[str | None] = mapped_column(String(50))
    area1_m2: Mapped[float | None] = mapped_column(Float)
    area2_m2: Mapped[float | None] = mapped_column(Float)
    direction: Mapped[str | None] = mapped_column(String(20))
    article_feature_desc: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[list | None] = mapped_column(ARRAY(Text))
    realtor_name: Mapped[str | None] = mapped_column(String(100))
    article_confirm_ymd: Mapped[str | None] = mapped_column(String(8))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    complex_name: Mapped[str | None] = mapped_column(String(200))
    article_name: Mapped[str | None] = mapped_column(String(200))
    realtor_id: Mapped[str | None] = mapped_column(String(50))
    realtor_phone: Mapped[str | None] = mapped_column(String(50))
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    article_real_estate_type_name: Mapped[str | None] = mapped_column(String(50))
    is_presale: Mapped[bool] = mapped_column(Boolean, default=False)
    # 상세 정보
    detail_description: Mapped[str | None] = mapped_column(Text)
    room_count: Mapped[int | None] = mapped_column(Integer)
    bathroom_count: Mapped[int | None] = mapped_column(Integer)
    move_in_date: Mapped[str | None] = mapped_column(String(20))
    maintenance_cost: Mapped[str | None] = mapped_column(String(20))
    parking_count: Mapped[str | None] = mapped_column(String(20))
    photo_urls: Mapped[list | None] = mapped_column(ARRAY(Text))
    representative_img_url: Mapped[str | None] = mapped_column(Text)
    realtor_phone_display: Mapped[str | None] = mapped_column(String(50))
    realtor_address: Mapped[str | None] = mapped_column(String(300))
    heating_type: Mapped[str | None] = mapped_column(String(50))
    total_floor_count: Mapped[int | None] = mapped_column(Integer)
    jibun_address: Mapped[str | None] = mapped_column(String(500))
    use_approve_ymd: Mapped[str | None] = mapped_column(String(8))
    acquisition_tax: Mapped[str | None] = mapped_column(String(50))
    broker_fee: Mapped[str | None] = mapped_column(String(50))
    # 사전 계산 컬럼
    numeric_price: Mapped[int | None] = mapped_column(Integer)
    numeric_rent_price: Mapped[int | None] = mapped_column(Integer)
    price_per_pyeong: Mapped[int | None] = mapped_column(Integer)
    numeric_maintenance_cost: Mapped[int | None] = mapped_column(Integer)
    # Phase 1: 가격 변동 추적
    previous_price: Mapped[int | None] = mapped_column(Integer)
    price_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # 크롤러 메타데이터
    detail_crawled: Mapped[bool] = mapped_column(Boolean, default=False)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class CrawlJob(Base):
    __tablename__ = "crawl_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_type: Mapped[str] = mapped_column(String(30), nullable=False)
    target_id: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    total_items: Mapped[int] = mapped_column(Integer, default=0)
    processed_items: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class UserProfile(Base):
    __tablename__ = "user_profiles"

    user_id: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str] = mapped_column(String, nullable=False)
    display_name: Mapped[str | None] = mapped_column(String)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="user")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="approved")
    daily_crawl_quota: Mapped[int] = mapped_column(Integer, default=5)
    daily_export_quota: Mapped[int] = mapped_column(Integer, default=10)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    login_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str | None] = mapped_column(String)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    target_type: Mapped[str | None] = mapped_column(String(50))
    target_id: Mapped[str | None] = mapped_column(String(100))
    details: Mapped[dict | None] = mapped_column(JSON)
    ip_address: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RateLimitCounter(Base):
    __tablename__ = "rate_limit_counters"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AdminSetting(Base):
    __tablename__ = "admin_settings"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, nullable=False)
    updated_by: Mapped[str | None] = mapped_column(String)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ComplexPriceHistory(Base):
    __tablename__ = "complex_price_history"
    __table_args__ = (
        Index("idx_cph_complex", "complex_no", "trade_type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    complex_no: Mapped[str] = mapped_column(String(20), nullable=False)
    trade_type: Mapped[str] = mapped_column(String(10), nullable=False)
    area_no: Mapped[str | None] = mapped_column(String(20))
    price_upper: Mapped[int | None] = mapped_column(Integer)
    price_lower: Mapped[int | None] = mapped_column(Integer)
    price_avg: Mapped[int | None] = mapped_column(Integer)
    base_month: Mapped[str] = mapped_column(String(8), nullable=False)  # YYYYMMDD (weekly) or YYYYMM (legacy)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ArticlePriceHistory(Base):
    __tablename__ = "article_price_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    article_no: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    price: Mapped[int | None] = mapped_column(Integer)
    rent_price: Mapped[int | None] = mapped_column(Integer)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CrawlerCheckpoint(Base):
    __tablename__ = "crawler_checkpoints"

    job_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    state_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ComplexPyeongDetail(Base):
    __tablename__ = "complex_pyeong_details"
    __table_args__ = (
        UniqueConstraint("complex_no", "pyeong_no", name="complex_pyeong_details_complex_no_pyeong_no_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    complex_no: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    pyeong_no: Mapped[int] = mapped_column(Integer, nullable=False)
    pyeong_name: Mapped[str | None] = mapped_column(String(20))
    supply_area: Mapped[str | None] = mapped_column(String(20))
    supply_area_double: Mapped[float | None] = mapped_column(Float)
    exclusive_area: Mapped[str | None] = mapped_column(String(20))
    exclusive_rate: Mapped[str | None] = mapped_column(String(10))
    household_count_by_pyeong: Mapped[str | None] = mapped_column(String(20))
    entrance_type: Mapped[str | None] = mapped_column(String(30))
    room_count: Mapped[int | None] = mapped_column(Integer)
    bathroom_count: Mapped[int | None] = mapped_column(Integer)
    avg_maintenance_cost: Mapped[int | None] = mapped_column(Integer)
    summer_maintenance_cost: Mapped[int | None] = mapped_column(Integer)
    winter_maintenance_cost: Mapped[int | None] = mapped_column(Integer)
    # 면적별 상세 보완 필드
    floor_plan_url: Mapped[str | None] = mapped_column(Text)
    supply_pyeong: Mapped[str | None] = mapped_column(String(20))
    exclusive_pyeong: Mapped[str | None] = mapped_column(String(20))
    latest_maintenance_cost: Mapped[int | None] = mapped_column(Integer)
    maintenance_cost_basis: Mapped[str | None] = mapped_column(String(6))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
