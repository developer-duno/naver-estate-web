"""크롤링 서비스 — 공공데이터 실거래가 수집

E. 국토교통부 아파트 매매 실거래가 API → complex_price_history 저장
"""

import logging
import os

from crawler.cortar_legacy import to_standard_cortar
from crawler.service_common import _checkpoint, _upsert_price_history, fail_job_safely
from db.database import SessionLocal
from db.models import Complex, CrawlJob
from utils import safe_int, utcnow

logger = logging.getLogger(__name__)


def _to_standard_lawd_cd(complexes_in_region, fallback_sigungu_cd: str) -> str:
    """시군구 그룹의 단지 cortar_no 를 표준 코드로 번역해 lawd_cd(앞 5자리)를 만든다.

    ⚠ 5자리만 잘라서는 번역할 수 없다 — 레거시 12 체계와 표준 29/46 체계는 시군구 코드
    자체가 다르다(북구 = 12체계 300 / 29체계 170). 그래서 **10자리 cortar_no 를 번역한 뒤**
    앞 5자리를 취한다.

    같은 시군구의 단지들은 모두 같은 5자리로 수렴하므로 첫 번역 성공분을 쓴다.
    번역 대상이 없으면(전국 대부분) 원래 값을 그대로 돌려준다.
    """
    for c in complexes_in_region:
        cortar_no = getattr(c, "cortar_no", None)
        if not cortar_no:
            continue
        translated = to_standard_cortar(cortar_no)
        if translated and translated != cortar_no and len(translated) >= 5:
            return translated[:5]
    return fallback_sigungu_cd


def collect_public_trade_data(batch_size: int = 300, scheduler_job_id: str | None = None):
    """공공데이터포털 아파트 매매 실거래가 수집 → complex_price_history 저장.

    국토교통부 API에서 시군구별 실거래가를 가져와 기존 단지에 매칭 후 저장.
    IP 차단 우려 없이 네이버 시세 데이터를 보완한다.
    """
    api_key = os.getenv("PUBLIC_DATA_API_KEY")
    if not api_key:
        logger.info("PUBLIC_DATA_API_KEY 미설정 — 공공데이터 수집 건너뜀")
        if scheduler_job_id:
            db = SessionLocal()
            job = CrawlJob(
                job_type="public_trade_data", scheduler_job_id=scheduler_job_id,
                status="cancelled", started_at=utcnow(), completed_at=utcnow(),
                error_message="PUBLIC_DATA_API_KEY 미설정",
            )
            db.add(job)
            db.commit()
            db.close()
        return

    # 매월 10일 토요일 skip (mibunyang building-info ~8,500회와 API 쿼터 충돌 방지)
    from datetime import date
    today = date.today()
    if today.day == 10 and today.weekday() == 5:  # 5 = Saturday
        logger.info("매월 10일 토요일 — mibunyang building-info 쿼터 충돌 방지로 수집 skip")
        if scheduler_job_id:
            db = SessionLocal()
            job = CrawlJob(
                job_type="public_trade_data", scheduler_job_id=scheduler_job_id,
                status="cancelled", started_at=utcnow(), completed_at=utcnow(),
                error_message="쿼터 보호 건너뜀 (매월 10일 토요일)",
            )
            db.add(job)
            db.commit()
            db.close()
        return

    # lazy import — import chain 실패 방지
    from crawler.public_data_api import PublicDataAPI, _normalize_apt_name

    db = SessionLocal()

    # 재개(resume) — 직전 실행이 중단(failed/cancelled)됐다면 그 체크포인트를 이어받는다.
    # 시군구 목록은 매 실행 DB 쿼리로 새로 뽑혀 순서 보장이 없으므로(distinct, ORDER BY 없음),
    # "몇 번째까지"가 아니라 "이미 처리한 시군구 코드 집합"으로 저장해 순서 변동에 안전하게 함.
    #
    # ⚠ 가장 최근 job 1건만 보면 안 됨(세션 346 코드리뷰 발견) — 체크포인트는 5개 처리마다
    # 저장되므로, 연속 2회 실패 중 2번째 job이 자기 체크포인트를 저장하기 전에 죽으면
    # (예: 1~4개만 처리하고 죽음) "가장 최근 job"엔 체크포인트가 없어 1번째 job이 남긴
    # 진행분을 못 찾고 처음부터 재시작하게 된다. 최근 N건을 최신순으로 훑어 체크포인트가
    # 실제로 있는 첫 번째를 찾는다 — 오래된 job까지 무한정 훑지 않도록 상한을 둔다.
    done_codes: set[str] = set()
    recent_stopped_jobs = (
        db.query(CrawlJob)
        .filter(CrawlJob.job_type == "public_trade_data", CrawlJob.status.in_(["failed", "cancelled"]))
        .order_by(CrawlJob.id.desc())
        .limit(10)
        .all()
    )
    for prev_job in recent_stopped_jobs:
        prev_state = _checkpoint.load(db, prev_job.id)
        if prev_state and prev_state.get("done_codes"):
            done_codes = set(prev_state["done_codes"])
            logger.info("공공데이터 수집 재개: 이전 job %d 에서 %d개 시군구 완료분 이어받음", prev_job.id, len(done_codes))
            break

    job = CrawlJob(
        job_type="public_trade_data", scheduler_job_id=scheduler_job_id, status="running", started_at=utcnow()
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
        remaining_codes = [c for c in sigungu_codes if c not in done_codes]
        if done_codes:
            logger.info(
                "공공데이터 수집 시작: %d개 시군구 중 %d개 남음 (재개, %d개월)",
                len(sigungu_codes), len(remaining_codes), len(months),
            )
        else:
            logger.info("공공데이터 수집 시작: %d개 시군구 x %d개월", len(sigungu_codes), len(months))

        processed = 0
        matched = 0

        for i, sigungu_cd in enumerate(remaining_codes):
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

            # 국토교통부 API 에 넘길 lawd_cd — 광주·전남은 네이버가 주는 12-프리픽스
            # (전남광주통합특별시) 체계라 옛 체계(29/46)만 받는 공공 API 에는 그대로 쓸 수
            # 없다. **10자리 전체를 번역한 뒤 앞 5자리**를 취한다 — 두 체계는 시군구 코드가
            # 서로 달라(북구 = 12체계 300 / 29체계 170) 5자리만 잘라 변환할 수 없다.
            # 위 그룹핑 키(sigungu_cd)·체크포인트(done_codes)는 원본 그대로 둔다.
            api_lawd_cd = _to_standard_lawd_cd(complexes_in_region, sigungu_cd)

            for deal_ymd in months:
                trades = PublicDataAPI.get_all_apt_trades(api_lawd_cd, deal_ymd)
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

            done_codes.add(sigungu_cd)

            # 체크포인트 — 완료된 시군구 코드 집합을 저장 (재개 시 이 집합을 건너뜀).
            # sorted()는 다음 실행이 순서를 신뢰해서가 아니라(재개 시 다시 set으로 씀),
            # DB에 저장된 JSON을 사람이 볼 때 순서가 일정해 디버깅하기 편하기 위함.
            if _checkpoint.should_save(i + 1):
                db.commit()
                _checkpoint.save(db, job.id, {"done_codes": sorted(done_codes), "total": len(sigungu_codes)})
                logger.info("공공데이터 수집 중간 저장: %d/%d 시군구 완료", len(done_codes), len(sigungu_codes))

        job.status = "completed"
        job.total_items = processed
        job.processed_items = matched
        job.completed_at = utcnow()
        db.commit()
        _checkpoint.delete(db, job.id)
        logger.info("공공데이터 수집 완료: %d건 처리, %d건 매칭", processed, matched)

    except Exception as e:
        try:
            db.rollback()
            job.status = "failed"
            job.error_message = str(e)[:500]
            db.commit()
        except Exception:
            fail_job_safely(job.id, str(e))  # 연결 끊김 대비 새 세션 보장 (세션 266)
        logger.exception("공공데이터 수집 실패")
    finally:
        db.close()


def backfill_price_history(complex_no: str, months_back: int = 60) -> dict:
    """특정 단지의 과거 실거래가를 국토교통부 API로 소급 수집.

    네이버 시세 API가 최근 데이터만 반환하는 단지에 대해
    장기 이력을 보강하여 차트 기간 선택(6M/1Y/2Y/전체)이 의미있게 동작.

    Args:
        complex_no: 단지 번호
        months_back: 소급 기간 (기본 60개월 = 5년)

    Returns:
        {"collected": N, "months_covered": N, "complex_name": "..."}
    """
    from datetime import date, timedelta

    from crawler.public_data_api import PublicDataAPI, _normalize_apt_name

    db = SessionLocal()
    try:
        cpx = db.get(Complex, complex_no)
        if not cpx:
            raise ValueError(f"단지 {complex_no}을 찾을 수 없습니다")
        if not cpx.cortar_no or len(cpx.cortar_no) < 5:
            raise ValueError(f"단지 {complex_no}의 법정동코드(cortar_no)가 없습니다")

        # 10자리를 먼저 번역한 뒤 앞 5자리 — 광주·전남 12-프리픽스 대응
        # (5자리만 잘라 변환 불가한 이유는 _to_standard_lawd_cd docstring 참조).
        sigungu_cd = (to_standard_cortar(cpx.cortar_no) or cpx.cortar_no)[:5]
        norm_name = _normalize_apt_name(cpx.complex_name)
        if not norm_name:
            raise ValueError(f"단지명 정규화 실패: {cpx.complex_name}")
        # "단지" 접미사 제거 버전도 준비 (국토교통부 API 단지명과 매칭률 향상)
        import re
        norm_short = re.sub(r"단지$", "", norm_name)

        # 소급 대상 월 생성
        today = date.today()
        months = []
        for delta in range(months_back):
            d = today.replace(day=1) - timedelta(days=delta * 30)
            months.append(d.strftime("%Y%m"))
        months = sorted(set(months))

        collected = 0
        for deal_ymd in months:
            trades = PublicDataAPI.get_all_apt_trades(sigungu_cd, deal_ymd)
            if not trades:
                continue

            # 이 단지와 매칭되는 거래만 추출
            prices: list[int] = []
            for trade in trades:
                apt_name = trade.get("aptNm") or trade.get("아파트") or ""
                price_str = str(trade.get("dealAmount") or trade.get("거래금액") or "0")
                price = safe_int(price_str.replace(",", "").strip())
                if not price:
                    continue
                api_norm = _normalize_apt_name(apt_name)
                if api_norm == norm_name or api_norm == norm_short:
                    prices.append(price)

            if prices:
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
                collected += 1

        if collected > 0:
            db.commit()
        logger.info(
            "소급 수집 완료: complex=%s (%s), %d/%d 월 매칭",
            complex_no, cpx.complex_name, collected, len(months),
        )
        return {
            "collected": collected,
            "months_covered": len(months),
            "complex_name": cpx.complex_name,
        }
    finally:
        db.close()


def backfill_price_batch(batch_size: int = 20, scheduler_job_id: str | None = None):
    """가격 이력이 부족한 상위 단지 일괄 소급 수집.

    선정 기준: 세대수 상위 + price_history 6개월 미만인 단지.
    """
    from sqlalchemy import func, select

    from db.models import ComplexPriceHistory

    db = SessionLocal()
    # 어드민 scheduler-status 는 CrawlJob(scheduler_job_id) 최신 행으로 last_run 을
    # 보여준다 — 본 함수만 기록이 없어 화면에 항상 last_run: null 로 떠 실행 여부를
    # 알 수 없었다 (세션 288 라이브 점검). 같은 파일 collect_public_trade_data 패턴 답습.
    job = CrawlJob(
        job_type="price_backfill", scheduler_job_id=scheduler_job_id,
        status="running", started_at=utcnow(),
    )
    db.add(job)
    db.commit()
    job_id = job.id  # except 에서 깨진 세션의 ORM 속성 접근 피하기 위해 미리 확보

    try:
        rich_nos = (
            select(ComplexPriceHistory.complex_no)
            .group_by(ComplexPriceHistory.complex_no)
            .having(func.count() >= 6)
        )

        complexes = (
            db.query(Complex.complex_no)
            .filter(
                Complex.total_household_count.isnot(None),
                Complex.cortar_no.isnot(None),
                ~Complex.complex_no.in_(rich_nos),
            )
            .order_by(Complex.total_household_count.desc())
            .limit(batch_size)
            .all()
        )

        total = len(complexes)
        success = 0
        failed = 0
        for (cno,) in complexes:
            try:
                backfill_price_history(cno, months_back=24)
                success += 1
            except Exception:
                # ⚠ 세션 346 코드리뷰 정정: backfill_price_history()는 이 db와 별개인
                # 자신만의 SessionLocal()을 열어 쓴다(NullPool=독립 물리 연결)라서,
                # 여기서 실패해도 바깥 db 트랜잭션이 실제로 오염되지는 않는다 —
                # crawl_complex_details_batch(같은 db를 파라미터로 공유하는 구조)와는
                # 다르다. 지금 당장 InFailedSqlTransaction 연쇄를 막는 효과는 없지만,
                # 향후 리팩터로 db를 공유하게 되면 필요해질 방어 코드라 남겨둔다.
                db.rollback()
                failed += 1
                logger.exception("소급 수집 개별 실패: %s", cno)

        job.status = "completed"
        job.total_items = total
        job.processed_items = success
        job.completed_at = utcnow()
        db.commit()
        logger.info("소급 배치 완료: 성공 %d / 실패 %d / 전체 %d", success, failed, total)
        return {"success": success, "failed": failed, "total": total}
    except Exception as e:
        try:
            db.rollback()
            job.status = "failed"
            job.error_message = str(e)[:500]
            job.completed_at = utcnow()
            db.commit()
        except Exception:
            # 연결이 끊긴 세션이면 위 commit 도 던진다 — 새 세션으로 확실히 마킹
            fail_job_safely(job_id, str(e)[:500])
        logger.exception("소급 배치 실패")
        return {"success": 0, "failed": 0, "total": 0, "error": str(e)[:200]}
    finally:
        db.close()
