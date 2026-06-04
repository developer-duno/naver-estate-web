"""크롤링 서비스 — 단지 가치지표 수집

complex_price_history 에서 단지별 가치지표 3필드를 집계해 complexes 테이블에
채운다. 네이버 API 호출 없이 DB 집계만 — IP 차단 위험 없음.

채우는 필드:
- nearby_median_price: 최근 6개월 매매(A1) 시세 중앙값
- jeonse_rate: 전세(B1) 중앙값 / 매매(A1) 중앙값 × 100
- recent_trades_6m: 최근 6개월 A1 시세 이력 레코드 수
"""

import logging

from crawler.metrics_helpers import calc_median_price, count_recent_price_records
from crawler.service_common import _checkpoint, fail_job_safely
from crawler.stats import compute_jeonse_rate
from db.database import SessionLocal
from db.models import Complex, CrawlJob
from utils import utcnow

logger = logging.getLogger(__name__)


def collect_complex_metrics(batch_size: int = 200, scheduler_job_id: str | None = None):
    """단지 가치지표 3필드 배치 수집 → complexes 테이블 UPDATE.

    nearby_median_price 가 NULL 인 단지를 세대수 큰 순으로 우선 처리.
    시세 이력이 없어 중앙값이 None 인 단지는 건너뛴다 (NULL 유지).
    """
    db = SessionLocal()
    job = CrawlJob(
        job_type="complex_metric",
        scheduler_job_id=scheduler_job_id,
        status="running",
        started_at=utcnow(),
    )
    db.add(job)
    db.commit()

    try:
        complexes = (
            db.query(Complex.complex_no)
            .filter(Complex.nearby_median_price.is_(None))
            .order_by(Complex.total_household_count.desc().nullslast())
            .limit(batch_size)
            .all()
        )

        processed = 0
        for i, (complex_no,) in enumerate(complexes):
            median = calc_median_price(db, complex_no, "A1", months=6)
            if median is None:
                # 시세 이력 없음 — 채울 값 없으므로 건너뜀
                continue

            jeonse_median = calc_median_price(db, complex_no, "B1", months=6)
            # 전세가율은 정의상 전세 < 매매 (100% 미만) 여야 한다.
            # complex_price_history 의 B1 데이터 84% 가 A1 과 동일값인 결함이
            # 있어, 전세중앙값 >= 매매중앙값이면 신뢰 불가로 보고 NULL 유지.
            if jeonse_median is not None and jeonse_median >= median:
                jeonse_median = None
            jeonse_rate = compute_jeonse_rate(median, jeonse_median)
            recent = count_recent_price_records(db, complex_no, months=6)

            db.query(Complex).filter(Complex.complex_no == complex_no).update(
                {
                    Complex.nearby_median_price: median,
                    Complex.jeonse_rate: jeonse_rate,
                    Complex.recent_trades_6m: recent,
                    Complex.updated_at: utcnow(),
                },
                synchronize_session=False,
            )
            processed += 1

            if _checkpoint.should_save(i + 1):
                db.commit()
                _checkpoint.save(db, job.id, {"processed": i + 1, "total": len(complexes)})
                logger.info("가치지표 수집 중간 저장: %d/%d", i + 1, len(complexes))

        job.status = "completed"
        job.total_items = len(complexes)
        job.processed_items = processed
        job.completed_at = utcnow()
        db.commit()
        _checkpoint.delete(db, job.id)
        logger.info("가치지표 수집 완료: %d건 갱신", processed)

    except Exception as e:
        try:
            db.rollback()
            job.status = "failed"
            job.error_message = str(e)[:500]
            db.commit()
        except Exception:
            # 연결 끊김 등으로 같은 세션 마킹 실패 → 새 세션으로 보장 (세션 266)
            fail_job_safely(job.id, str(e))
        logger.exception("가치지표 수집 실패")
    finally:
        db.close()
