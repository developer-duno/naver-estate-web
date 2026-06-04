"""환경 데이터 수집 오케스트레이션 테스트 — collect_crime_stats / collect_emergency_data

기존 test_env_service.py 는 유틸/API 클래스 단위(haversine, _build_population_map,
find_nearest 등)를 커버하지만, 수집 함수의 **전체 흐름**(외부 API 호출 -> 집계 ->
DB(Infra) 업데이트 -> CrawlJob 기록 -> 폴백)은 0건이었다.

분기별/월별 스케줄 잡이라 깨져도 한참 뒤에야 발견된다(과거 childcare silent failure
선례). 이 테스트는 외부 API 만 모킹하고 DB 업데이트·폴백 경로를 가드해 "조용히 데이터가
안 채워지는" 사고를 차단한다.

검증 메커니즘:
- collect_* 는 인자 없이 내부에서 SessionLocal() 을 호출한다. conftest 가
  sys.modules["db.database"] 를 통째 교체하므로 테스트에서 자동으로 TestSession 을 쓴다.
- collect_* 가 만든 세션은 commit 후 close 되므로, 검증은 db fixture 로 재조회한다
  (test_env_service.py TestUpsertStationBatch 선례와 동일).
- 외부 API 정적 메서드는 원본 모듈 경로로 patch (함수 내부 lazy import 라도 적용됨).
"""

from datetime import date
from unittest.mock import patch

from db.mb_models import Apartment, Infra, MBRegion
from db.models import CrawlJob

# ── 픽스처 헬퍼 (하드코딩 대신 팩토리) ──


def _add_apartment(db, apt_id: str, region: str, gu: str | None = None,
                   lat: float | None = None, lng: float | None = None):
    """테스트용 아파트 단지 + 빈 Infra 행 생성 (collect 가 db.get(Infra) 로 채움)"""
    db.add(Apartment(id=apt_id, name=f"단지{apt_id}", region=region, gu=gu,
                     latitude=lat, longitude=lng))
    db.add(Infra(apartment_id=apt_id))
    db.commit()


def _add_region(db, region: str, gu: str | None, population: int):
    """테스트용 인구 데이터 (regions 테이블)"""
    db.add(MBRegion(region=region, gu=gu, population=population, recorded_at=date(2026, 1, 1)))
    db.commit()


# ── collect_crime_stats ──


class TestCollectCrimeStats:
    """범죄통계 수집 전체 흐름 — API -> 집계 -> 안전점수 -> Infra 업데이트 / CSV 폴백"""

    def test_정상_수집_infra_업데이트(self, db):
        """API 3종 성공 시 Infra.crime_score/grade 채워지고 CrawlJob completed"""
        _add_apartment(db, "APT1", "서울특별시", "강남구")
        _add_region(db, "서울특별시", "강남구", 550000)

        with patch("crawler.crime_stats_api.CrimeStatsAPI.fetch_all",
                   return_value=[{"dummy": "row"}]), \
             patch("crawler.crime_stats_api.CrimeStatsAPI.aggregate_by_region",
                   return_value={"서울특별시_강남구": {"total": 100}}), \
             patch("crawler.crime_stats_api.CrimeStatsAPI.compute_scores",
                   return_value={"서울특별시_강남구": {"crime_score": 85, "crime_grade": "A"}}):
            from crawler.env_crime import collect_crime_stats
            collect_crime_stats()

        infra = db.get(Infra, "APT1")
        assert infra.crime_score == 85
        assert infra.crime_grade == "A"
        assert infra.crime_updated_at is not None

        job = db.query(CrawlJob).filter_by(job_type="crime_stats").one()
        assert job.status == "completed"
        assert job.processed_items == 1

    def test_API_실패_CSV_폴백_호출(self, db):
        """fetch_all -> None 이면 load_crime_stats(CSV 폴백)로 위임"""
        _add_apartment(db, "APT1", "서울특별시", "강남구")

        with patch("crawler.crime_stats_api.CrimeStatsAPI.fetch_all", return_value=None), \
             patch("crawler.env_crime.load_crime_stats") as mock_csv:
            from crawler.env_crime import collect_crime_stats
            collect_crime_stats()

        mock_csv.assert_called_once()

    def test_집계_실패_CSV_폴백_호출(self, db):
        """aggregate_by_region -> {} 이면 CSV 폴백으로 위임"""
        _add_apartment(db, "APT1", "서울특별시", "강남구")

        with patch("crawler.crime_stats_api.CrimeStatsAPI.fetch_all",
                   return_value=[{"dummy": "row"}]), \
             patch("crawler.crime_stats_api.CrimeStatsAPI.aggregate_by_region",
                   return_value={}), \
             patch("crawler.env_crime.load_crime_stats") as mock_csv:
            from crawler.env_crime import collect_crime_stats
            collect_crime_stats()

        mock_csv.assert_called_once()

    def test_인구_누락_지역_중앙값_폴백(self, db):
        """점수 조회 안 되는 지역도 _compute_median_score 결과로 채워진다 (is_fallback 경로)"""
        # 점수에 없는 지역(강원)의 단지 — 정확 매칭 실패 -> 중앙값 폴백
        _add_apartment(db, "APT_FALLBACK", "강원특별자치도", "정선군")
        _add_region(db, "서울특별시", "강남구", 550000)

        scored = {
            "서울특별시_강남구": {"crime_score": 90, "crime_grade": "A"},
            "부산광역시_해운대구": {"crime_score": 50, "crime_grade": "C"},
            "대구광역시_중구": {"crime_score": 30, "crime_grade": "D"},
        }
        with patch("crawler.crime_stats_api.CrimeStatsAPI.fetch_all",
                   return_value=[{"dummy": "row"}]), \
             patch("crawler.crime_stats_api.CrimeStatsAPI.aggregate_by_region",
                   return_value={"서울특별시_강남구": {"total": 100}}), \
             patch("crawler.crime_stats_api.CrimeStatsAPI.compute_scores",
                   return_value=scored):
            from crawler.env_crime import collect_crime_stats
            collect_crime_stats()

        # 강원 정선군은 scored 에 없지만 중앙값(50)으로 채워져야 한다
        infra = db.get(Infra, "APT_FALLBACK")
        assert infra.crime_score == 50
        assert infra.crime_grade == "C"


# ── collect_emergency_data ──


class TestCollectEmergencyData:
    """응급의료 수집 전체 흐름 — 목록 1회 조회 -> 단지별 근접 매칭 -> Infra 업데이트"""

    def test_정상_수집_infra_업데이트(self, db):
        """목록+근접매칭 성공 시 Infra.emergency_* 채워지고 CrawlJob completed"""
        _add_apartment(db, "APT1", "서울특별시", "강남구", lat=37.5, lng=127.0)

        facilities = [{"name": "A병원", "lat": 37.5, "lng": 127.0, "beds": 10,
                       "level": "권역응급의료센터", "addr": "서울"}]
        nearest = {"count": 1, "nearest_dist": 50.5, "nearest_beds": 10,
                   "nearest_level": "권역응급의료센터"}
        with patch("crawler.emergency_api.EmergencyAPI.get_emergency_list",
                   return_value=facilities), \
             patch("crawler.emergency_api.EmergencyAPI.find_nearest",
                   return_value=nearest):
            from crawler.env_emergency import collect_emergency_data
            collect_emergency_data()

        infra = db.get(Infra, "APT1")
        assert infra.emergency_hospital == 1
        assert infra.emergency_hospital_dist == 50.5
        assert infra.emergency_beds == 10
        assert infra.emergency_level == "권역응급의료센터"

        job = db.query(CrawlJob).filter_by(job_type="emergency").one()
        assert job.status == "completed"
        assert job.processed_items == 1

    def test_목록_조회_실패_무업데이트(self, db):
        """get_emergency_list -> [] 이면 CrawlJob completed(0,0), Infra 안 건드림"""
        _add_apartment(db, "APT1", "서울특별시", "강남구", lat=37.5, lng=127.0)

        with patch("crawler.emergency_api.EmergencyAPI.get_emergency_list",
                   return_value=[]):
            from crawler.env_emergency import collect_emergency_data
            collect_emergency_data()

        infra = db.get(Infra, "APT1")
        assert infra.emergency_hospital is None  # 안 건드림

        job = db.query(CrawlJob).filter_by(job_type="emergency").one()
        assert job.status == "completed"
        assert job.processed_items == 0

    def test_단지별_오류_격리_배치_생존(self, db):
        """find_nearest 가 1단지 성공·1단지 raise -> 성공 1·실패 1 격리, 배치 안 죽음"""
        _add_apartment(db, "APT_OK", "서울특별시", "강남구", lat=37.5, lng=127.0)
        _add_apartment(db, "APT_ERR", "부산광역시", "해운대구", lat=35.1, lng=129.0)

        facilities = [{"name": "A병원", "lat": 37.5, "lng": 127.0, "beds": 10,
                       "level": "권역응급의료센터", "addr": "서울"}]
        ok = {"count": 1, "nearest_dist": 10.0, "nearest_beds": 10, "nearest_level": "x"}
        with patch("crawler.emergency_api.EmergencyAPI.get_emergency_list",
                   return_value=facilities), \
             patch("crawler.emergency_api.EmergencyAPI.find_nearest",
                   side_effect=[ok, RuntimeError("API 오류")]):
            from crawler.env_emergency import collect_emergency_data
            collect_emergency_data()

        # 한 단지 오류가 배치 전체를 죽이지 않고, CrawlJob 은 completed
        job = db.query(CrawlJob).filter_by(job_type="emergency").one()
        assert job.status == "completed"
        # 성공 1 + 실패 1 = total 2, processed 1
        assert job.processed_items == 1
        assert job.total_items == 2
