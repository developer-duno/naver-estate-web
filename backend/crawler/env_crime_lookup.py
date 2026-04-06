"""범죄통계 점수 조회 헬퍼 — 다양한 키 형식 지원 + 다단계 폴백"""

import logging

logger = logging.getLogger(__name__)


def _build_score_lookup(scored: dict[str, dict]) -> dict[str, dict]:
    """scored 결과를 다양한 키 형식으로 조회 가능하게 확장

    scored 키(서울특별시_강남구)를 축약형(서울_강남, 서울_강남구, 경기_수원시 등)으로도
    조회할 수 있도록 역방향 매핑을 추가한다.
    """
    # 정식명 → DB 축약명 (모든 가능한 축약형)
    _LONG_TO_SHORT: dict[str, list[str]] = {
        "서울특별시": ["서울"],
        "부산광역시": ["부산"],
        "대구광역시": ["대구"],
        "인천광역시": ["인천"],
        "광주광역시": ["광주"],
        "대전광역시": ["대전"],
        "울산광역시": ["울산"],
        "세종특별자치시": ["세종", "세종시"],
        "경기도": ["경기"],
        "강원특별자치도": ["강원", "강원도"],
        "충청북도": ["충북"],
        "충청남도": ["충남"],
        "전북특별자치도": ["전북"],
        "전라남도": ["전남"],
        "경상북도": ["경북"],
        "경상남도": ["경남"],
        "제주특별자치도": ["제주"],
    }

    lookup: dict[str, dict] = dict(scored)

    for key, val in scored.items():
        # stats 키에서 region/gu 분리
        if "_" in key:
            r_part, g_part = key.split("_", 1)
        else:
            r_part, g_part = key, ""

        short_names = _LONG_TO_SHORT.get(r_part, [])

        # 축약 키 등록 (서울특별시→서울, 경기도→경기 등)
        for short_r in short_names:
            short_key = f"{short_r}_{g_part}" if g_part else short_r
            lookup.setdefault(short_key, val)

        # gu 접미사 제거 변형 (강남구→강남, 수원시→수원 등)
        if g_part:
            for suffix in ("구", "시", "군"):
                if g_part.endswith(suffix) and len(g_part) > 1:
                    stripped = g_part[:-1]
                    lookup.setdefault(f"{r_part}_{stripped}", val)
                    for short_r in short_names:
                        lookup.setdefault(f"{short_r}_{stripped}", val)

    return lookup


# 상위 시 없이 구만 저장된 경우의 매핑 (기흥구→용인시 등)
_GU_TO_PARENT_CITY: dict[str, str] = {
    # 용인시
    "기흥구": "용인시", "수지구": "용인시", "처인구": "용인시",
    # 수원시
    "장안구": "수원시", "권선구": "수원시", "팔달구": "수원시", "영통구": "수원시",
    # 성남시
    "수정구": "성남시", "중원구": "성남시", "분당구": "성남시",
    # 안양시
    "만안구": "안양시", "동안구": "안양시",
    # 안산시
    "상록구": "안산시", "단원구": "안산시",
    # 고양시
    "덕양구": "고양시", "일산동구": "고양시", "일산서구": "고양시",
    # 화성시 (동탄은 공식 구가 아니지만 데이터에 존재)
    "동탄": "화성시", "동탄구": "화성시",
    # 부천시 (구제도 폐지되었지만 데이터 잔존)
    "소사구": "부천시", "원미구": "부천시", "오정구": "부천시",
    # 천안시
    "동남구": "천안시", "서북구": "천안시",
    # 청주시
    "상당구": "청주시", "서원구": "청주시", "흥덕구": "청주시", "청원구": "청주시",
    # 전주시
    "완산구": "전주시", "덕진구": "전주시",
    # 창원시
    "의창구": "창원시", "성산구": "창원시",
    "마산합포구": "창원시", "마산회원구": "창원시", "진해구": "창원시",
    # 포항시
    "남구": "포항시", "북구": "포항시",  # region으로 구분 가능 (경북만 해당)
}


def _lookup_score(score_lookup: dict, region: str, gu: str | None) -> dict | None:
    """score_lookup에서 region/gu 조합으로 점수 조회 (다단계 폴백)

    1차: 정확한 키 (경기_수원시 영통구)
    2차: 상위 시 단위 (경기_수원시) — gu에 공백+하위 구가 있는 경우
    3차: 구→상위시 매핑 (경기_기흥구 → 경기_용인시) — gu에 상위시 없이 구만 있는 경우
    4차: 시↔군 접미사 교체 (홍천시→홍천군, 홍천군→홍천시)
    5차: region만 (세종 등 gu가 특수한 경우)
    """
    db_key = f"{region}_{gu}" if gu else region
    result = score_lookup.get(db_key)
    if result:
        return result

    if not gu:
        return None

    # 2차: "수원시 영통구" → "수원시"
    if " " in gu:
        parent_gu = gu.split(" ")[0]
        result = score_lookup.get(f"{region}_{parent_gu}")
        if result:
            return result

    # 3차: 구→상위시 매핑 (기흥구→용인시)
    parent_city = _GU_TO_PARENT_CITY.get(gu)
    if parent_city:
        result = score_lookup.get(f"{region}_{parent_city}")
        if result:
            return result

    # 4차: 시↔군 접미사 교체 (홍천시→홍천군)
    if gu.endswith("시"):
        swapped = gu[:-1] + "군"
        result = score_lookup.get(f"{region}_{swapped}")
        if result:
            return result
    elif gu.endswith("군"):
        swapped = gu[:-1] + "시"
        result = score_lookup.get(f"{region}_{swapped}")
        if result:
            return result

    # 5차: region만 (세종 등)
    result = score_lookup.get(region)
    return result


def _compute_median_score(scored: dict[str, dict]) -> dict | None:
    """scored 결과의 중앙값 점수 산출 (인구 데이터 누락 지역 폴백용)"""
    from crawler.crime_stats_api import _GRADE_THRESHOLDS

    scores = [v["crime_score"] for v in scored.values()]
    if not scores:
        return None
    scores.sort()
    median = scores[len(scores) // 2]
    grade = "D"
    for threshold, g in _GRADE_THRESHOLDS:
        if median >= threshold:
            grade = g
            break
    logger.info("[crime] 중앙값 폴백: %d점 (%s등급)", median, grade)
    return {"crime_score": median, "crime_grade": grade}
