"""비로그인 응답에서 네이버 재료 칸을 걷어내는 순수 함수 (세션 481 공개 전환 PR 1).

사장님 결정(2026-10-26): 정보·자료는 비로그인에게도 공개하되 네이버 매물·호가는 로그인 뒤.
단지 상세·단지 목록·검색 응답은 캐시를 하나로 두고, 반환 직전에 비로그인이면 이 함수로 걷어낸다.
캐시 안 객체는 바꾸지 않는다(얕은 복사 뒤 제거) — 같은 캐시를 로그인 사용자도 읽기 때문.

칸별 재료 판정(세션 481 판정 표 — 메인 확인):
- article_count · trade_type_counts · filter_options = 매물 표 집계(네이버 매물)
- jeonse_rate · jeonse_rate_min · jeonse_rate_max = 분자가 네이버 전세 시세
- last_crawled_at · articles_crawled_at · detail_crawled_at = 크롤 시각
남는 칸 = 정부 실거래(nearby_median_price·recent_trades_6m·area_prices·legacy_range) · 부동산원 지역 값 · 단지 사실 정보.
단 옛 값 단지(price_basis == "legacy_mixed")의 세 값은 네이버 실거래 줄이 섞인 옛 계산이라 같이 뺀다
(LEGACY_FIELDS — 세션 481 맹점 검사관 A·K). 그때 price_basis 는 None(= 보여 줄 값 없음).
"""

from db.area_price_queries import area_price_range_source, area_price_source

NAVER_FIELDS = frozenset({
    "article_count",
    "trade_type_counts",
    "filter_options",
    "jeonse_rate",
    "jeonse_rate_min",
    "jeonse_rate_max",
    "last_crawled_at",
    "articles_crawled_at",
    "detail_crawled_at",
})

# 옛 값 단지(면적 섞인 옛 계산 — 네이버 실거래 줄이 섞였다)에서만 비로그인에게 빼는 칸
LEGACY_FIELDS = frozenset({"nearby_median_price", "recent_trades_6m", "legacy_range"})


def strip_naver_fields(payload: dict) -> dict:
    """단지 한 개 dict 에서 네이버 재료 칸을 뺀 새 dict — 원본은 그대로.

    출처 글자 두 칸이 있으면 전세가율 설명 꼬리 없는 글자로 바꾼다(전세가율을 숨기므로).
    """
    out = {k: v for k, v in payload.items() if k not in NAVER_FIELDS}
    if out.get("price_basis") == "legacy_mixed":
        out = {k: v for k, v in out.items() if k not in LEGACY_FIELDS}
        out["price_basis"] = None
    rep = out.get("rep_area_m2")
    if "area_price_source" in out:
        out["area_price_source"] = area_price_source(rep, include_jeonse=False)
    if "area_price_range_source" in out:
        out["area_price_range_source"] = area_price_range_source(rep, include_jeonse=False)
    return out


def strip_naver_list(response: dict) -> dict:
    """{"complexes": [...], ...} 목록 응답 — 각 단지에서 네이버 재료 칸을 뺀 새 응답. 원본은 그대로."""
    out = dict(response)
    out["complexes"] = [strip_naver_fields(c) for c in response.get("complexes") or []]
    return out


def for_viewer(payload: dict, user: dict | None) -> dict:
    """단지 한 개 응답 — 로그인이면 그대로, 비로그인이면 걷어낸 사본."""
    return payload if user is not None else strip_naver_fields(payload)


def list_for_viewer(response: dict, user: dict | None) -> dict:
    """목록 응답 — 로그인이면 그대로, 비로그인이면 걷어낸 사본."""
    return response if user is not None else strip_naver_list(response)
