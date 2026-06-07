"""환경 데이터 수집 오케스트레이션 테스트 — crime / emergency / childcare / air_quality

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

    def test_점수산출_실패_job_failed_폴백호출(self, db):
        """compute_scores -> [] (점수산출 실패) 면 job=failed (monitor 알림) + CSV 폴백 호출.

        job 이 이미 running 으로 생성된 뒤(API 응답은 받음) 점수산출만 실패한 경우.
        '완료(0,0)' 위장 대신 failed 로 알려야 monitor 가 알림 (세션 280). CSV 폴백은
        그대로 호출되어 데이터는 Infra 에 반영(여기선 mock 으로 호출만 검증).
        """
        _add_apartment(db, "APT1", "서울특별시", "강남구")

        with patch("crawler.crime_stats_api.CrimeStatsAPI.fetch_all",
                   return_value=[{"dummy": "row"}]), \
             patch("crawler.crime_stats_api.CrimeStatsAPI.aggregate_by_region",
                   return_value={"서울특별시_강남구": {"total": 100}}), \
             patch("crawler.crime_stats_api.CrimeStatsAPI.compute_scores",
                   return_value={}), \
             patch("crawler.env_crime.load_crime_stats") as mock_csv:
            from crawler.env_crime import collect_crime_stats
            collect_crime_stats()

        # 점수산출 실패는 '완료'가 아니라 'failed' (monitor 알림 전제)
        job = db.query(CrawlJob).filter_by(job_type="crime_stats").one()
        assert job.status == "failed"
        assert "점수 산출 실패" in job.error_message
        # CSV 폴백은 여전히 호출 (데이터 메꿈은 폴백 책임)
        mock_csv.assert_called_once()

    def test_Infra_없으면_skip_자동생성_안함(self, db):
        """Infra 행 부재 단지는 skip (childcare 와 달리 자동생성 안 함).

        세션 282: db.get(Infra) -> infra_map.get(apt_id) prefetch 전환 후에도
        '없으면 skip' 동작이 유지되는지 가드 (prefetch 정합 회귀 가드).
        """
        # Apartment 만 추가, Infra 행 없음
        db.add(Apartment(id="APT_NOINFRA", name="단지", region="서울특별시", gu="강남구"))
        db.commit()
        _add_region(db, "서울특별시", "강남구", 550000)

        with patch("crawler.crime_stats_api.CrimeStatsAPI.fetch_all",
                   return_value=[{"dummy": "row"}]), \
             patch("crawler.crime_stats_api.CrimeStatsAPI.aggregate_by_region",
                   return_value={"서울특별시_강남구": {"total": 100}}), \
             patch("crawler.crime_stats_api.CrimeStatsAPI.compute_scores",
                   return_value={"서울특별시_강남구": {"crime_score": 85, "crime_grade": "A"}}):
            from crawler.env_crime import collect_crime_stats
            collect_crime_stats()

        # Infra 행은 여전히 없어야 한다 (자동생성 안 함)
        assert db.get(Infra, "APT_NOINFRA") is None
        # 전 단지 skip -> collected 0 -> silent failure 가드가 failed 처리
        job = db.query(CrawlJob).filter_by(job_type="crime_stats").one()
        assert job.status == "failed"


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

    def test_목록_조회_실패_failed_알림(self, db):
        """get_emergency_list -> [] 이면 CrawlJob failed (monitor 알림), Infra 안 건드림.

        전국 목록이 비면 단지 매칭 자체가 불가 = 명백한 장애. '완료(0,0)' 위장 금지
        (세션 280 — childcare silent 가드 패턴을 emergency 에 전파).
        """
        _add_apartment(db, "APT1", "서울특별시", "강남구", lat=37.5, lng=127.0)

        with patch("crawler.emergency_api.EmergencyAPI.get_emergency_list",
                   return_value=[]):
            from crawler.env_emergency import collect_emergency_data
            collect_emergency_data()

        infra = db.get(Infra, "APT1")
        assert infra.emergency_hospital is None  # 안 건드림

        job = db.query(CrawlJob).filter_by(job_type="emergency").one()
        assert job.status == "failed"
        assert "목록 조회 실패" in job.error_message

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

    def test_Infra_없으면_skip_자동생성_안함(self, db):
        """Infra 행 부재 단지는 skip (childcare 와 달리 자동생성 안 함).

        세션 282: db.get(Infra) -> infra_map.get(apt_id) prefetch 전환 후에도
        '없으면 skip' 동작이 유지되는지 가드 (prefetch 정합 회귀 가드).
        """
        # Apartment 만 추가, Infra 행은 생성하지 않음 (_add_apartment 안 씀)
        db.add(Apartment(id="APT_NOINFRA", name="단지", region="서울특별시",
                         gu="강남구", latitude=37.5, longitude=127.0))
        db.commit()

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

        # Infra 행은 여전히 없어야 한다 (자동생성 안 함)
        assert db.get(Infra, "APT_NOINFRA") is None
        # 전 단지 skip -> collected 0 -> silent failure 가드가 failed 처리
        job = db.query(CrawlJob).filter_by(job_type="emergency").one()
        assert job.status == "failed"


# ── collect_childcare_data ──


class TestCollectChildcareData:
    """어린이집 수집 전체 흐름 — 시군구 코드 해석 -> 030 1회 -> 반경 매칭 -> Infra 업데이트.

    과거 4개월 silent failure(stcode 빈 문자열 ERROR-100) 선례가 있어, "조용히 매칭
    0건"을 잡는 가드(collected_with_matches == 0 and gu_cache > 0)를 핵심으로 검증한다.
    """

    def test_정상_수집_infra_업데이트(self, db):
        """030 성공 + 반경 매칭 >0 시 Infra.childcare_* 채워지고 CrawlJob completed"""
        _add_apartment(db, "APT1", "서울특별시", "강남구", lat=37.5, lng=127.0)

        facilities = [{"name": "행복어린이집", "lat": 37.5, "lng": 127.0}]
        nearest = {"count": 2, "nearest_dist": 120.0, "nearest_name": "행복어린이집",
                   "nearest_capacity": 50, "nearest_type": "국공립",
                   "nearest_teachers": 8}
        with patch("crawler.env_childcare._is_skip_day", return_value=False), \
             patch("crawler.childcare_api.resolve_sigungu_code", return_value="11680"), \
             patch("crawler.childcare_api.ChildcareAPI.get_childcare_list",
                   return_value=facilities), \
             patch("crawler.childcare_api.ChildcareAPI.find_nearest",
                   return_value=nearest):
            from crawler.env_childcare import collect_childcare_data
            collect_childcare_data()

        infra = db.get(Infra, "APT1")
        assert infra.childcare_count == 2
        assert infra.childcare_nearest_dist == 120.0
        assert infra.childcare_nearest_name == "행복어린이집"
        assert infra.childcare_nearest_capacity == 50

        job = db.query(CrawlJob).filter_by(job_type="childcare").one()
        assert job.status == "completed"
        assert job.processed_items == 1

    def test_매칭_0건_silent_failure_감지(self, db):
        """030 응답은 받았으나 반경 내 매칭이 전무하면 CrawlJob failed 로 알린다"""
        _add_apartment(db, "APT1", "서울특별시", "강남구", lat=37.5, lng=127.0)

        # 030 은 빈 리스트(시군구 0건) -> find_nearest count=0
        empty_nearest = {"count": 0, "nearest_dist": None, "nearest_name": "",
                         "nearest_capacity": 0, "nearest_type": "",
                         "nearest_teachers": 0}
        with patch("crawler.env_childcare._is_skip_day", return_value=False), \
             patch("crawler.childcare_api.resolve_sigungu_code", return_value="11680"), \
             patch("crawler.childcare_api.ChildcareAPI.get_childcare_list",
                   return_value=[]), \
             patch("crawler.childcare_api.ChildcareAPI.find_nearest",
                   return_value=empty_nearest):
            from crawler.env_childcare import collect_childcare_data
            collect_childcare_data()

        # silent failure 가드: with_matches==0 and gu_cache>0 -> failed
        job = db.query(CrawlJob).filter_by(job_type="childcare").one()
        assert job.status == "failed"
        assert "매칭 0건" in job.error_message

    def test_시군구_코드_매핑_없으면_실패_카운트(self, db):
        """resolve_sigungu_code -> None 이면 그 단지는 failed, API 호출 안 함"""
        _add_apartment(db, "APT1", "서울특별시", "강남구", lat=37.5, lng=127.0)

        with patch("crawler.env_childcare._is_skip_day", return_value=False), \
             patch("crawler.childcare_api.resolve_sigungu_code", return_value=None), \
             patch("crawler.childcare_api.ChildcareAPI.get_childcare_list") as mock_list:
            from crawler.env_childcare import collect_childcare_data
            collect_childcare_data()

        # 코드 매핑 실패 -> get_childcare_list 호출 0 (gu_cache 비어 있음)
        mock_list.assert_not_called()
        infra = db.get(Infra, "APT1")
        assert infra.childcare_count is None  # 안 건드림

    def test_skip_day_면_cancelled(self, db):
        """매월 10일 토요일이면 쿼터 보호로 cancelled, API 호출 0"""
        _add_apartment(db, "APT1", "서울특별시", "강남구", lat=37.5, lng=127.0)

        with patch("crawler.env_childcare._is_skip_day", return_value=True), \
             patch("crawler.childcare_api.ChildcareAPI.get_childcare_list") as mock_list:
            from crawler.env_childcare import collect_childcare_data
            collect_childcare_data()

        mock_list.assert_not_called()
        job = db.query(CrawlJob).filter_by(job_type="childcare").one()
        assert job.status == "cancelled"

    def test_CPMS_치명적_에러_배치_중단(self, db):
        """get_childcare_list 가 ChildcareAPIError(쿼터/인증) -> 배치 중단 + CrawlJob failed.

        이 파일 재작성의 핵심 안전장치(치명적 에러는 silent 폴백 없이 즉시 알림). 안쪽 raise +
        per-apt raise + 바깥 except _fail_job 사슬을 한 번에 가드한다.
        """
        from crawler.childcare_api import ChildcareAPIError
        _add_apartment(db, "APT1", "서울특별시", "강남구", lat=37.5, lng=127.0)

        with patch("crawler.env_childcare._is_skip_day", return_value=False), \
             patch("crawler.childcare_api.resolve_sigungu_code", return_value="11680"), \
             patch("crawler.childcare_api.ChildcareAPI.get_childcare_list",
                   side_effect=ChildcareAPIError("CPMS 일일 쿼터 초과")):
            from crawler.env_childcare import collect_childcare_data
            collect_childcare_data()

        # 치명적 에러는 CSV 폴백 없이 job failed 로 알린다
        job = db.query(CrawlJob).filter_by(job_type="childcare").one()
        assert job.status == "failed"
        assert "CPMS 치명적 에러" in job.error_message

    def test_Infra_행_없으면_자동_생성(self, db):
        """mibunyang 미수집 단지(Infra 행 부재) → collect 가 Infra 신규 생성 후 childcare_* 채움"""
        # _add_apartment 와 달리 Infra 행을 만들지 않음 (자동 생성 경로 트리거)
        db.add(Apartment(id="APT_NEW", name="신규단지", region="서울특별시", gu="강남구",
                         latitude=37.5, longitude=127.0))
        db.commit()

        nearest = {"count": 1, "nearest_dist": 80.0, "nearest_name": "새싹어린이집",
                   "nearest_capacity": 30, "nearest_type": "민간",
                   "nearest_teachers": 5}
        with patch("crawler.env_childcare._is_skip_day", return_value=False), \
             patch("crawler.childcare_api.resolve_sigungu_code", return_value="11680"), \
             patch("crawler.childcare_api.ChildcareAPI.get_childcare_list",
                   return_value=[{"name": "새싹어린이집"}]), \
             patch("crawler.childcare_api.ChildcareAPI.find_nearest",
                   return_value=nearest):
            from crawler.env_childcare import collect_childcare_data
            collect_childcare_data()

        # Infra 행이 없던 단지에 새로 INSERT 되어 값이 채워져야 한다
        infra = db.get(Infra, "APT_NEW")
        assert infra is not None
        assert infra.childcare_count == 1
        assert infra.childcare_nearest_name == "새싹어린이집"


# ── collect_air_quality ──


class TestCollectAirQuality:
    """대기질 수집 전체 흐름 — 근접 측정소 -> 실시간 측정값 -> Infra 업데이트"""

    def test_정상_수집_infra_업데이트(self, db):
        """측정소+실시간 성공 시 Infra.air_* 채워지고 CrawlJob completed"""
        _add_apartment(db, "APT1", "서울특별시", "강남구", lat=37.5, lng=127.0)

        station = {"station_name": "강남구", "addr": "서울 강남구", "tm": 1.2}
        air = {"pm10": 30.0, "pm25": 15.0, "o3": 0.03, "grade": "좋음"}
        with patch("crawler.env_air._is_skip_day", return_value=False), \
             patch("crawler.air_quality_api.AirQualityAPI.get_nearby_station",
                   return_value=station), \
             patch("crawler.air_quality_api.AirQualityAPI.get_realtime_air",
                   return_value=air):
            from crawler.env_air import collect_air_quality
            collect_air_quality()

        infra = db.get(Infra, "APT1")
        assert infra.air_station_name == "강남구"
        assert infra.air_pm10 == 30.0
        assert infra.air_pm25 == 15.0
        assert infra.air_grade == "좋음"

        job = db.query(CrawlJob).filter_by(job_type="air_quality").one()
        assert job.status == "completed"
        assert job.processed_items == 1

    def test_측정소_없으면_실패_카운트(self, db):
        """get_nearby_station -> None 이면 그 단지 failed, Infra 안 건드림"""
        _add_apartment(db, "APT1", "서울특별시", "강남구", lat=37.5, lng=127.0)

        with patch("crawler.env_air._is_skip_day", return_value=False), \
             patch("crawler.air_quality_api.AirQualityAPI.get_nearby_station",
                   return_value=None):
            from crawler.env_air import collect_air_quality
            collect_air_quality()

        infra = db.get(Infra, "APT1")
        assert infra.air_station_name is None  # 안 건드림

        job = db.query(CrawlJob).filter_by(job_type="air_quality").one()
        assert job.status == "failed"
        assert "전부 측정소 매칭 실패" in job.error_message

    def test_단지별_오류_격리_배치_생존(self, db):
        """get_nearby_station 1단지 성공·1단지 raise -> 격리, 배치 안 죽음"""
        _add_apartment(db, "APT_OK", "서울특별시", "강남구", lat=37.5, lng=127.0)
        _add_apartment(db, "APT_ERR", "부산광역시", "해운대구", lat=35.1, lng=129.0)

        station = {"station_name": "강남구", "addr": "서울", "tm": 1.0}
        air = {"pm10": 30.0, "pm25": 15.0, "o3": 0.03, "grade": "좋음"}
        with patch("crawler.env_air._is_skip_day", return_value=False), \
             patch("crawler.air_quality_api.AirQualityAPI.get_nearby_station",
                   side_effect=[station, RuntimeError("API 오류")]), \
             patch("crawler.air_quality_api.AirQualityAPI.get_realtime_air",
                   return_value=air):
            from crawler.env_air import collect_air_quality
            collect_air_quality()

        # 한 단지 오류가 배치 전체를 죽이지 않고, CrawlJob 은 completed
        job = db.query(CrawlJob).filter_by(job_type="air_quality").one()
        assert job.status == "completed"
        # 성공 1 + 실패 1 = total 2, processed 1
        assert job.processed_items == 1
        assert job.total_items == 2

    def test_skip_day_면_cancelled(self, db):
        """매월 10일 토요일이면 쿼터 보호로 cancelled, API 호출 0"""
        _add_apartment(db, "APT1", "서울특별시", "강남구", lat=37.5, lng=127.0)

        with patch("crawler.env_air._is_skip_day", return_value=True), \
             patch("crawler.air_quality_api.AirQualityAPI.get_nearby_station") as mock_station:
            from crawler.env_air import collect_air_quality
            collect_air_quality()

        mock_station.assert_not_called()
        job = db.query(CrawlJob).filter_by(job_type="air_quality").one()
        assert job.status == "cancelled"

    def test_전역_장애_job_failed(self, db):
        """배치 전역(per-단지 try 밖) 장애 시 _fail_job 으로 CrawlJob failed 기록.

        monitor 가 failed 잡을 텔레그램으로 알리므로 failed 기록이 운영 알림의 전제다.
        _complete_job(per-apt 루프 밖) 에서 raise → 바깥 except 진입을 검증.
        """
        _add_apartment(db, "APT1", "서울특별시", "강남구", lat=37.5, lng=127.0)

        station = {"station_name": "강남구", "addr": "서울", "tm": 1.0}
        air = {"pm10": 30.0, "pm25": 15.0, "o3": 0.03, "grade": "좋음"}
        with patch("crawler.env_air._is_skip_day", return_value=False), \
             patch("crawler.air_quality_api.AirQualityAPI.get_nearby_station",
                   return_value=station), \
             patch("crawler.air_quality_api.AirQualityAPI.get_realtime_air",
                   return_value=air), \
             patch("crawler.env_air._complete_job",
                   side_effect=RuntimeError("DB 커밋 실패")):
            from crawler.env_air import collect_air_quality
            collect_air_quality()

        job = db.query(CrawlJob).filter_by(job_type="air_quality").one()
        assert job.status == "failed"
        assert "DB 커밋 실패" in job.error_message

    def test_실시간값_없으면_측정소만_갱신(self, db):
        """측정소는 찾았으나 실시간값 None → air_station_name 만 채우고 측정값은 NULL 유지.

        현재 의도(측정소 갱신 + completed 카운트)를 고정. 측정값 5필드는 stale/NULL 잔존.
        """
        _add_apartment(db, "APT1", "서울특별시", "강남구", lat=37.5, lng=127.0)

        station = {"station_name": "강남구", "addr": "서울", "tm": 1.0}
        with patch("crawler.env_air._is_skip_day", return_value=False), \
             patch("crawler.air_quality_api.AirQualityAPI.get_nearby_station",
                   return_value=station), \
             patch("crawler.air_quality_api.AirQualityAPI.get_realtime_air",
                   return_value=None):
            from crawler.env_air import collect_air_quality
            collect_air_quality()

        infra = db.get(Infra, "APT1")
        assert infra.air_station_name == "강남구"  # 측정소는 갱신
        assert infra.air_pm10 is None  # 실시간 측정값은 NULL 유지
        job = db.query(CrawlJob).filter_by(job_type="air_quality").one()
        assert job.status == "completed"
        assert job.processed_items == 1

    def test_실시간값_dict이나_전부_None_갱신보류(self, db):
        """air dict 는 받았으나 pm10/pm25/o3 가 전부 None('-') → 측정소만 갱신, updated_at 보류.

        get_realtime_air 는 항상 dict 를 반환하지만 측정값이 전부 None 일 수 있다.
        그때 air_updated_at 을 찍으면 신선도 green 인데 화면값 빈값(stale 오표시). 측정값이
        하나도 없으면 updated_at 갱신을 보류해야 신선도가 정직하다 (세션 280).
        """
        _add_apartment(db, "APT1", "서울특별시", "강남구", lat=37.5, lng=127.0)

        station = {"station_name": "강남구", "addr": "서울", "tm": 1.0}
        # dict 이지만 측정값 전부 None — 에어코리아가 '-' 반환한 경우
        air_all_none = {"pm10": None, "pm25": None, "o3": None, "grade": ""}
        with patch("crawler.env_air._is_skip_day", return_value=False), \
             patch("crawler.air_quality_api.AirQualityAPI.get_nearby_station",
                   return_value=station), \
             patch("crawler.air_quality_api.AirQualityAPI.get_realtime_air",
                   return_value=air_all_none):
            from crawler.env_air import collect_air_quality
            collect_air_quality()

        infra = db.get(Infra, "APT1")
        assert infra.air_station_name == "강남구"  # 측정소는 갱신
        assert infra.air_pm10 is None  # 측정값 없음
        assert infra.air_updated_at is None  # 갱신 보류 (신선도 green 오표시 차단)
        job = db.query(CrawlJob).filter_by(job_type="air_quality").one()
        assert job.status == "completed"
        assert job.processed_items == 1

    def test_Infra_없으면_skip_자동생성_안함(self, db):
        """Infra 행 부재 단지는 failed 카운트 (자동생성 안 함).

        세션 282: db.get(Infra) -> infra_map.get(apt_id) prefetch 전환 후에도
        '없으면 skip' 동작이 유지되는지 가드 (prefetch 정합 회귀 가드).
        """
        db.add(Apartment(id="APT_NOINFRA", name="단지", region="서울특별시",
                         gu="강남구", latitude=37.5, longitude=127.0))
        db.commit()

        station = {"station_name": "강남구", "addr": "서울", "tm": 1.0}
        air = {"pm10": 30.0, "pm25": 15.0, "o3": 0.03, "grade": "좋음"}
        with patch("crawler.env_air._is_skip_day", return_value=False), \
             patch("crawler.air_quality_api.AirQualityAPI.get_nearby_station",
                   return_value=station), \
             patch("crawler.air_quality_api.AirQualityAPI.get_realtime_air",
                   return_value=air):
            from crawler.env_air import collect_air_quality
            collect_air_quality()

        # Infra 행은 여전히 없어야 한다 (자동생성 안 함)
        assert db.get(Infra, "APT_NOINFRA") is None
        # 전 단지 skip -> collected 0 -> silent failure 가드가 failed 처리
        job = db.query(CrawlJob).filter_by(job_type="air_quality").one()
        assert job.status == "failed"
