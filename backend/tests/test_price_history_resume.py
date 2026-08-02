"""collect_price_history() 재개(resume) 로직 회귀 테스트 (세션 346).

배경: collect_public_trade_data()의 재개 로직 신설(023c6fb) 후 코드리뷰에서
collect_price_history()도 동일 패턴(_checkpoint.save()만 있고 load() 없음)임을
발견. 이 함수는 last_crawled_at 을 자신이 갱신하지 않아(다른 크롤러가 갱신) 재시작
시 정렬 기준이 안 바뀌어 매번 같은 top-N 을 다시 뽑는 위험이 있었음(조사 결과 확정).

수정: job_type="price_history" 실패/취소 job의 체크포인트에서 "이미 처리한
complex_no 집합"을 조회해 쿼리 단계에서 제외(NOT IN) — public_trade_data 와 달리
이 함수는 목록 전체가 아니라 top-N(limit) 만 뽑으므로 "이어서 처리"가 아니라
"제외 후 다시 top-N" 방식.

검증 메커니즘은 test_public_trade_resume.py 선례 답습.
"""
from unittest.mock import patch

from crawler.utils import CheckpointManager
from db.models import Complex, CrawlerCheckpoint, CrawlJob

_checkpoint = CheckpointManager(checkpoint_interval=5)


def _add_complex(db, no: str, name: str = "테스트단지"):
    db.add(Complex(complex_no=no, complex_name=name))
    db.commit()


def _fake_price_result():
    """빈 marketPrices — 매칭 로직은 이 테스트 범위 밖, 호출 여부만 검증"""
    return {"marketPrices": []}


class TestPriceHistoryResume:
    """이전 실행이 중단됐을 때 이미 처리한 단지를 건너뛰고 재개하는지 검증"""

    def test_이전_failed_job의_체크포인트를_이어받아_남은_단지만_처리(self, db):
        _add_complex(db, "C1")
        _add_complex(db, "C2")
        _add_complex(db, "C3")

        # 이전 실행이 C1만 완료하고 실패한 상태를 흉내
        prev_job = CrawlJob(job_type="price_history", status="failed")
        db.add(prev_job)
        db.commit()
        _checkpoint.save(db, prev_job.id, {"done_complex_nos": ["C1"], "total": 3})

        seen_complex_nos: list[str] = []

        def _fake_get_prices(complex_no, trade_type=None, **kwargs):
            seen_complex_nos.append(complex_no)
            return _fake_price_result()

        with patch("crawler.service_price.NaverEstateAPI.get_complex_prices", side_effect=_fake_get_prices):
            from crawler.service_price import collect_price_history
            collect_price_history(batch_size=10, scheduler_job_id="collect_prices")

        # C1(이미 완료)은 다시 호출되지 않고 C2/C3만 처리됐어야 함
        assert "C1" not in seen_complex_nos
        assert set(seen_complex_nos) == {"C2", "C3"}

        new_job = (
            db.query(CrawlJob)
            .filter(CrawlJob.job_type == "price_history", CrawlJob.status == "completed")
            .one()
        )
        assert new_job.status == "completed"
        assert db.get(CrawlerCheckpoint, new_job.id) is None

    def test_체크포인트_없으면_처음부터_전체_처리(self, db):
        _add_complex(db, "C1")
        _add_complex(db, "C2")

        seen_complex_nos: list[str] = []

        def _fake_get_prices(complex_no, trade_type=None, **kwargs):
            seen_complex_nos.append(complex_no)
            return _fake_price_result()

        with patch("crawler.service_price.NaverEstateAPI.get_complex_prices", side_effect=_fake_get_prices):
            from crawler.service_price import collect_price_history
            collect_price_history(batch_size=10, scheduler_job_id="collect_prices")

        assert set(seen_complex_nos) == {"C1", "C2"}

    def test_연속_2회_실패해도_1번째_진행분이_유실되지_않는다(self, db):
        """service_public.py 와 동일 회귀 가드 — 최근 job 1건만 보면 연속 실패 시 진행분 유실"""
        _add_complex(db, "C1")
        _add_complex(db, "C2")
        _add_complex(db, "C3")

        job1 = CrawlJob(job_type="price_history", status="failed")
        db.add(job1)
        db.commit()
        _checkpoint.save(db, job1.id, {"done_complex_nos": ["C1"], "total": 3})

        # 2번째 job: 체크포인트를 저장 못 하고 실패 (row 없음)
        job2 = CrawlJob(job_type="price_history", status="failed")
        db.add(job2)
        db.commit()
        assert _checkpoint.load(db, job2.id) is None  # 전제조건 확인

        seen_complex_nos: list[str] = []

        def _fake_get_prices(complex_no, trade_type=None, **kwargs):
            seen_complex_nos.append(complex_no)
            return _fake_price_result()

        with patch("crawler.service_price.NaverEstateAPI.get_complex_prices", side_effect=_fake_get_prices):
            from crawler.service_price import collect_price_history
            collect_price_history(batch_size=10, scheduler_job_id="collect_prices")

        assert "C1" not in seen_complex_nos
        assert set(seen_complex_nos) == {"C2", "C3"}
