"""backfill_price_batch CrawlJob 기록 + discover total_items 가드 (세션 288).

어드민 scheduler-status 는 CrawlJob(scheduler_job_id) 최신 행으로 last_run 을 보여준다.
- backfill_price 잡만 CrawlJob 을 안 만들어 화면에 last_run: null 영구 표시 → 기록 신설.
- discover_complexes_by_region 은 processed_items 만 설정하고 total_items 를 안 채워
  화면에 total 0 / processed 1250 으로 어긋나 보임 → 동시 설정.

검증 메커니즘은 test_env_collect.py 선례 답습 — 외부 호출만 모킹, conftest 가
sys.modules["db.database"] 교체로 SessionLocal 이 자동으로 테스트 DB 를 쓴다.
"""
from unittest.mock import patch

from db.models import Complex, CrawlJob


def _add_complex(db, no: str, households: int):
    """소급 수집 후보 단지 — total_household_count + cortar_no 필수 (선정 필터)"""
    db.add(Complex(
        complex_no=no, complex_name=f"단지{no}",
        total_household_count=households, cortar_no="1100000000",
    ))
    db.commit()


class TestBackfillPriceCrawlJob:
    """backfill_price_batch — CrawlJob running → completed/failed 기록"""

    def test_완료시_completed_와_total_processed_기록(self, db):
        _add_complex(db, "BF1", 1000)
        _add_complex(db, "BF2", 500)
        with patch("crawler.service_public.backfill_price_history"):
            from crawler.service_public import backfill_price_batch
            result = backfill_price_batch(batch_size=5, scheduler_job_id="backfill_price")

        assert result == {"success": 2, "failed": 0, "total": 2}
        job = db.query(CrawlJob).filter(CrawlJob.scheduler_job_id == "backfill_price").one()
        assert job.status == "completed"
        assert job.total_items == 2
        assert job.processed_items == 2
        assert job.completed_at is not None

    def test_개별실패는_processed_에서_제외되고_completed_유지(self, db):
        """단지 1건 소급 실패는 배치 전체 실패가 아님 — processed=성공 수만"""
        _add_complex(db, "BF1", 1000)
        _add_complex(db, "BF2", 500)
        with patch("crawler.service_public.backfill_price_history",
                   side_effect=[None, RuntimeError("api down")]):
            from crawler.service_public import backfill_price_batch
            result = backfill_price_batch(batch_size=5, scheduler_job_id="backfill_price")

        assert result == {"success": 1, "failed": 1, "total": 2}
        job = db.query(CrawlJob).filter(CrawlJob.scheduler_job_id == "backfill_price").one()
        assert job.status == "completed"
        assert job.total_items == 2
        assert job.processed_items == 1

    def test_개별실패시_rollback_호출로_세션이_복구된다(self, db):
        """개별 단지 실패 → db.rollback() 호출 (InFailedSqlTransaction 연쇄 차단)

        rollback 이 없으면 실패한 트랜잭션 상태가 세션에 남아, 그 뒤 남은 단지 처리와
        job 완료 commit 이 전부 InFailedSqlTransaction 으로 연쇄 실패한다.
        service_discover.crawl_complex_details_batch 개별 except 패턴과 동일 보장.
        """
        from unittest.mock import MagicMock

        import crawler.service_public as sp

        _add_complex(db, "BF1", 1000)

        real_session_local = sp.SessionLocal
        rollback_spy = MagicMock()

        def _spy_session_local():
            session = real_session_local()
            original_rollback = session.rollback

            def _wrapped():
                rollback_spy()
                return original_rollback()

            session.rollback = _wrapped
            return session

        with patch.object(sp, "SessionLocal", _spy_session_local), \
             patch("crawler.service_public.backfill_price_history",
                   side_effect=RuntimeError("api down")):
            result = sp.backfill_price_batch(batch_size=5, scheduler_job_id="backfill_price")

        assert result == {"success": 0, "failed": 1, "total": 1}
        assert rollback_spy.call_count >= 1, "개별 단지 실패 시 db.rollback() 이 호출되어야 함"
        # 세션이 복구되어 job 완료 commit 까지 정상 도달했는지 확인
        job = db.query(CrawlJob).filter(CrawlJob.scheduler_job_id == "backfill_price").one()
        assert job.status == "completed"
        assert job.completed_at is not None

    # 전체 예외 → failed 마킹 경로는 ast 가드(test_scheduler_job_fail_guard.py)가
    # fail_job_safely 폴백 존재를 정적 검증한다 — 깨진 세션 흉내 통합 테스트는 과잉.


class TestDiscoverRegionsTotalItems:
    """discover_complexes_by_region — total_items 와 processed_items 동시 기록"""

    def test_total_items_가_processed_와_같이_기록된다(self, db):
        fake_page = {
            "complexes": [{"complexNo": "D9", "complexName": "발견단지", "realEstateTypeCode": "APT"}],
            "isMoreData": False,
        }
        with patch("crawler.service_discover.NaverEstateAPI.search_by_keyword",
                   return_value=fake_page), \
             patch("crawler.service_discover.upsert_complex_from_search"), \
             patch("crawler.service_discover.record_call"):
            from crawler.service_discover import discover_complexes_by_region
            discover_complexes_by_region("서울특별시", "강남구", scheduler_job_id="discover_regions")

        job = db.query(CrawlJob).filter(CrawlJob.scheduler_job_id == "discover_regions").one()
        assert job.status == "completed"
        assert job.processed_items == 1
        assert job.total_items == 1
