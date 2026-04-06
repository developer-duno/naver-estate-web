"""범죄통계 인구수 맵 빌더 — DB region/gu를 다양한 키 형식으로 변환"""

import logging

logger = logging.getLogger(__name__)


def _build_population_map(pop_rows) -> dict[str, int]:
    """DB region/gu → 다양한 키 형식의 인구수 맵 생성

    범죄통계 API 키(서울특별시_강남구)와 DB 키(경기_수원시) 양쪽 모두 매칭되도록
    여러 형식의 키를 동시에 등록한다.
    """
    from crawler.crime_stats_api import _REGION_ALIAS

    # DB 축약명 → 정식명 (API _REGION_ALIAS와 별도: DB는 "경기", API는 "경기도")
    _DB_ALIAS: dict[str, str] = {
        **_REGION_ALIAS,
        "서울": "서울특별시",
        "부산": "부산광역시",
        "대구": "대구광역시",
        "인천": "인천광역시",
        "광주": "광주광역시",
        "대전": "대전광역시",
        "울산": "울산광역시",
        "세종": "세종특별자치시",
        "경기": "경기도",
        "강원": "강원특별자치도",
        "충북": "충청북도",
        "충남": "충청남도",
        "전북": "전북특별자치도",
        "전남": "전라남도",
        "경북": "경상북도",
        "경남": "경상남도",
        "제주": "제주특별자치도",
    }

    pop_map: dict[str, int] = {}
    _GU_SUFFIXES = ("구", "시", "군")

    for r, g, pop in pop_rows:
        # 원본 키: DB 그대로
        exact = f"{r}_{g}" if g else r
        pop_map[exact] = pop

        # 정식 명칭 키: 서울→서울특별시, 경기→경기도
        long_r = _DB_ALIAS.get(r, r)
        if long_r != r:
            long_key = f"{long_r}_{g}" if g else long_r
            pop_map[long_key] = pop

        # gu에 접미사(구/시/군) 추가한 변형 키
        if g and not any(g.endswith(s) for s in _GU_SUFFIXES):
            for suffix in _GU_SUFFIXES:
                pop_map[f"{r}_{g}{suffix}"] = pop
                if long_r != r:
                    pop_map[f"{long_r}_{g}{suffix}"] = pop

        # region-only 키 (세종 등 단일 시도 매칭용, 첫 번째 값 우선)
        pop_map.setdefault(r, pop)
        if long_r != r:
            pop_map.setdefault(long_r, pop)

    return pop_map
