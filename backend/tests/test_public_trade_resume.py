"""collect_public_trade_data() 재개(resume) 로직 회귀 테스트 (세션 346, IMPROVEMENT_PLAN_2026-08 P0-0).

문제: 직전 실행(job)이 실패/취소돼도 다음 실행이 시군구 목록을 처음부터 다시 돌아
686시간(28일) 동안 처리율이 정체됐다. CheckpointManager.save()는 호출되고 있었으나
load()를 아무도 호출하지 않아 "저장만 하고 재개는 안 하는" 상태였음.

수정: job_type="public_trade_data" + status in (failed, cancelled) 인 가장 최근 job의
체크포인트를 조회해 "이미 처리한 시군구 코드 집합"을 이어받는다. 시군구 목록 자체는
DB distinct 쿼리(정렬 보장 없음)라 "몇 번째까지"가 아니라 "코드 집합"으로 저장해
목록 순서가 실행마다 달라져도 안전하게 함.

검증 메커니즘은 test_backfill_price_crawljob.py 선례 답습 — 외부 API만 모킹,
conftest 가 sys.modules["db.database"] 교체로 SessionLocal 이 자동으로 테스트 DB 를 쓴다.
"""
from datetime import date as _real_date
from unittest.mock import patch

from crawler.utils import CheckpointManager
from db.models import Complex, CrawlerCheckpoint, CrawlJob

_checkpoint = CheckpointManager(checkpoint_interval=5)


class _FakeDate(_real_date):
    """date.today()를 오버라이드하는 테스트 헬퍼 (기존 test_public_data_api.py 패턴 답습)"""

    _today = None

    @classmethod
    def today(cls):
        return cls._today


def _add_complex(db, no: str, cortar_no: str, name: str = "테스트단지"):
    db.add(Complex(complex_no=no, complex_name=name, cortar_no=cortar_no))
    db.commit()


def _run_collect(batch_size: int = 10):
    """토요일(skip 분기 회피)로 고정하고 collect_public_trade_data 실행."""
    _FakeDate._today = _real_date(2026, 3, 14)  # 토요일, 10일 아님
    with patch.dict("os.environ", {"PUBLIC_DATA_API_KEY": "test-key"}), \
         patch("datetime.date", _FakeDate):
        from crawler.service_public import collect_public_trade_data
        collect_public_trade_data(batch_size=batch_size, scheduler_job_id="collect_public_trades")


class TestPublicTradeResume:
    """이전 실행이 중단됐을 때 이미 처리한 시군구를 건너뛰고 재개하는지 검증"""

    def test_이전_failed_job의_체크포인트를_이어받아_남은_시군구만_처리(self, db):
        _add_complex(db, "C1", "1100000000")
        _add_complex(db, "C2", "2600000000")
        _add_complex(db, "C3", "4100000000")

        # 이전 실행이 시군구 1개(11000)만 끝내고 실패한 상태를 흉내
        prev_job = CrawlJob(job_type="public_trade_data", status="failed")
        db.add(prev_job)
        db.commit()
        _checkpoint.save(db, prev_job.id, {"done_codes": ["11000"], "total": 3})

        seen_sigungu: list[str] = []

        def _fake_trades(sigungu_cd, deal_ymd):
            seen_sigungu.append(sigungu_cd)
            return []  # 거래 0건 — 매칭 로직은 이 테스트 범위 밖

        with patch("crawler.public_data_api.PublicDataAPI.get_all_apt_trades", side_effect=_fake_trades):
            _run_collect()

        # 11000(이미 완료)은 다시 호출되지 않고 26000/41000만 처리됐어야 함
        assert "11000" not in seen_sigungu
        assert set(seen_sigungu) == {"26000", "41000"}

        new_job = (
            db.query(CrawlJob)
            .filter(CrawlJob.job_type == "public_trade_data", CrawlJob.status == "completed")
            .one()
        )
        assert new_job.status == "completed"
        # 완료 시 체크포인트 삭제 확인 (기존 동작 유지)
        assert db.get(CrawlerCheckpoint, new_job.id) is None

    def test_체크포인트_없으면_처음부터_전체_처리(self, db):
        """직전 job이 없거나 체크포인트가 없으면 기존 동작(처음부터 전체) 그대로"""
        _add_complex(db, "C1", "1100000000")
        _add_complex(db, "C2", "2600000000")

        seen_sigungu: list[str] = []

        def _fake_trades(sigungu_cd, deal_ymd):
            seen_sigungu.append(sigungu_cd)
            return []

        with patch("crawler.public_data_api.PublicDataAPI.get_all_apt_trades", side_effect=_fake_trades):
            _run_collect()

        assert set(seen_sigungu) == {"11000", "26000"}

    def test_이전_job이_completed면_재개대상에서_제외되고_전체처리(self, db):
        """정상 완료된 job은 재개 후보가 아님 — 체크포인트도 완료 시 삭제되므로 이중 안전"""
        _add_complex(db, "C1", "1100000000")

        completed_job = CrawlJob(job_type="public_trade_data", status="completed")
        db.add(completed_job)
        db.commit()
        # 완료된 job에 체크포인트가 남아있더라도(비정상 상황 대비) status 필터로 무시돼야 함
        _checkpoint.save(db, completed_job.id, {"done_codes": ["11000"], "total": 1})

        seen_sigungu: list[str] = []

        def _fake_trades(sigungu_cd, deal_ymd):
            seen_sigungu.append(sigungu_cd)
            return []

        with patch("crawler.public_data_api.PublicDataAPI.get_all_apt_trades", side_effect=_fake_trades):
            _run_collect()

        # completed job은 재개 대상이 아니므로 11000도 다시 처리됨
        assert "11000" in seen_sigungu

    def test_연속_2회_실패해도_1번째_진행분이_유실되지_않는다(self, db):
        """세션 346 코드리뷰 발견 버그 회귀 가드.

        1번째 job이 시군구 1개(11000) 완료 후 체크포인트 저장 → 실패.
        2번째 job은 11000을 건너뛰고 재개하지만, 자기 체크포인트를 한 번도
        저장하지 못한 채(should_save 주기 도달 전) 또 실패 — 즉 2번째 job에는
        체크포인트 row가 없다. "가장 최근 job 1건만" 보는 방식이면 3번째 실행이
        2번째(체크포인트 없음)만 보고 처음부터 재시작해 1번째의 11000 완료분을
        잃어버린다. 최근 여러 건을 순회하는 수정 후에는 1번째의 체크포인트를
        찾아 이어받아야 한다.
        """
        _add_complex(db, "C1", "1100000000")
        _add_complex(db, "C2", "2600000000")
        _add_complex(db, "C3", "4100000000")

        # 1번째 job: 11000 완료 후 체크포인트 저장, 실패
        job1 = CrawlJob(job_type="public_trade_data", status="failed")
        db.add(job1)
        db.commit()
        _checkpoint.save(db, job1.id, {"done_codes": ["11000"], "total": 3})

        # 2번째 job: 체크포인트를 저장하지 못한 채 실패 (row 자체가 없음)
        job2 = CrawlJob(job_type="public_trade_data", status="failed")
        db.add(job2)
        db.commit()
        assert _checkpoint.load(db, job2.id) is None  # 전제조건 확인

        seen_sigungu: list[str] = []

        def _fake_trades(sigungu_cd, deal_ymd):
            seen_sigungu.append(sigungu_cd)
            return []

        with patch("crawler.public_data_api.PublicDataAPI.get_all_apt_trades", side_effect=_fake_trades):
            _run_collect()

        # 1번째가 완료한 11000은 다시 처리되지 않아야 함 (유실 방지)
        assert "11000" not in seen_sigungu
        assert set(seen_sigungu) == {"26000", "41000"}
