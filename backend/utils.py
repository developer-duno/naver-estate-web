"""웹앱 공통 포맷팅 유틸리티"""


def format_parking_count(parking_count) -> str:
    """주차 포맷팅 — 100 초과 시 '단지 총 N대'"""
    if not parking_count:
        return "-"
    try:
        val = int(float(str(parking_count)))
        if val > 100:
            return f"단지 총 {val:,}대"
        return f"{val}대"
    except (ValueError, TypeError):
        return f"{parking_count}대"


def format_acquisition_tax(tax) -> str:
    """취득세 포맷팅 — 원 → 만원"""
    if not tax:
        return "-"
    try:
        val = int(float(str(tax)))
        if val >= 10000:
            man_won = val // 10000
            return f"{man_won:,}만원"
        return f"{val:,}원"
    except (ValueError, TypeError):
        return str(tax)


def format_broker_fee(fee) -> str:
    """중개보수 포맷팅 — 원 → 만원"""
    if not fee:
        return "-"
    try:
        val = int(float(str(fee)))
        if val >= 10000:
            man_won = val // 10000
            return f"{man_won:,}만원"
        return f"{val:,}원"
    except (ValueError, TypeError):
        return str(fee)


def format_date_ymd(ymd: str) -> str:
    """YYYYMMDD → YY.MM.DD (입주가능일용)"""
    if ymd and len(ymd) == 8 and ymd.isdigit():
        return f"{ymd[2:4]}.{ymd[4:6]}.{ymd[6:8]}"
    return ymd or "-"


def format_full_date_ymd(ymd: str) -> str:
    """YYYYMMDD → YYYY.MM.DD (준공일용)"""
    if ymd and len(ymd) == 8 and ymd.isdigit():
        return f"{ymd[:4]}.{ymd[4:6]}.{ymd[6:8]}"
    return ymd or "-"


# price_school_formatter.py에서 사용하는 별칭
_format_date_yyyymmdd = format_full_date_ymd
