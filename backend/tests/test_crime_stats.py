"""범죄통계 로더 단위 테스트 — CSV 파싱 + 점수 정규화 + 등급 매핑"""

from crawler.crime_stats_loader import CrimeStatsLoader, _score_to_grade


class TestLoadFromCSV:
    """CSV 파싱 테스트"""

    def test_정상_CSV_파싱(self, tmp_path):
        """표준 CSV에서 시군구별 범죄 데이터 올바르게 추출"""
        csv_content = "시도,시군구,범죄건수합계,폭력,절도,인구수\n서울특별시,강남구,5000,300,1200,550000\n서울특별시,강북구,3000,200,800,300000\n"
        csv_file = tmp_path / "test.csv"
        csv_file.write_text(csv_content, encoding="utf-8-sig")

        result = CrimeStatsLoader.load_from_csv(str(csv_file))
        assert len(result) == 2
        assert "서울특별시_강남구" in result
        gangnam = result["서울특별시_강남구"]
        assert gangnam["total"] == 5000
        assert gangnam["violent"] == 300
        assert gangnam["theft"] == 1200
        assert gangnam["population"] == 550000
        assert gangnam["crime_rate"] is not None

    def test_콤마_포함_숫자_처리(self, tmp_path):
        """숫자에 콤마가 있어도 올바르게 파싱"""
        csv_content = "시도,시군구,범죄건수합계,폭력,절도,인구수\n서울특별시,강남구,\"5,000\",\"300\",\"1,200\",\"550,000\"\n"
        csv_file = tmp_path / "test.csv"
        csv_file.write_text(csv_content, encoding="utf-8-sig")

        result = CrimeStatsLoader.load_from_csv(str(csv_file))
        assert result["서울특별시_강남구"]["total"] == 5000

    def test_빈_CSV(self, tmp_path):
        """빈 CSV → 빈 dict"""
        csv_file = tmp_path / "empty.csv"
        csv_file.write_text("시도,시군구,범죄건수합계,폭력,절도,인구수\n", encoding="utf-8-sig")

        result = CrimeStatsLoader.load_from_csv(str(csv_file))
        assert result == {}

    def test_파일_없음(self):
        """존재하지 않는 파일 → 빈 dict"""
        result = CrimeStatsLoader.load_from_csv("/nonexistent/path.csv")
        assert result == {}

    def test_시도_또는_시군구_누락_행_무시(self, tmp_path):
        """시도 또는 시군구가 빈 행은 무시"""
        csv_content = "시도,시군구,범죄건수합계,폭력,절도,인구수\n,강남구,5000,300,1200,550000\n서울특별시,,3000,200,800,300000\n서울특별시,강남구,5000,300,1200,550000\n"
        csv_file = tmp_path / "test.csv"
        csv_file.write_text(csv_content, encoding="utf-8-sig")

        result = CrimeStatsLoader.load_from_csv(str(csv_file))
        assert len(result) == 1


class TestComputeScores:
    """점수 정규화 + 등급 매핑 테스트"""

    def test_정규화_점수_범위(self):
        """범죄율 기반 점수가 0-100 범위 내"""
        stats = {
            "서울_강남": {"total": 5000, "violent": 300, "theft": 1200, "population": 550000, "crime_rate": 90.9},
            "서울_강북": {"total": 3000, "violent": 200, "theft": 800, "population": 300000, "crime_rate": 100.0},
            "경기_성남": {"total": 1000, "violent": 50, "theft": 300, "population": 500000, "crime_rate": 20.0},
        }
        scored = CrimeStatsLoader.compute_scores(stats)
        assert len(scored) == 3
        for v in scored.values():
            assert 0 <= v["crime_score"] <= 100
            assert v["crime_grade"] in ("A", "B", "C", "D")

    def test_범죄율_낮을수록_높은_점수(self):
        """범죄율이 가장 낮은 시군구가 100점에 가까움"""
        stats = {
            "안전": {"crime_rate": 10.0},
            "위험": {"crime_rate": 100.0},
        }
        scored = CrimeStatsLoader.compute_scores(stats)
        assert scored["안전"]["crime_score"] == 100
        assert scored["위험"]["crime_score"] == 0

    def test_빈_통계(self):
        """통계 없으면 빈 dict"""
        assert CrimeStatsLoader.compute_scores({}) == {}

    def test_crime_rate_없는_항목_제외(self):
        """crime_rate가 None인 항목은 점수 산출에서 제외"""
        stats = {
            "있음": {"crime_rate": 50.0},
            "없음": {"crime_rate": None},
        }
        scored = CrimeStatsLoader.compute_scores(stats)
        assert len(scored) == 1
        assert "있음" in scored


class TestGetCrimeScore:
    """시군구 조회 테스트"""

    def test_존재하는_시군구(self):
        scored = {"서울특별시_강남구": {"crime_score": 75, "crime_grade": "B"}}
        result = CrimeStatsLoader.get_crime_score("서울특별시", "강남구", scored)
        assert result is not None
        assert result["crime_score"] == 75
        assert result["crime_grade"] == "B"

    def test_없는_시군구(self):
        scored = {"서울특별시_강남구": {"crime_score": 75, "crime_grade": "B"}}
        result = CrimeStatsLoader.get_crime_score("제주특별자치도", "제주시", scored)
        assert result is None


class TestScoreToGrade:
    """등급 변환 테스트"""

    def test_등급_경계값(self):
        assert _score_to_grade(100) == "A"
        assert _score_to_grade(80) == "A"
        assert _score_to_grade(79) == "B"
        assert _score_to_grade(60) == "B"
        assert _score_to_grade(59) == "C"
        assert _score_to_grade(40) == "C"
        assert _score_to_grade(39) == "D"
        assert _score_to_grade(0) == "D"
