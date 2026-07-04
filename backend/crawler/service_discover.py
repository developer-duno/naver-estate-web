"""크롤링 서비스 — 단지 발견 + 매물 수집 + 상세 보강

A. 단지 발견: 지역별 키워드 검색으로 단지 목록 수집
B. 매물 수집: 단지별 전체 매물 크롤링
C. 상세 보강: 매물 상세 정보 크롤링
"""

import logging
import os

from dotenv import load_dotenv

from crawler.service_common import fail_job_safely
from crawler.utils import get_shared_throttle
from db.complex_queries import (
    get_complexes_for_article_crawl,
    get_complexes_for_detail_enrich,
)
from db.database import SessionLocal
from db.models import Article, Complex, CrawlJob
from services.cache import get_cache
from services.enricher import enrich_complex_detail
from services.naver_call_counter import record_call
from services.upsert import (
    build_detail_update_dict,
    delete_missing_articles,
    upsert_article,
    upsert_complex_from_search,
)
from shared.constants import KOREA_REGIONS
from shared.domain.article import RealEstateArticle
from shared.naver_api import NaverEstateAPI
from utils import utcnow

load_dotenv()
logger = logging.getLogger(__name__)

# 적응형 쓰로틀 — 429 발생 시 자동으로 간격 증가, 정상화 시 서서히 복귀.
# 공유 레지스트리 사용 — 스케줄러 배치와 live 경로(_background_crawl)가 같은
# 인스턴스를 참조하므로 네이버 API 호출이 서로의 간격을 존중한다.
_throttle_discover = get_shared_throttle("discover", min_interval=2.0, max_interval=10.0)
_throttle_articles = get_shared_throttle("articles", min_interval=2.0, max_interval=10.0)


def _finalize_job(db, job: CrawlJob, target_status: str, **extra_fields) -> bool:
    """워커 종료 시 job.status 덮어쓰기 race 가드.

    다른 주체(관리자 pause/cancel)가 status 를 이미 바꿨으면 덮지 않음.
    DB 에서 최신 값을 다시 읽어서 'running' 일 때만 목표 상태로 전환한다.
    반환: 실제로 덮어썼으면 True, skip 했으면 False.
    """
    try:
        db.refresh(job)
    except Exception as e:
        logger.warning("[race guard] job refresh 실패(무시): %s", type(e).__name__)
    if job.status != "running":
        logger.info(
            "[race guard] job %s 종료 skip — 현재 status=%s (target=%s)",
            job.id, job.status, target_status,
        )
        return False
    job.status = target_status
    for k, v in extra_fields.items():
        setattr(job, k, v)
    return True
_throttle_details = get_shared_throttle("details", min_interval=1.5, max_interval=10.0)
# 단지 상세(get_complex_detail) 전용 — 매물 API 와 엔드포인트가 달라 별도 throttle.
_throttle_detail = get_shared_throttle("complex_detail", min_interval=2.0, max_interval=10.0)

# 크롤링 대상 부동산 유형 (기본: 아파트 관련 4종)
CRAWL_REAL_ESTATE_TYPES = set(
    os.getenv("CRAWL_REAL_ESTATE_TYPES", "APT:ABYG:JGC:PRE:OPST:OBYG:RDV").split(":")
)


# ── A. 단지 발견 ──

def discover_complexes_by_region(sido: str, sigungu: str, dong: str = None, scheduler_job_id: str | None = None):
    """지역 키워드로 네이버 검색 → complexes 테이블 upsert"""
    keyword = f"{sido} {sigungu}"
    if dong:
        keyword += f" {dong}"

    db = SessionLocal()
    job = CrawlJob(job_type="complex_list", target_id=keyword, scheduler_job_id=scheduler_job_id, status="running", started_at=utcnow())
    db.add(job)
    db.commit()

    try:
        page = 1
        total_found = 0
        while True:
            record_call("search_discover")
            result = NaverEstateAPI.search_by_keyword(keyword, page=page)
            if not result or "error" in result:
                break

            complex_list = result.get("complexes") or result.get("complexList") or []
            if not complex_list:
                break

            for c_data in complex_list:
                # 설정된 부동산 유형만 필터링
                re_type = c_data.get("realEstateTypeCode", "")
                if re_type and re_type not in CRAWL_REAL_ESTATE_TYPES:
                    continue
                # commit=False: 아래 루프 종료 후 job 갱신과 함께 한 번에 커밋.
                # 기존엔 단지마다 커밋 + 루프 후 또 커밋 = 단지별 커밋이 순수 낭비였다.
                upsert_complex_from_search(db, c_data, sido, sigungu, dong, commit=False)
                total_found += 1

            # 다음 페이지가 있는지 확인
            if not result.get("isMoreData", False):
                break
            page += 1
            _throttle_discover.wait()

        job.status = "completed"
        # total_items 미설정이면 어드민 scheduler-status 에 total 0 / processed N 으로
        # 어긋나 보였다 (세션 288 라이브 점검 L3). 발견형 잡은 둘이 같은 값.
        job.total_items = total_found
        job.processed_items = total_found
        job.completed_at = utcnow()
        db.commit()
        logger.info("단지 발견 완료: %s → %d건", keyword, total_found)

    except Exception as e:
        try:
            db.rollback()
            job.status = "failed"
            job.error_message = str(e)[:500]
            db.commit()
        except Exception:
            # 연결 끊김 등으로 같은 세션 마킹 실패 → 새 세션으로 보장 (세션 266)
            fail_job_safely(job.id, str(e))
        logger.exception("단지 발견 실패: %s", keyword)
    finally:
        db.close()


def discover_all_regions(scheduler_job_id: str | None = None):
    """전국 모든 지역 순회하며 단지 발견"""
    for sido, sigungu_dict in KOREA_REGIONS.items():
        for sigungu, dong_list in sigungu_dict.items():
            logger.info("단지 발견 시작: %s %s", sido, sigungu)
            discover_complexes_by_region(sido, sigungu, scheduler_job_id=scheduler_job_id)
            _throttle_discover.wait(extra_delay=0.5)  # 지역 간 딜레이


# ── B. 매물 수집 ──

def crawl_complex_articles(complex_no: str, sido: str = None, sigungu: str = None, scheduler_job_id: str | None = None):
    """단지의 전체 매물 크롤링 → articles 테이블 upsert"""
    db = SessionLocal()
    job = CrawlJob(job_type="complex_articles", target_id=complex_no, scheduler_job_id=scheduler_job_id, status="running", started_at=utcnow())
    db.add(job)
    db.commit()

    try:
        page = 1
        all_article_nos = set()
        total_articles = 0

        # 기존 가격 일괄 조회 (N+1 방지)
        existing_prices = {
            row[0]: (row[1], row[2])
            for row in db.query(
                Article.article_no, Article.numeric_price, Article.numeric_rent_price
            ).filter(
                Article.complex_no == complex_no, Article.is_active == True
            ).all()
        }

        # 매물유형명 폴백용 단지 유형명 1회 조회 — 네이버 매물 리스트
        # 응답에 realEstateTypeName 이 거의 없어 매물 유형명이 NULL 로
        # 저장되는 문제(활성매물 78%) 보완. 단지 유형명은 V021 backfill 로
        # NULL 0건이라 폴백 소스로 신뢰 가능.
        complex_type_name = (
            db.query(Complex.real_estate_type_name)
            .filter(Complex.complex_no == complex_no)
            .scalar()
        )

        while True:
            record_call("crawl_articles_batch")
            result = NaverEstateAPI.get_complex_articles(complex_no, page=page)
            if not result or "error" in result:
                break

            article_list = result.get("articleList") or []
            if not article_list:
                break

            for a_data in article_list:
                article = RealEstateArticle.from_dict(a_data)
                article.complex_no = complex_no
                if not article.article_real_estate_type_name and complex_type_name:
                    article.article_real_estate_type_name = complex_type_name
                upsert_article(db, article, track_price=True, existing_prices=existing_prices)
                all_article_nos.add(article.article_no)
                total_articles += 1

            if not result.get("isMoreData", False):
                break
            page += 1
            _throttle_articles.wait()

        # 이번 크롤링에서 안 보인 매물 → 물리 삭제 (네이버에 없는 매물은 보존 불필요)
        delete_missing_articles(db, complex_no, all_article_nos)
        # /api/stats 캐시 무효화 — 물리 삭제로 article_count 변동
        get_cache("stats", dynamic=True).delete("db_stats")

        # 단지 last_crawled_at 업데이트
        db.query(Complex).filter(Complex.complex_no == complex_no).update(
            {"last_crawled_at": utcnow()}
        )

        # 단지 상세 정보 보강 (1회성: detail_crawled_at이 없는 경우만)
        cpx = db.query(Complex).filter(Complex.complex_no == complex_no).first()
        if cpx and not cpx.detail_crawled_at:
            enrich_complex_detail(db, complex_no)

        _finalize_job(
            db, job, "completed",
            total_items=total_articles,
            processed_items=total_articles,
            completed_at=utcnow(),
        )
        db.commit()
        logger.info("매물 수집 완료: complex %s → %d건", complex_no, total_articles)

    except Exception as e:
        try:
            db.rollback()
            _finalize_job(db, job, "failed", error_message=str(e)[:500], completed_at=utcnow())
            db.commit()
        except Exception:
            # 연결 끊김 등으로 같은 세션 마킹 실패 → 새 세션으로 보장 (세션 266)
            fail_job_safely(job.id, str(e))
        logger.exception("매물 수집 실패: complex %s", complex_no)
    finally:
        NaverEstateAPI.clear_cache()
        db.close()


def crawl_popular_complexes(batch_size: int = 100, scheduler_job_id: str | None = None):
    """인기 단지 선제적 크롤링 — 최근 사용자가 조회한 단지 우선.

    선정 기준: last_crawled_at 최근순 (= 사용자가 실제 검색/조회한 단지)
    IP 차단 방지를 위해 단지 간 2초 대기.
    """
    db = SessionLocal()
    job = CrawlJob(job_type="popular_crawl", scheduler_job_id=scheduler_job_id, status="running", started_at=utcnow())
    db.add(job)
    db.commit()

    try:
        # 1순위: 사용자가 최근 조회한 단지 (last_crawled_at 최신순)
        complexes = (
            db.query(Complex)
            .filter(Complex.last_crawled_at.isnot(None))
            .order_by(Complex.last_crawled_at.desc())
            .limit(batch_size)
            .all()
        )

        # 폴백: 인기 단지가 없으면 최근 등록된 단지로 로테이션
        if not complexes:
            complexes = (
                db.query(Complex)
                .filter(Complex.total_household_count.isnot(None))
                .order_by(Complex.total_household_count.desc())
                .limit(batch_size)
                .all()
            )
            if complexes:
                logger.info("인기 단지 0개 → 세대수 상위 %d개 단지로 폴백", len(complexes))

        total = len(complexes)
        logger.info("인기 단지 선제적 크롤링 시작: %d개 단지", total)
        processed = 0
        failed = 0
        failed_nos: list[str] = []
        for cpx in complexes:
            try:
                crawl_complex_articles(cpx.complex_no, cpx.sido, cpx.sigungu)
                processed += 1
            except Exception:
                failed += 1
                failed_nos.append(str(cpx.complex_no))
                logger.exception("인기 단지 크롤링 개별 실패: complex %s", cpx.complex_no)
            _throttle_articles.wait(extra_delay=0.5)

        # race guard: 아래 status 판정 결과를 일괄로 _finalize_job 에 전달
        if failed == 0:
            target_status = "completed"
            err_msg = None
        elif processed == 0:
            target_status = "failed"
            err_msg = f"전체 {total}개 단지 실패: {', '.join(failed_nos[:20])}"
        else:
            target_status = "completed"
            err_msg = f"{failed}/{total}개 단지 실패: {', '.join(failed_nos[:20])}"
        _finalize_job(
            db, job, target_status,
            total_items=total,
            processed_items=processed,
            completed_at=utcnow(),
            error_message=err_msg,
        )
        db.commit()
        logger.info("인기 단지 선제적 크롤링 완료: 성공 %d / 실패 %d / 전체 %d", processed, failed, total)

    except Exception as e:
        try:
            db.rollback()
            _finalize_job(db, job, "failed", error_message=str(e)[:500], completed_at=utcnow())
            db.commit()
        except Exception:
            fail_job_safely(job.id, str(e))  # 연결 끊김 대비 새 세션 보장 (세션 266)
        logger.exception("인기 단지 선제적 크롤링 실패")
    finally:
        db.close()


def crawl_articles_batch(batch_size: int = 50, scheduler_job_id: str | None = None):
    """활성매물 0건 단지를 먼저, 그 다음 last_crawled_at 오래된 순으로 매물 수집.

    live 경로(_background_crawl)와 단지별 소유권을 공유 — 이미 live 쪽이
    같은 complex_no를 크롤 중이면 해당 단지는 skip하고 다음으로 넘어간다.
    또한 live 경로의 `crawl_done:{complex_no}` 캐시(get_dynamic_ttl)를 공유해
    최근 크롤된 단지는 동적 TTL 동안 재크롤하지 않는다.

    선정 기준은 get_complexes_for_article_crawl 참조 — last_crawled_at
    허수(2026-04-13 일괄 UPDATE)로 매물 0건 단지가 후순위로 밀린 문제 보완.
    """
    from routers.live._shared import _cache, release_complex, try_acquire_complex

    db = SessionLocal()
    try:
        complexes = get_complexes_for_article_crawl(db, batch_size)
        logger.info("매물 수집 배치 시작: %d개 단지", len(complexes))
        for cpx in complexes:
            done_key = f"crawl_done:{cpx.complex_no}"
            if _cache.get(done_key) is not None:
                logger.info("배치 skip: %s 동적 TTL 캐시 히트", cpx.complex_no)
                continue
            if not try_acquire_complex(cpx.complex_no):
                logger.info("배치 skip: %s 이미 크롤 진행 중", cpx.complex_no)
                continue
            try:
                crawl_complex_articles(
                    cpx.complex_no, cpx.sido, cpx.sigungu, scheduler_job_id=scheduler_job_id
                )
                _cache.set(done_key, True)
            finally:
                release_complex(cpx.complex_no)
            _throttle_articles.wait()
    finally:
        db.close()


# ── C. 상세 보강 ──

# 네이버 상세 API 가 "매물 없음(진짜 dead)" 으로 응답하는 error code 목록.
# 라이브 실측: dead 매물은 HTTP 200 + 본문 {"error": {"code": "errorCode.NotExistInformation", ...}}.
# 반면 transient(401/403/429/5xx/네트워크)는 naver_api 가 {"error": "<문자열 메시지>"} 로 반환한다.
# 즉 error 값이 dict 이고 code 가 아래 집합이면 진짜 dead, 그 외 error 는 transient.
_DEAD_ERROR_CODES = frozenset({"errorCode.NotExistInformation"})


def _is_dead_detail(detail_data) -> bool:
    """상세 응답이 '네이버에서 지워진 매물(진짜 dead)' 인지 판정.

    True  = 비활성화 대상 (detail_crawled=True, is_active=False).
    False = transient 오류 → 플래그 유지하고 다음 배치 재시도 (살아있는 매물 오비활성화 방지).
    """
    if not isinstance(detail_data, dict):
        return False
    err = detail_data.get("error")
    if isinstance(err, dict):
        return err.get("code") in _DEAD_ERROR_CODES
    return False


def crawl_article_details(batch_size: int = 100, scheduler_job_id: str | None = None):
    """detail_crawled=FALSE인 활성 매물의 상세 정보 크롤링"""
    db = SessionLocal()
    job = CrawlJob(job_type="article_detail", scheduler_job_id=scheduler_job_id, status="running", started_at=utcnow())
    db.add(job)
    db.commit()

    try:
        # 아래 후보 SELECT 가 부하 꼬리에서 간헐적으로 8s statement_timeout 에 잘린다
        # (2026-06-10 라이브 24h 31회 중 2회 QueryCanceled, 동일 쿼리 EXPLAIN 1.4~3.3s).
        # 8s 가드(세션 255)는 웹 요청 폭주 보호용 — 배치 잡 세션에 한해 30s 로 상향.
        # NullPool 이라 연결이 세션 전용이고 종료 시 닫혀 다른 요청에 누수 0.
        # 인덱스 추가는 세션 266·267 적대검증 폐기 답습 유지(combined_aggregate_index_void).
        if db.bind is not None and db.bind.dialect.name == "postgresql":
            from sqlalchemy import text
            db.execute(text("SET statement_timeout = 30000"))

        articles = (
            db.query(Article)
            .filter(Article.detail_crawled == False, Article.is_active == True)
            # 신선도 우선: 최근 본(=네이버에 살아있는) 매물부터 상세 크롤. heap 순서면
            # 2.5개월 묵은 죽은 매물(상세 API 404)부터 픽해 배치가 100% 헛돈다(filled 0).
            # last_seen_at 최신 = 상세 API 살아있음(라이브 실증). 인덱스 불필요 — 이 쿼리
            # (ORDER BY 포함) 그대로 라이브 EXPLAIN ANALYZE 실측 = 1584ms cold / 305ms warm
            # (Gather Merge + top-N heapsort), timeout 8s 의 5배 여유. last_seen_at 단독 인덱스는
            # 세션266·267 적대검증이 이미 폐기(combined_aggregate_index_void 룰) — 정렬만 추가.
            .order_by(Article.last_seen_at.desc().nullslast())
            .limit(batch_size)
            .all()
        )

        job.total_items = len(articles)
        processed = 0

        # 루프 전 속성 선추출 — 배치 commit(50건, line 459)이 expire_on_commit=True(기본,
        # database.py:65)로 art 객체를 expired 시키면, 다음 순회 art.article_no 등 접근이
        # PK 재조회 lazy-load(SELECT ... WHERE article_no=:pk)를 유발한다. 평상시엔 throttle
        # 1.5초에 흡수되나 DB 부하 구간엔 이 PK 조회가 20~30초로 치솟아 statement_timeout →
        # QueryCanceled → 트랜잭션 aborted → _finalize_job 2차 사망(세션 342 실측: 2026-07-04
        # 21:53·22:26). 루프에 필요한 5개 속성을 미리 뽑아 ORM 재접근을 제거한다.
        arts = [
            (a.article_no, a.trade_type_name, a.deal_or_warrant_prc, a.rent_prc, a.area2_m2)
            for a in articles
        ]

        skipped_dead = 0
        skipped_transient = 0
        for i, (article_no, trade_type_name, deal_or_warrant_prc, rent_prc, area2_m2) in enumerate(arts):
            record_call("article_detail_batch")
            detail_data = NaverEstateAPI.get_article_detail(article_no)
            if detail_data and "error" not in detail_data:
                # 도메인 객체로 변환 후 상세 업데이트
                domain_article = RealEstateArticle(
                    article_no=article_no,
                    trade_type_name=trade_type_name or "",
                )
                domain_article.deal_or_warrant_prc = deal_or_warrant_prc
                domain_article.rent_prc = rent_prc
                domain_article.area2_m2 = area2_m2
                domain_article.update_from_detail(detail_data)

                # DB 업데이트 (commit은 배치로)
                update_data = build_detail_update_dict(domain_article, detail_data)
                db.query(Article).filter(Article.article_no == article_no).update(
                    update_data, synchronize_session=False
                )
                processed += 1
            elif _is_dead_detail(detail_data):
                # 진짜 dead (NotExistInformation) → 네이버에서 이미 지운 매물.
                # detail_crawled=TRUE + is_active=FALSE로 마크해 같은 매물이 다음
                # 배치에서 반복 pick되지 않도록 한다.
                db.query(Article).filter(Article.article_no == article_no).update(
                    {"detail_crawled": True, "is_active": False},
                    synchronize_session=False,
                )
                skipped_dead += 1
            else:
                # transient 오류 (401/403/429/5xx/네트워크) → 플래그 안 건드림.
                # 신선도 우선 정렬로 배치 앞이 살아있는 신선 매물이라, 일시 오류로
                # 살아있는 매물을 잘못 비활성화하지 않도록 다음 배치 재시도에 맡긴다.
                skipped_transient += 1

            # CV-49: 배치 commit (50건 단위) — 행별 commit 대신
            if (i + 1) % 50 == 0:
                db.commit()

            _throttle_details.wait()

        _finalize_job(
            db, job, "completed",
            processed_items=processed,
            completed_at=utcnow(),
        )
        db.commit()  # 나머지 flush
        logger.info(
            "상세 보강 완료: %d/%d건 (dead %d건 비활성화, transient %d건 재시도 대기)",
            processed, len(articles), skipped_dead, skipped_transient,
        )

    except Exception as e:
        try:
            db.rollback()
            _finalize_job(db, job, "failed", error_message=str(e)[:500], completed_at=utcnow())
            db.commit()
        except Exception:
            fail_job_safely(job.id, str(e))  # 연결 끊김 대비 새 세션 보장 (세션 266)
        logger.exception("상세 보강 실패")
    finally:
        db.close()


# ── K. 단지 상세 유형별 backfill ──

def crawl_complex_details_batch(
    real_estate_type: str, batch_size: int = 500, scheduler_job_id: str | None = None
):
    """detail_crawled_at IS NULL 단지를 매물유형별로 골라 단지 상세 보강.

    real_estate_type 으로 유형(APT/OPST/JGC/ABYG/OBYG)을 분리해 backfill.
    단지별 개별 try/except — 한 단지 실패가 배치 전체를 멈추지 않는다.
    enrich_complex_detail 이 정상 응답 시 detail_crawled_at 을 채운다.
    """
    db = SessionLocal()
    job = CrawlJob(
        job_type=f"complex_detail_{real_estate_type}",
        scheduler_job_id=scheduler_job_id,
        status="running",
        started_at=utcnow(),
    )
    db.add(job)
    db.commit()

    try:
        complex_nos = get_complexes_for_detail_enrich(db, real_estate_type, batch_size)
        job.total_items = len(complex_nos)
        db.commit()
        logger.info("단지 상세 backfill 시작: %s %d개 단지", real_estate_type, len(complex_nos))

        processed = 0
        failed = 0
        for i, complex_no in enumerate(complex_nos):
            _throttle_detail.wait()
            try:
                # enrich_complex_detail 은 API 실패 시 예외 대신 False 반환 —
                # 실패가 성공으로 집계되던 문제를 반환값으로 정확히 구분.
                if enrich_complex_detail(db, complex_no):
                    _throttle_detail.on_success()
                    processed += 1
                else:
                    failed += 1
            except Exception:
                db.rollback()
                _throttle_detail.on_rate_limit()
                failed += 1
                logger.exception("단지 상세 보강 개별 실패: complex %s", complex_no)
            if (i + 1) % 50 == 0:
                job.processed_items = processed
                db.commit()

        _finalize_job(
            db, job, "completed",
            processed_items=processed,
            completed_at=utcnow(),
        )
        db.commit()
        logger.info(
            "단지 상세 backfill 완료: %s 성공 %d / 실패 %d / 전체 %d",
            real_estate_type, processed, failed, len(complex_nos),
        )

    except Exception as e:
        try:
            db.rollback()
            _finalize_job(db, job, "failed", error_message=str(e)[:500], completed_at=utcnow())
            db.commit()
        except Exception:
            fail_job_safely(job.id, str(e))  # 연결 끊김 대비 새 세션 보장 (세션 266)
        logger.exception("단지 상세 backfill 실패: %s", real_estate_type)
    finally:
        NaverEstateAPI.clear_cache()
        db.close()
