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
from datetime import timedelta
from unittest.mock import patch

from crawler.utils import CheckpointManager
from db.models import Complex, CrawlerCheckpoint, CrawlJob
from utils import utcnow

_checkpoint = CheckpointManager(checkpoint_interval=5)


def _stopped_job(status: str = "failed", *, hours_ago: int = 1):
    """중단된 job 픽스처 — started_at 을 반드시 채운다.

    재개 스캔에 신선도 필터(RESUME_MAX_AGE_HOURS)가 걸려 있어 started_at 이 NULL 이면
    `NULL >= cutoff` 가 NULL 이라 후보에서 빠진다. 운영 코드는 CrawlJob 생성 시 항상
    started_at=utcnow() 를 넣으므로(전수 확인), NULL 은 테스트 픽스처에서만 생기는 상황.
    """
    return CrawlJob(job_type="price_history", status=status,
                    started_at=utcnow() - timedelta(hours=hours_ago))


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
        prev_job = _stopped_job()
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

    def test_오래된_failed_job의_체크포인트는_이어받지_않는다(self, db):
        """신선도 상한(RESUME_MAX_AGE_HOURS) 회귀 가드 — 세션 370 발견 잠복 결함.

        실패 job 의 체크포인트는 영구 잔존한다(완료 시 자기 것만 삭제). 건수 상한(10)만
        있으면 어느 수요일 실행이 중간 실패했을 때 그 체크포인트가 **이후 매주** 스캔에
        걸려 같은 단지들을 계속 제외한다(이 잡도 주 1회 수 04:00 — public_trade_data 와
        동일한 주간 피해 구조). 4일 전(72h 초과) 실패 job 은 재개 후보에서 빠져야 한다.

        (72h 이내 = 기존대로 이어받음은 위 test_이전_failed_job... 이 이미 커버)
        """
        _add_complex(db, "C1")
        _add_complex(db, "C2")

        stale_job = _stopped_job(hours_ago=96)  # 4일 전 = RESUME_MAX_AGE_HOURS(72h) 초과
        db.add(stale_job)
        db.commit()
        _checkpoint.save(db, stale_job.id, {"done_complex_nos": ["C1"], "total": 2})

        seen_complex_nos: list[str] = []

        def _fake_get_prices(complex_no, trade_type=None, **kwargs):
            seen_complex_nos.append(complex_no)
            return _fake_price_result()

        with patch("crawler.service_price.NaverEstateAPI.get_complex_prices", side_effect=_fake_get_prices):
            from crawler.service_price import collect_price_history
            collect_price_history(batch_size=10, scheduler_job_id="collect_prices")

        # 낡은 체크포인트를 무시했으므로 C1 도 다시 처리돼야 한다
        assert "C1" in seen_complex_nos, "72h 초과 체크포인트를 이어받아 단지를 조용히 제외했다"
        assert set(seen_complex_nos) == {"C1", "C2"}

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

        job1 = _stopped_job(hours_ago=2)
        db.add(job1)
        db.commit()
        _checkpoint.save(db, job1.id, {"done_complex_nos": ["C1"], "total": 3})

        # 2번째 job: 체크포인트를 저장 못 하고 실패 (row 없음)
        job2 = _stopped_job(hours_ago=1)
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
