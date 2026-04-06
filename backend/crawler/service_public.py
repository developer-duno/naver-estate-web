"""크롤링 서비스 — 공공데이터 실거래가 수집

E. 국토교통부 아파트 매매 실거래가 API → complex_price_history 저장
"""

import logging
import os

from crawler.service_common import _checkpoint, _upsert_price_history
from db.database import SessionLocal
from db.models import Complex, CrawlJob
from utils import safe_int, utcnow

logger = logging.getLogger(__name__)


def collect_public_trade_data(batch_size: int = 300):
    """공공데이터포털 아파트 매매 실거래가 수집 → complex_price_history 저장.

    국토교통부 API에서 시군구별 실거래가를 가져와 기존 단지에 매칭 후 저장.
    IP 차단 우려 없이 네이버 시세 데이터를 보완한다.
    """
    api_key = os.getenv("PUBLIC_DATA_API_KEY")
    if not api_key:
        logger.info("PUBLIC_DATA_API_KEY 미설정 — 공공데이터 수집 건너뜀")
        return

    # 매월 10일 토요일 skip (mibunyang building-info ~8,500회와 API 쿼터 충돌 방지)
    from datetime import date
    today = date.today()
    if today.day == 10 and today.weekday() == 5:  # 5 = Saturday
        logger.info("매월 10일 토요일 — mibunyang building-info 쿼터 충돌 방지로 수집 skip")
        return

    # lazy import — import chain 실패 방지
    from crawler.public_data_api import PublicDataAPI, _normalize_apt_name

    db = SessionLocal()
    job = CrawlJob(
        job_type="public_trade_data", status="running", started_at=utcnow()
    )
    db.add(job)
    db.commit()

    try:
        # 수집 대상 월: 최근 24개월 (차트 분별력 확보, 일일 한도 10,000회 충분)
        from datetime import date, timedelta
        today = date.today()
        months = []
        for delta in range(24):
            d = today.replace(day=1) - timedelta(days=delta * 30)
            months.append(d.strftime("%Y%m"))
        months = sorted(set(months))  # 중복 제거 + 정렬

        # DB에서 고유 시군구코드 추출 (cortar_no 앞 5자리)
        from sqlalchemy import func
        sigungu_rows = (
            db.query(
                func.left(Complex.cortar_no, 5).label("sigungu_cd"),
            )
            .filter(Complex.cortar_no.isnot(None))
            .filter(func.length(Complex.cortar_no) >= 5)
            .distinct()
            .limit(batch_size)
            .all()
        )
        sigungu_codes = [r.sigungu_cd for r in sigungu_rows if r.sigungu_cd]
        logger.info("공공데이터 수집 시작: %d개 시군구 x %d개월", len(sigungu_codes), len(months))

        processed = 0
        matched = 0

        for i, sigungu_cd in enumerate(sigungu_codes):
            # 해당 시군구의 단지 목록 조회 (매칭용)
            complexes_in_region = (
                db.query(Complex.complex_no, Complex.complex_name, Complex.cortar_no)
                .filter(Complex.cortar_no.startswith(sigungu_cd))
                .all()
            )
            if not complexes_in_region:
                continue

            # 정규화된 이름 → complex_no 매핑 딕셔너리
            name_map: dict[str, str] = {}
            for c in complexes_in_region:
                norm_name = _normalize_apt_name(c.complex_name)
                if norm_name:
                    name_map[norm_name] = c.complex_no

            for deal_ymd in months:
                trades = PublicDataAPI.get_all_apt_trades(sigungu_cd, deal_ymd)
                if not trades:
                    continue

                # 아파트별 거래 그룹핑 → 월별 min/max/avg 집계
                apt_groups: dict[str, list[int]] = {}
                for trade in trades:
                    apt_name = trade.get("aptNm") or trade.get("아파트") or ""
                    price_str = str(trade.get("dealAmount") or trade.get("거래금액") or "0")
                    price = safe_int(price_str.replace(",", "").strip())
                    if not apt_name or not price:
                        continue
                    norm = _normalize_apt_name(apt_name)
                    if norm not in apt_groups:
                        apt_groups[norm] = []
                    apt_groups[norm].append(price)

                # 기존 단지에 매칭하여 upsert
                for norm_name, prices in apt_groups.items():
                    complex_no = name_map.get(norm_name)
                    if not complex_no:
                        continue

                    _upsert_price_history(
                        db,
                        complex_no=complex_no,
                        trade_type="A1",
                        area_no=None,
                        price_upper=max(prices),
                        price_lower=min(prices),
                        price_avg=round(sum(prices) / len(prices)),
                        base_month=deal_ymd,
                    )
                    matched += 1

                processed += len(trades)

            # 체크포인트
            if _checkpoint.should_save(i + 1):
                db.commit()
                _checkpoint.save(db, job.id, {"processed_sigungu": i + 1, "total": len(sigungu_codes)})
                logger.info("공공데이터 수집 중간 저장: %d/%d 시군구", i + 1, len(sigungu_codes))

        job.status = "completed"
        job.total_items = processed
        job.processed_items = matched
        job.completed_at = utcnow()
        db.commit()
        _checkpoint.delete(db, job.id)
        logger.info("공공데이터 수집 완료: %d건 처리, %d건 매칭", processed, matched)

    except Exception as e:
        db.rollback()
        job.status = "failed"
        job.error_message = str(e)[:500]
        db.commit()
        logger.exception("공공데이터 수집 실패")
    finally:
        db.close()
