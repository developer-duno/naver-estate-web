"""시세 통계 집계 — 면적 버킷, 층수 티어, 중앙값 계산

crawl.mjs의 groupByArea / groupByFloor 포팅.
"""

from dataclasses import dataclass

AREA_BUCKET_SIZE = 5  # 5m² 단위 버킷
FLOOR_TIERS = {"low": 5, "mid": 15}  # 저층 1-5, 중층 6-15, 고층 16+


@dataclass
class PriceStat:
    label: str
    min_price: int
    avg_price: int
    max_price: int
    median_price: int
    count: int


def group_by_area(articles: list[dict]) -> list[PriceStat]:
    """매물을 면적 버킷(5m² 단위)별로 그룹핑하여 가격 통계 반환.

    articles: [{exclusive_area: float, price: int}, ...]
    """
    groups: dict[int, list[int]] = {}
    for a in articles:
        area = a.get("exclusive_area") or a.get("area2_m2")
        price = a.get("price") or a.get("numeric_price")
        if area is None or not price or price <= 0:
            continue
        bucket = round(area / AREA_BUCKET_SIZE) * AREA_BUCKET_SIZE
        groups.setdefault(bucket, []).append(price)

    result = []
    for bucket_area in sorted(groups):
        prices = sorted(groups[bucket_area])
        clean = _remove_outliers(prices)
        result.append(PriceStat(
            label=f"{bucket_area}m²",
            min_price=clean[0],
            avg_price=round(sum(clean) / len(clean)),
            max_price=clean[-1],
            median_price=_median(prices),
            count=len(prices),
        ))
    return result


def group_by_floor(articles: list[dict]) -> list[PriceStat]:
    """매물을 층수 티어(저/중/고)별로 그룹핑하여 가격 통계 반환.

    articles: [{floor_info: str, price: int}, ...]
    """
    low = FLOOR_TIERS["low"]
    mid = FLOOR_TIERS["mid"]
    labels = [f"저층(1-{low})", f"중층({low + 1}-{mid})", f"고층({mid + 1}+)"]
    groups: dict[str, list[int]] = {label: [] for label in labels}

    for a in articles:
        price = a.get("price") or a.get("numeric_price")
        if not price or price <= 0:
            continue
        floor_str = a.get("floor_info") or a.get("floor") or ""
        try:
            first = str(floor_str).split("/")[0].strip()
            _KOR = {"저": 3, "중": 8, "고": 20}
            floor = _KOR[first] if first in _KOR else int(first)
        except (ValueError, TypeError):
            continue
        if floor <= 0:
            continue

        if floor <= low:
            groups[labels[0]].append(price)
        elif floor <= mid:
            groups[labels[1]].append(price)
        else:
            groups[labels[2]].append(price)

    result = []
    for label in labels:
        prices = sorted(groups[label])
        if not prices:
            continue
        clean = _remove_outliers(prices)
        result.append(PriceStat(
            label=label,
            min_price=clean[0],
            avg_price=round(sum(clean) / len(clean)),
            max_price=clean[-1],
            median_price=_median(prices),
            count=len(prices),
        ))
    return result


def compute_median_price(prices: list[int]) -> int | None:
    """가격 리스트의 중앙값"""
    if not prices:
        return None
    return _median(sorted(prices))


def compute_jeonse_rate(
    sale_median: int | None, jeonse_median: int | None
) -> float | None:
    """전세가율 계산 (전세 중앙값 / 매매 중앙값 × 100)"""
    if not sale_median or not jeonse_median or sale_median <= 0:
        return None
    return round(jeonse_median / sale_median * 100, 1)


def _remove_outliers(sorted_prices: list[int]) -> list[int]:
    """IQR 방식으로 이상치 제거 (Q1-1.5*IQR ~ Q3+1.5*IQR 범위 밖 제거).
    4개 미만이면 그대로 반환.
    """
    n = len(sorted_prices)
    if n < 4:
        return sorted_prices
    q1 = sorted_prices[n // 4]
    q3 = sorted_prices[(n * 3) // 4]
    iqr = q3 - q1
    if iqr == 0:
        return sorted_prices
    lower = q1 - int(1.5 * iqr)
    upper = q3 + int(1.5 * iqr)
    return [p for p in sorted_prices if lower <= p <= upper] or sorted_prices


def _median(sorted_prices: list[int]) -> int:
    """정렬된 리스트의 중앙값"""
    n = len(sorted_prices)
    if n == 0:
        return 0
    mid = n // 2
    if n % 2 == 0:
        return (sorted_prices[mid - 1] + sorted_prices[mid]) // 2
    return sorted_prices[mid]
