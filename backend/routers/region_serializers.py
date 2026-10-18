"""정부 지역 값·공식 기준값 직렬화 — 단지 상세·비교, 매물 상세 응답에 덧붙인다 (세션 473, PR 4).

estate_serializers.py 의 순수 직렬화(ORM → dict)와 달리 여기 함수는 DB 를 읽는다(region_stats·평형·시세 기록).
목록(검색 결과·매물 목록) 직렬화에는 붙이지 않는다 — 단지·매물마다 쿼리가 늘기 때문.
붙는 곳: routers/complexes.py get_complex_detail(단지 상세 = 비교표도 같은 API) ·
routers/live/crawl.py live_article_detail(매물 상세).
"""

import math
from datetime import date, datetime, timedelta, timezone

_KST = timezone(timedelta(hours=9))
JEONSE_QUOTE_MAX_AGE_DAYS = 90   # 이 매물 전환율에 쓰는 네이버 전세 시세의 나이 상한(일)


def calc_rent_conversion_rate(monthly_rent, deposit, jeonse_price) -> float | None:
    """전월세전환율(%) — 한국부동산원 산식 월세 × 12 ÷ (전세가격 − 월세보증금) × 100, 소수 1자리.

    단위는 셋 다 만원. 분모 ≤ 0 이거나 값이 없으면 None(지어내지 않는다).
    """
    if not monthly_rent or monthly_rent <= 0 or jeonse_price is None or deposit is None:
        return None
    denom = jeonse_price - deposit
    if denom <= 0:
        return None
    return round(monthly_rent * 12 / denom * 100, 1)


def complex_region_fields(db, c) -> dict:
    """단지 상세·비교용 정부 지역 값(세션 473) — 그 단지 시군구의 부동산원 아파트 중위 전세가율 최신 달.

    목록(검색 결과) 직렬화에는 붙이지 않는다(단지마다 쿼리 1개). 값이 없으면 네 칸 모두 None.
    """
    from crawler.service_region_stats import SOURCE_OF, STAT_JEONSE_RATIO
    from db.region_stats_queries import (
        format_period,
        get_latest_sigungu_stat,
        region_code_of_complex,
        region_display_name,
    )

    code = region_code_of_complex(c)
    hit = get_latest_sigungu_stat(db, code, STAT_JEONSE_RATIO)
    name = region_display_name(code)
    if hit is None or not name:
        return {"region_jeonse_ratio": None, "region_jeonse_period": None, "region_name": None,
                "region_jeonse_source": None}
    value, period = hit
    return {
        "region_jeonse_ratio": round(value, 1),
        "region_jeonse_period": format_period(period),
        "region_name": name,
        "region_jeonse_source": SOURCE_OF[STAT_JEONSE_RATIO],
    }


def _same_pyeong_nos(db, a) -> list[int]:
    """매물과 같은 평형 후보 pyeong_no(= 시세 기록 area_no) 목록.

    매물 면적은 네이버가 소수점을 버린 정수로 준다(운영 실측 2026-10-18: 전용 59.94㎡ 평형의 매물 = 59.0) —
    그래서 평형의 전용·공급면적 **소수 버림 값**이 매물 값과 같은 평형을 후보로 본다(공급면적은 둘 다 있을 때만 대조).
    """
    from db.models import ComplexPyeongDetail

    if not a.complex_no or not a.area2_m2:
        return []
    rows = db.query(
        ComplexPyeongDetail.pyeong_no, ComplexPyeongDetail.exclusive_area, ComplexPyeongDetail.supply_area_double
    ).filter(ComplexPyeongDetail.complex_no == a.complex_no).all()
    out = []
    for pyeong_no, exclusive, supply in rows:
        try:
            ex = float(exclusive) if exclusive not in (None, "") else None
        except ValueError:
            ex = None
        if ex is None or math.floor(ex) != math.floor(a.area2_m2):
            continue
        if a.area1_m2 and supply is not None and math.floor(supply) != math.floor(a.area1_m2):
            continue
        out.append(pyeong_no)
    return out


def _latest_naver_jeonse(db, complex_no: str, pyeong_nos: list[int], today: date | None = None) -> tuple[int, str] | None:
    """같은 단지·같은 평형의 네이버 주간 전세 시세(B1, base_month 8자리) 최근 행 → (price_avg 만원, YYYYMMDD).

    * 같은 평형 후보가 **정확히 하나**일 때만 — 둘 이상이면 어느 쪽에 시세가 있든 None(검사관 A-6: 시세 있는 쪽을
      고르면 다른 타입 매물에 그 평형 값을 붙이는 셈이다).
    * 시세가 오늘(한국 날짜) 기준 JEONSE_QUOTE_MAX_AGE_DAYS 일 안의 것만(검사관 C-7) — 더 오래되면 None.
    """
    from sqlalchemy import func

    from db.models import ComplexPriceHistory

    if len(pyeong_nos) != 1:
        return None
    today = today or datetime.now(_KST).date()
    cutoff = (today - timedelta(days=JEONSE_QUOTE_MAX_AGE_DAYS)).strftime("%Y%m%d")
    row = (
        db.query(ComplexPriceHistory.price_avg, ComplexPriceHistory.base_month)
        .filter(
            ComplexPriceHistory.complex_no == complex_no,
            ComplexPriceHistory.area_no == str(pyeong_nos[0]),
            ComplexPriceHistory.trade_type == "B1",
            func.length(ComplexPriceHistory.base_month) == 8,
            ComplexPriceHistory.base_month >= cutoff,
            ComplexPriceHistory.price_avg.isnot(None),
        )
        .order_by(ComplexPriceHistory.base_month.desc())
        .first()
    )
    return (int(row[0]), str(row[1])) if row else None


def article_region_fields(db, a, c, today: date | None = None) -> dict:
    """매물 상세용 공식 기준값(세션 473) — 법정 전환율 상한·기준금리 + (월세면) 시도 전환율·이 매물 전환율.

    이 매물 전환율의 전세가격 = 같은 단지·같은 평형 네이버 주간 전세 시세 최근 값(사장님 결정 2026-10-18).
    """
    from config.legal_rates import BOK_BASE_RATE, BOK_BASE_RATE_DATE, legal_rent_conversion_cap
    from crawler.region_match import SIDO_NAME_OF_CODE
    from crawler.service_region_stats import STAT_RENT_CONVERSION
    from db.region_stats_queries import format_period, get_latest_region_stat, region_code_of_complex, sido_code

    out = {
        "legal_rent_conversion_cap": legal_rent_conversion_cap(),
        "bok_base_rate": BOK_BASE_RATE,
        "bok_base_rate_date": BOK_BASE_RATE_DATE,
        "region_rent_conversion_rate": None,
        "region_rent_conversion_period": None,
        "region_rent_conversion_name": None,
        "article_rent_conversion_rate": None,
        "article_rent_conversion_basis": None,
    }
    if a.trade_type_name != "월세":
        return out
    sido = sido_code(region_code_of_complex(c)) if c is not None else None
    hit = get_latest_region_stat(db, sido, STAT_RENT_CONVERSION)
    if hit is not None:
        out["region_rent_conversion_rate"] = round(hit[0], 1)
        out["region_rent_conversion_period"] = format_period(hit[1])
        out["region_rent_conversion_name"] = SIDO_NAME_OF_CODE.get(sido)
    jeonse = _latest_naver_jeonse(db, a.complex_no, _same_pyeong_nos(db, a), today)
    if jeonse is not None:
        rate = calc_rent_conversion_rate(a.numeric_rent_price, a.numeric_price, jeonse[0])
        if rate is not None:
            ymd = jeonse[1]
            out["article_rent_conversion_rate"] = rate
            out["article_rent_conversion_basis"] = f"네이버 시세 전세가 기준(같은 평형, {ymd[:4]}.{ymd[4:6]}.{ymd[6:]})"
    return out
