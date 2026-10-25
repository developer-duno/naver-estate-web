"""가격 이력 / 통계 / 추이 쿼리"""

from typing import Optional

from sqlalchemy import and_, func, select, text
from sqlalchemy.orm import Session

from db.models import (
    Article,
    ArticlePriceHistory,
    ComplexOfficialPrice,
    ComplexPriceHistory,
    KaptComplexMap,
    KaptManagementCost,
)


def get_article_price_history(
    db: Session, article_no: str, limit: int = 50
) -> list[ArticlePriceHistory]:
    """매물의 가격 변동 이력 조회"""
    stmt = (
        select(ArticlePriceHistory)
        .where(ArticlePriceHistory.article_no == article_no)
        .order_by(ArticlePriceHistory.recorded_at.desc())
        .limit(limit)
    )
    return db.execute(stmt).scalars().all()



def _floor_area_group(db: Session, complex_no: str) -> int | None:
    """층별 시세에 쓸 면적 묶음(정수 ㎡) — 세션 475 PR 6.

    complexes.rep_area_m2 → 없으면 평형표 세대수 최다 묶음(pick_representative) → 그래도 없으면 None(전체 매물).
    """
    from crawler.area_group import area_group_of, load_pyeong_tables, pick_representative
    from db.models import Complex

    rep = db.query(Complex.rep_area_m2).filter(Complex.complex_no == complex_no).scalar()
    if isinstance(rep, int) and not isinstance(rep, bool):
        group = area_group_of(rep)
        if group is not None:
            return group
    return pick_representative(load_pyeong_tables(db, [complex_no]).get(complex_no), None)


def get_price_stats_aggregated(db: Session, complex_no: str) -> dict:
    """단지 매물 가격 통계 — SQL 집계 (면적 5m² 버킷 + 층수 3티어)

    층수 3티어는 대표 면적 묶음 매물만(세션 475 PR 6 — 여러 면적이 섞인 평균을 막는다). 응답 floor_area_m2 =
    그 묶음(정수 ㎡), 묶음을 모르면 None 이고 그때는 전체 매물로 센다. 면적 묶음 판정 = 내림(area_group_of 와 같음).
    """
    AREA_BUCKET = 5
    floor_area = _floor_area_group(db, complex_no)

    area_stmt = text("""
        SELECT
            ROUND(area2_m2 / :bucket) * :bucket AS area_bucket,
            trade_type_name,
            COUNT(*) AS cnt,
            ROUND(AVG(numeric_price)) AS avg_price,
            MIN(numeric_price) AS min_price,
            MAX(numeric_price) AS max_price
        FROM articles
        WHERE complex_no = :cno AND is_active = TRUE AND numeric_price IS NOT NULL
            AND area2_m2 IS NOT NULL AND area2_m2 > 0
        GROUP BY area_bucket, trade_type_name
        ORDER BY area_bucket, trade_type_name
    """).bindparams(cno=complex_no, bucket=AREA_BUCKET)
    area_rows = db.execute(area_stmt).fetchall()

    # floor_stmt 는 PostgreSQL `~` regex + `SPLIT_PART` 의존 → SQLite 미지원.
    # 테스트 엔진 (SQLite) 에서는 floor_rows 빈 배열로 우회 (by_floor 만 빈 결과,
    # by_area + tt_key_map 매핑 검증은 정상 동작). backend/CLAUDE.md §CI 답습.
    dialect_name = db.bind.dialect.name if db.bind else ""
    if dialect_name == "postgresql":
        # 대표 면적 묶음만 — FLOOR = 소수점 버림(crawler/area_group.area_group_of 와 같은 규칙)
        area_cond = "AND area2_m2 IS NOT NULL AND FLOOR(area2_m2) = :area" if floor_area is not None else ""
        floor_stmt = text(f"""
            SELECT
                CASE
                    WHEN floor_info ~ '^[0-9]+' THEN
                        CASE
                            WHEN CAST(SPLIT_PART(floor_info, '/', 1) AS INTEGER) BETWEEN 1 AND 5 THEN '저층(1-5)'
                            WHEN CAST(SPLIT_PART(floor_info, '/', 1) AS INTEGER) BETWEEN 6 AND 15 THEN '중층(6-15)'
                            WHEN CAST(SPLIT_PART(floor_info, '/', 1) AS INTEGER) > 15 THEN '고층(16+)'
                        END
                    WHEN LEFT(floor_info, 1) IN ('저', '중', '고') THEN
                        CASE LEFT(floor_info, 1)
                            WHEN '저' THEN '저층(1-5)'
                            WHEN '중' THEN '중층(6-15)'
                            WHEN '고' THEN '고층(16+)'
                        END
                END AS floor_tier,
                trade_type_name,
                COUNT(*) AS cnt,
                ROUND(AVG(numeric_price)) AS avg_price,
                MIN(numeric_price) AS min_price,
                MAX(numeric_price) AS max_price
            FROM articles
            WHERE complex_no = :cno AND is_active = TRUE AND numeric_price IS NOT NULL
                AND floor_info IS NOT NULL
                {area_cond}
            GROUP BY floor_tier, trade_type_name
            HAVING CASE
                    WHEN floor_info ~ '^[0-9]+' THEN
                        CASE
                            WHEN CAST(SPLIT_PART(floor_info, '/', 1) AS INTEGER) BETWEEN 1 AND 5 THEN '저층(1-5)'
                            WHEN CAST(SPLIT_PART(floor_info, '/', 1) AS INTEGER) BETWEEN 6 AND 15 THEN '중층(6-15)'
                            WHEN CAST(SPLIT_PART(floor_info, '/', 1) AS INTEGER) > 15 THEN '고층(16+)'
                        END
                    WHEN LEFT(floor_info, 1) IN ('저', '중', '고') THEN
                        CASE LEFT(floor_info, 1)
                            WHEN '저' THEN '저층(1-5)'
                            WHEN '중' THEN '중층(6-15)'
                            WHEN '고' THEN '고층(16+)'
                        END
                END IS NOT NULL
            ORDER BY floor_tier, trade_type_name
        """).bindparams(cno=complex_no)
        if floor_area is not None:
            floor_stmt = floor_stmt.bindparams(area=floor_area)
        floor_rows = db.execute(floor_stmt).fetchall()
    else:
        floor_rows = []

    # 단기임대 → wolse 합산: 보증금 단위·구조 월세 동일, FE tradeKey 짝꿍 답습.
    # 새 거래유형 추가 시 본 dict + frontend/src/lib/trade-types.ts:17 양쪽 답습.
    # 주의: SQL GROUP BY 가 trade_type_name 별로 나누므로 wolse(월세) + wolse(단기임대)
    # 두 행이 같은 키에 들어옴 → count 합산 + 평균 가중평균 계산 의무.
    tt_key_map = {"매매": "maemae", "전세": "jeonse", "월세": "wolse", "단기임대": "wolse"}
    area_data: dict[float, dict] = {}
    # wolse 합산용 (count, sum) 임시 누적 — 가중평균 계산 후 entry 에 반영
    area_wolse_accum: dict[float, tuple[int, int]] = {}
    for row in area_rows:
        bucket = float(row[0]) if row[0] is not None else 0
        tt = row[1]
        key = tt_key_map.get(tt)
        if not key:
            continue
        cnt = int(row[2])
        avg = int(row[3]) if row[3] else 0
        entry = area_data.setdefault(bucket, {"label": f"{int(bucket)}m²"})
        if key == "wolse" and bucket in area_wolse_accum:
            prev_cnt, prev_sum = area_wolse_accum[bucket]
            new_cnt = prev_cnt + cnt
            new_sum = prev_sum + avg * cnt
            area_wolse_accum[bucket] = (new_cnt, new_sum)
            entry[key] = new_sum // new_cnt if new_cnt else 0
            entry[f"{key}_count"] = new_cnt
        else:
            if key == "wolse":
                area_wolse_accum[bucket] = (cnt, avg * cnt)
            entry[key] = avg
            entry[f"{key}_count"] = cnt

    by_area = [area_data[b] for b in sorted(area_data)]

    floor_data: dict[str, dict] = {}
    floor_wolse_accum: dict[str, tuple[int, int, int, int]] = {}  # (cnt, sum, min, max)
    for row in floor_rows:
        tier = row[0]
        tt = row[1]
        key = tt_key_map.get(tt)
        if not key or not tier:
            continue
        cnt = int(row[2])
        avg = int(row[3]) if row[3] else 0
        row_min = int(row[4]) if row[4] else 0
        row_max = int(row[5]) if row[5] else 0
        entry = floor_data.setdefault(tier, {"label": tier})
        if key == "wolse" and tier in floor_wolse_accum:
            prev_cnt, prev_sum, prev_min, prev_max = floor_wolse_accum[tier]
            new_cnt = prev_cnt + cnt
            new_sum = prev_sum + avg * cnt
            new_min = min(prev_min, row_min) if row_min else prev_min
            new_max = max(prev_max, row_max)
            floor_wolse_accum[tier] = (new_cnt, new_sum, new_min, new_max)
            entry[f"{key}_avg"] = new_sum // new_cnt if new_cnt else 0
            entry[f"{key}_min"] = new_min
            entry[f"{key}_max"] = new_max
            entry[f"{key}_count"] = new_cnt
        else:
            if key == "wolse":
                floor_wolse_accum[tier] = (cnt, avg * cnt, row_min, row_max)
            entry[f"{key}_avg"] = avg
            entry[f"{key}_min"] = row_min
            entry[f"{key}_max"] = row_max
            entry[f"{key}_count"] = cnt

    floor_order = ["저층(1-5)", "중층(6-15)", "고층(16+)"]
    by_floor = [floor_data[f] for f in floor_order if f in floor_data]

    total = sum(
        entry.get(f"{k}_count", 0)
        for entry in by_area
        for k in tt_key_map.values()
    )

    return {
        "complex_no": complex_no,
        "total_articles": total,
        "by_area": by_area,
        "by_floor": by_floor,
        "floor_area_m2": floor_area,
    }


def get_price_changed_articles(
    db: Session, complex_no: str | None = None, limit: int = 50
) -> list[Article]:
    """최근 가격 변동 매물 조회"""
    conditions = [
        Article.is_active == True,  # noqa: E712
        Article.price_changed_at.isnot(None),
    ]
    if complex_no:
        conditions.append(Article.complex_no == complex_no)

    stmt = (
        select(Article)
        .where(and_(*conditions))
        .order_by(Article.price_changed_at.desc())
        .limit(limit)
    )
    return db.execute(stmt).scalars().all()


def _price_history_rows(db: Session, conditions: list) -> list[dict]:
    """complex_price_history 를 (거래유형, YYYYMM) 로 묶은 줄 — 한 달의 여러 줄은 최고·최저·평균(가중 없음)."""
    month_col = func.left(ComplexPriceHistory.base_month, 6).label("month")
    stmt = (
        select(
            ComplexPriceHistory.trade_type,
            month_col,
            func.max(ComplexPriceHistory.price_upper).label("price_upper"),
            func.min(ComplexPriceHistory.price_lower).label("price_lower"),
            func.round(func.avg(ComplexPriceHistory.price_avg)).label("price_avg"),
        )
        .where(and_(*conditions))
        .group_by(ComplexPriceHistory.trade_type, month_col)
        .order_by(month_col.asc())
    )
    return [dict(row._mapping) for row in db.execute(stmt).all()]


def _history_area(db: Session, complex_no: str, area_no: Optional[str]) -> tuple[int | None, list[str]]:
    """그래프에 쓸 면적 묶음과 그 묶음의 평형번호들(문자열) — 세션 474 B27.

    area_no 없음 → 대표 면적(complexes.rep_area_m2) 묶음 · area_no 있음 → 그 평형의 전용면적 묶음.
    묶음을 모르면 (None, []).
    """
    from crawler.area_group import area_group_of, pyeong_area_groups
    from db.models import Complex

    groups = pyeong_area_groups(db, complex_no)
    if area_no:
        try:
            group = groups.get(int(area_no))
        except (TypeError, ValueError):
            group = None
    else:
        rep = db.query(Complex.rep_area_m2).filter(Complex.complex_no == complex_no).scalar()
        group = area_group_of(rep) if isinstance(rep, int) and not isinstance(rep, bool) else None
    if group is None:
        return None, []
    return group, sorted(str(pno) for pno, area in groups.items() if area == group)


SERIES_GOV = "정부 실거래"
BASELINE_MONTHS = 24  # 그래프 기본선 기간(달력월) — basis 글자 "최근 2년" 과 짝
SERIES_NAVER = "네이버 시세"


def price_history_basis(area_m2: int | None, area_no: Optional[str] = None) -> str | None:
    """그래프 제목 아래 기준 글자 — 정본(프런트는 그대로 쓴다). 평형을 고르면 네이버 시세가 따로 그려진다는 것까지."""
    if not area_m2:
        return None
    if area_no:
        return f"전용 {area_m2}㎡ 대 정부 실거래 최저~최고 · 네이버 시세는 이 평형 값을 따로"
    return f"최근 2년 전용 {area_m2}㎡ 대 정부 실거래 최저~최고(거래는 점) · 전세는 네이버 시세"


def get_price_history_area(db: Session, complex_no: str, area_no: Optional[str] = None) -> int | None:
    """get_complex_price_history 가 쓰는 면적 묶음(응답 area_m2)."""
    return _history_area(db, complex_no, area_no)[0]


def get_complex_price_history(
    db: Session, complex_no: str, trade_type: Optional[str] = None,
    area_no: Optional[str] = None,
) -> list[dict]:
    """단지의 월별 가격 추이 (base_month를 YYYYMM으로 정규화 + 월별 집계) — 세션 474 B27: 한 면적 묶음만.

    줄마다 series(SERIES_GOV · SERIES_NAVER)를 붙여 출처를 섞지 않는다(보완 ①).
    - area_no 없음(기본선) → 대표 면적 묶음: 매매(A1) = 면적별 정부 실거래 중위만(price_median→price_avg,
      최저→price_lower, 최고→price_upper) · 그 밖(전세 등) = 그 묶음 평형의 네이버 줄. 네이버 A1 줄·옛 정부 달 평균
      ('' 줄 — 면적 섞임)은 안 쓴다.
    - area_no 있음 → 그 평형의 네이버 줄(모든 유형, SERIES_NAVER) + 그 평형 묶음의 정부 실거래(A1, SERIES_GOV).
      한 달에 둘이 있어도 합치지 않는다.
    - 묶음을 모르면(대표 면적 미계산·평형표 없음) 옛 동작 그대로(그 단지 모든 줄을 달마다 묶음, series None).
    - 정부 줄에는 trades(그 달 거래 하나하나, db/area_price_queries.api_trades 꼴)를 최근 24개월 달만 싣는다(세션 479 B29).
    """
    from crawler.metrics_helpers import _cutoff_month
    from db.models import ComplexAreaTradeStat

    group, pyeong_nos = _history_area(db, complex_no, area_no)
    # 기본선은 최근 2년(24 달력월)만 — 제목 "최근 2년" 과 같게(사장님 결정 Q3). 평형 선택은 기간 그대로.
    since = None if area_no else _cutoff_month(BASELINE_MONTHS)
    if group is None:
        conditions = [ComplexPriceHistory.complex_no == complex_no]
        if trade_type:
            conditions.append(ComplexPriceHistory.trade_type == trade_type)
        if area_no:
            conditions.append(ComplexPriceHistory.area_no == area_no)
        return [{**r, "series": None} for r in _price_history_rows(db, conditions)]

    rows: list[dict] = []
    naver_nos = [area_no] if area_no else pyeong_nos
    if naver_nos and (area_no or trade_type != "A1"):
        conditions = [
            ComplexPriceHistory.complex_no == complex_no,
            ComplexPriceHistory.area_no.in_(naver_nos),
        ]
        if trade_type:
            conditions.append(ComplexPriceHistory.trade_type == trade_type)
        if not area_no:
            conditions.append(ComplexPriceHistory.trade_type != "A1")  # 기본선 매매는 정부 실거래만
            conditions.append(func.left(ComplexPriceHistory.base_month, 6) >= since)
        rows = [{**r, "series": SERIES_NAVER} for r in _price_history_rows(db, conditions)]

    if trade_type in (None, "A1"):
        from db.area_price_queries import api_trades

        # 거래 점(trades)은 기본선·평형 선택 모두 최근 2년 달만(세션 479 B29 — 평형 선택 60개월 점 방지). 줄·띠는 그대로
        trades_since = _cutoff_month(BASELINE_MONTHS)
        for month, median, low, high, trades in (
            db.query(
                ComplexAreaTradeStat.base_month,
                ComplexAreaTradeStat.price_median,
                ComplexAreaTradeStat.price_min,
                ComplexAreaTradeStat.price_max,
                ComplexAreaTradeStat.trades,
            )
            .filter(
                ComplexAreaTradeStat.complex_no == complex_no,
                ComplexAreaTradeStat.area_m2 == group,
                ComplexAreaTradeStat.base_month >= (since or ""),
            )
            .all()
        ):
            rows.append({
                "trade_type": "A1", "month": month, "price_upper": high, "price_lower": low,
                "price_avg": median, "series": SERIES_GOV,
                "trades": api_trades(trades) if month >= trades_since else [],
            })
    rows.sort(key=lambda r: (r["month"], r["trade_type"], r["series"] or ""))
    return rows


def get_complex_official_prices(db: Session, complex_no: str) -> list[ComplexOfficialPrice]:
    """단지의 공동주택 공시가격 전체 행 조회 (연도 필터는 라우터에서 최신값만 선별)"""
    stmt = (
        select(ComplexOfficialPrice)
        .where(ComplexOfficialPrice.complex_no == complex_no)
    )
    return list(db.execute(stmt).scalars().all())


def get_latest_kapt_cost(db: Session, complex_no: str):
    """단지의 최신월 K-apt 관리비 1건 + 매칭정보. 매칭 자체가 없으면 None.

    반환은 (KaptManagementCost | None, KaptComplexMap) 튜플 — 화면이 관리비 금액과
    함께 "어느 K-apt 단지에 붙은 값인지"(kapt_name·복도유형)를 같이 보여줘야 해서
    한 번의 조인으로 가져온다.

    ⚠ **매칭 기준 LEFT JOIN** 이다(옛 구현은 관리비 기준 INNER JOIN).
    복도유형은 매칭 시점에 이미 KaptComplexMap 에 저장되므로 관리비가 없어도
    보여줄 수 있는데, INNER JOIN 이면 관리비가 없다는 이유로 복도유형까지 404 로
    함께 숨겨졌다 — 매칭 1,212건 중 관리비 보유는 19건뿐이라(2026-08-28 실측)
    사실상 대부분의 단지가 가진 정보를 못 보여주던 셈이다.

    따라서 반환 튜플의 첫 항목은 None 일 수 있고(매칭만 있고 관리비 미수집),
    호출자는 그 경우 금액 필드를 전부 null 로 내린다. 매칭 자체가 없을 때만
    None 을 돌려줘 라우터가 404 를 준다.
    """
    stmt = (
        select(KaptManagementCost, KaptComplexMap)
        .outerjoin(
            KaptManagementCost,
            KaptManagementCost.complex_no == KaptComplexMap.complex_no,
        )
        .where(KaptComplexMap.complex_no == complex_no)
        .order_by(KaptManagementCost.cost_month.desc())
        .limit(1)
    )
    return db.execute(stmt).first()
