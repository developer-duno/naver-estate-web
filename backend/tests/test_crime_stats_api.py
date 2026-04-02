"""범죄통계 API 단위 테스트 — odcloud 응답 파싱 + 지역매핑 + 점수 산출"""

from unittest.mock import patch

from crawler.crime_stats_api import (
    CrimeStatsAPI,
    _parse_region_key,
    _score_to_grade,
)

# ── API 호출 테스트 ──

class TestFetchAll:
    """fetch_all API 응답 파싱 테스트"""

    def test_정상_응답_파싱(self):
        """odcloud 응답에서 data 배열 올바르게 추출"""
        mock_resp = {
            "currentCount": 2,
            "data": [
                {"범죄대분류": "폭력범죄", "범죄중분류": "상해", "서울 강남구": 100, "경기도 수원시": 200},
                {"범죄대분류": "절도범죄", "범죄중분류": "절도범죄", "서울 강남구": 50, "경기도 수원시": 80},
            ],
            "totalCount": 2,
            "page": 1,
            "perPage": 50,
        }
        with patch.object(CrimeStatsAPI, "call_api", return_value=mock_resp):
            result = CrimeStatsAPI.fetch_all()
        assert result is not None
        assert len(result) == 2

    def test_API_실패_시_None(self):
        """call_api None 반환 → None"""
        with patch.object(CrimeStatsAPI, "call_api", return_value=None):
            result = CrimeStatsAPI.fetch_all()
        assert result is None

    def test_빈_데이터(self):
        """data 배열이 비어있으면 None"""
        mock_resp = {"data": [], "totalCount": 0}
        with patch.object(CrimeStatsAPI, "call_api", return_value=mock_resp):
            result = CrimeStatsAPI.fetch_all()
        assert result is None


# ── 시군구별 집계 테스트 ──

class TestAggregateByRegion:
    """aggregate_by_region 전치·합산 테스트"""

    def test_범죄분류별_시군구_합산(self):
        """폭력+절도+기타 범죄가 시군구별로 올바르게 합산"""
        rows = [
            {"범죄대분류": "폭력범죄", "범죄중분류": "상해", "서울 강남구": 100, "경기도 수원시": 200},
            {"범죄대분류": "절도범죄", "범죄중분류": "절도범죄", "서울 강남구": 50, "경기도 수원시": 80},
            {"범죄대분류": "강력범죄", "범죄중분류": "살인기수", "서울 강남구": 3, "경기도 수원시": 5},
        ]
        result = CrimeStatsAPI.aggregate_by_region(rows)

        # 서울 강남구 → 서울특별시_강남구
        gangnam = result["서울특별시_강남구"]
        assert gangnam["total"] == 153  # 100 + 50 + 3
        assert gangnam["violent"] == 100
        assert gangnam["theft"] == 50
        assert gangnam["region"] == "서울특별시"
        assert gangnam["gu"] == "강남구"

        # 경기도 수원시 → 경기도_수원시
        suwon = result["경기도_수원시"]
        assert suwon["total"] == 285  # 200 + 80 + 5
        assert suwon["violent"] == 200
        assert suwon["theft"] == 80

    def test_외국_항목_제외(self):
        """'외국' 키로 시작하는 항목은 제외"""
        rows = [
            {"범죄대분류": "폭력범죄", "범죄중분류": "상해", "서울 강남구": 10, "외국 기타국가": 5},
        ]
        result = CrimeStatsAPI.aggregate_by_region(rows)
        assert len(result) == 1
        assert "서울특별시_강남구" in result

    def test_세종시_특수처리(self):
        """세종시는 gu 없이 처리"""
        rows = [
            {"범죄대분류": "폭력범죄", "범죄중분류": "상해", "세종시": 30},
        ]
        result = CrimeStatsAPI.aggregate_by_region(rows)
        assert "세종특별자치시" in result
        assert result["세종특별자치시"]["gu"] == ""

    def test_빈_rows(self):
        """빈 리스트 → 빈 dict"""
        result = CrimeStatsAPI.aggregate_by_region([])
        assert result == {}


# ── 점수 산출 테스트 ──

class TestComputeScores:
    """compute_scores 안전 점수 산출 테스트"""

    def test_인구_기반_범죄율_정규화(self):
        """인구 대비 범죄율 기반, 낮을수록 높은 점수"""
        stats = {
            "안전도시_A구": {"region": "안전도시", "gu": "A구", "total": 100, "violent": 10, "theft": 30},
            "위험도시_B구": {"region": "위험도시", "gu": "B구", "total": 500, "violent": 50, "theft": 100},
        }
        population_map = {
            "안전도시_A구": 500000,  # 범죄율 = 100/500000*10000 = 2.0
            "위험도시_B구": 100000,  # 범죄율 = 500/100000*10000 = 50.0
        }
        scored = CrimeStatsAPI.compute_scores(stats, population_map)

        assert scored["안전도시_A구"]["crime_score"] == 100  # 범죄율 낮음 → 100점
        assert scored["위험도시_B구"]["crime_score"] == 0    # 범죄율 높음 → 0점
        assert scored["안전도시_A구"]["crime_grade"] == "A"
        assert scored["위험도시_B구"]["crime_grade"] == "D"

    def test_인구수_없는_시군구_제외(self):
        """population_map에 없는 시군구는 점수 산출에서 제외"""
        stats = {
            "있음_A구": {"region": "있음", "gu": "A구", "total": 100, "violent": 10, "theft": 30},
            "없음_B구": {"region": "없음", "gu": "B구", "total": 200, "violent": 20, "theft": 50},
        }
        population_map = {"있음_A구": 300000}
        scored = CrimeStatsAPI.compute_scores(stats, population_map)
        assert len(scored) == 1
        assert "있음_A구" in scored

    def test_빈_통계(self):
        """통계 없으면 빈 dict"""
        assert CrimeStatsAPI.compute_scores({}, {}) == {}


# ── 지역명 파싱 테스트 ──

class TestParseRegionKey:
    """_parse_region_key 지역 약칭 → 정규명 변환 테스트"""

    def test_서울_매핑(self):
        region, gu = _parse_region_key("서울 강남구")
        assert region == "서울특별시"
        assert gu == "강남구"

    def test_경기도_매핑(self):
        region, gu = _parse_region_key("경기도 수원시")
        assert region == "경기도"
        assert gu == "수원시"

    def test_세종시_특수(self):
        region, gu = _parse_region_key("세종시")
        assert region == "세종특별자치시"
        assert gu == ""

    def test_충북_매핑(self):
        region, gu = _parse_region_key("충북 청주시")
        assert region == "충청북도"
        assert gu == "청주시"

    def test_매핑_실패(self):
        """알 수 없는 지역 → 빈 문자열"""
        region, gu = _parse_region_key("알수없는지역")
        assert region == ""
        assert gu == ""


# ── 등급 변환 테스트 ──

class TestScoreToGrade:
    """_score_to_grade 등급 경계값 테스트"""

    def test_등급_경계값(self):
        assert _score_to_grade(100) == "A"
        assert _score_to_grade(80) == "A"
        assert _score_to_grade(79) == "B"
        assert _score_to_grade(60) == "B"
        assert _score_to_grade(59) == "C"
        assert _score_to_grade(40) == "C"
        assert _score_to_grade(39) == "D"
        assert _score_to_grade(0) == "D"
