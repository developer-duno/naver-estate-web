"""검색 라우트 — 키워드/지역 검색 + 매물 수 집계

네이버 쿨다운(429 장시간 지속) 시에도 사이트 검색이 죽지 않도록
DB 폴백 경로를 내장. _search_all_types 가 모든 그룹 실패로 502 를
던지면 상위 엔드포인트가 DB 단지 검색으로 전환해 200 응답 유지.
"""

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from fastapi import Depends, HTTPException, Query
from sqlalchemy.orm import Session

from db.complex_queries import get_complexes_by_region, search_complexes
from db.database import SessionLocal
from db.models import Article as ArticleModel
from deps import get_db
from routers.estate_serializers import complex_to_dict
from services.naver_call_counter import record_call
from services.upsert import upsert_complex_from_search
from shared.naver_api import NaverEstateAPI

from ._shared import (
    CRAWL_REAL_ESTATE_TYPES,
    INTER_PAGE_DELAY,
    KEYWORD_SUFFIX_GROUPS,
    MAX_SEARCH_PAGES,
    _cache,
    router,
)

logger = logging.getLogger(__name__)


def _db_fallback_response(
    complexes: list, db: Session, source: str = "db_fallback",
) -> dict:
    """네이버 실패 시 DB 단지로 검색 응답 구성 — 서비스 연명용."""
    dicts = [complex_to_dict(c) for c in complexes]
    response = _build_search_response(dicts, db)
    response["source"] = source
    response["notice"] = (
        "네이버 실시간 검색이 일시적으로 지연되어 저장된 단지 데이터로 표시합니다."
    )
    return response


def _parse_allowed_types(types: str | None) -> set[str]:
    """types 쿼리 파라미터를 허용 유형 set으로 변환"""
    if types and types.strip():
        return set(t.strip() for t in types.split(",") if t.strip()) & CRAWL_REAL_ESTATE_TYPES
    return set(CRAWL_REAL_ESTATE_TYPES)


def _search_one_group(keyword: str, suffix: str | None, group_codes: set[str],
                      allowed_types: set[str], upsert_kwargs: dict | None = None
                      ) -> tuple[list[dict], dict | None]:
    """단일 그룹 검색 (스레드 안전 — 자체 DB 세션 사용)"""
    complexes: list[dict] = []
    first_error = None
    search_keyword = f"{keyword} {suffix}" if suffix else keyword

    db = SessionLocal()
    try:
        page = 1
        while page <= MAX_SEARCH_PAGES:
            record_call("search")
            result = NaverEstateAPI.search_by_keyword(search_keyword, page=page)
            if not result or "error" in result:
                if page == 1 and first_error is None:
                    first_error = result
                break

            complex_list = result.get("complexes") or result.get("complexList") or []
            if not complex_list:
                break

            for c_data in complex_list:
                re_type = c_data.get("realEstateTypeCode", "")
                if not re_type or re_type not in allowed_types:
                    continue
                cpx = upsert_complex_from_search(db, c_data, **(upsert_kwargs or {}))
                if cpx:
                    complexes.append(cpx)

            if not result.get("isMoreData", False):
                break
            page += 1
            time.sleep(INTER_PAGE_DELAY)
    finally:
        db.close()

    return complexes, first_error


def _search_all_types(keyword: str, allowed_types: set[str], db: Session,
                      upsert_kwargs: dict | None = None):
    """매물유형 그룹별 네이버 API 검색 → upsert → 결과 병합

    dialect-aware 실행:
    - PostgreSQL(prod): ThreadPoolExecutor 병렬 호출
    - SQLite(CI): 순차 실행 (동시 쓰기 불안정 방지)
    """
    # 실행할 그룹 필터링
    groups_to_search = [
        (suffix, group_codes)
        for suffix, group_codes in KEYWORD_SUFFIX_GROUPS
        if group_codes & allowed_types
    ]

    if not groups_to_search:
        return []

    all_complexes: list[dict] = []
    seen: set[str] = set()
    first_error = None

    # dialect 감지 — SQLite는 동시 쓰기 불안정 → 순차 실행
    dialect = db.bind.dialect.name if db.bind else "postgresql"

    if dialect == "sqlite":
        logger.info("SQLite dialect — 순차 검색 모드 (%d그룹)", len(groups_to_search))
        for suffix, group_codes in groups_to_search:
            complexes, error = _search_one_group(
                keyword, suffix, group_codes, allowed_types, upsert_kwargs,
            )
            if error and first_error is None:
                first_error = error
            for cpx in complexes:
                if cpx["complex_no"] not in seen:
                    seen.add(cpx["complex_no"])
                    all_complexes.append(cpx)
    else:
        # PostgreSQL: 그룹별 병렬 호출
        with ThreadPoolExecutor(max_workers=len(groups_to_search)) as executor:
            futures = {
                executor.submit(
                    _search_one_group, keyword, suffix, group_codes,
                    allowed_types, upsert_kwargs,
                ): (suffix, group_codes)
                for suffix, group_codes in groups_to_search
            }
            for future in as_completed(futures):
                complexes, error = future.result()
                if error and first_error is None:
                    first_error = error
                for cpx in complexes:
                    if cpx["complex_no"] not in seen:
                        seen.add(cpx["complex_no"])
                        all_complexes.append(cpx)

    # 모든 그룹 실패 + 결과 0건이면 502 (상위 라우터가 DB 폴백으로 전환)
    if not all_complexes and first_error is not None:
        detail = first_error.get("error", "네이버 API 요청 실패") if first_error else "네이버 API 응답 없음"
        raise HTTPException(status_code=502, detail=str(detail))

    return all_complexes


# 네이버 검색 wall-clock timeout (초). 이 시간 안에 결과 못 받으면 DB 폴백.
# 쿨다운(429 반복)·네트워크 지연 둘 다 이 가드로 막음.
NAVER_SEARCH_WALL_TIMEOUT = 15.0


def _search_with_fallback(
    *, keyword: str, allowed_types: set[str], db: Session,
    upsert_kwargs: dict | None = None,
    fallback: callable,
) -> dict:
    """네이버 호출 → 실패/지연 시 DB 폴백. 응답 반환.

    fallback: () -> list[Complex]  — DB 단지 조회 클로저

    네이버가 NAVER_SEARCH_WALL_TIMEOUT 안에 응답하지 않으면(쿨다운 중 재시도
    지연 등) 폴백으로 전환. 네이버 호출 스레드는 백그라운드에서 계속 진행
    되지만 사용자 응답은 즉시 반환.
    """
    import concurrent.futures as cf

    executor = cf.ThreadPoolExecutor(max_workers=1)
    future = executor.submit(
        _search_all_types, keyword, allowed_types, db, upsert_kwargs,
    )
    try:
        all_complexes = future.result(timeout=NAVER_SEARCH_WALL_TIMEOUT)
        executor.shutdown(wait=False)
        return _build_search_response(all_complexes, db)
    except cf.TimeoutError:
        logger.warning(
            "naver search wall-clock %ss 초과 — DB 폴백으로 전환 (keyword=%s)",
            NAVER_SEARCH_WALL_TIMEOUT, keyword,
        )
        # 백그라운드 스레드는 계속 돌되 응답은 즉시 반환
        executor.shutdown(wait=False)
    except HTTPException as e:
        executor.shutdown(wait=False)
        if e.status_code != 502:
            raise
        logger.warning(
            "naver search 실패(%s) — DB 폴백으로 전환 (keyword=%s)",
            e.detail, keyword,
        )
    except Exception as e:  # noqa: BLE001 — 네트워크 예외도 폴백
        executor.shutdown(wait=False)
        logger.warning(
            "naver search 예외(%s) — DB 폴백으로 전환 (keyword=%s)",
            type(e).__name__, keyword,
        )

    db_complexes = fallback()
    if not db_complexes:
        # 폴백도 비었으면 원래 에러로 502
        raise HTTPException(
            status_code=502,
            detail="네이버 검색 실패 + 저장된 데이터도 없습니다",
        )
    return _db_fallback_response(db_complexes, db)


def _get_article_counts(db: Session, complex_nos: list[str]) -> dict[str, int]:
    """Get active article counts per complex"""
    if not complex_nos:
        return {}
    from sqlalchemy import func
    rows = (
        db.query(ArticleModel.complex_no, func.count(ArticleModel.article_no))
        .filter(ArticleModel.complex_no.in_(complex_nos), ArticleModel.is_active == True)
        .group_by(ArticleModel.complex_no)
        .all()
    )
    return {r[0]: r[1] for r in rows}


def _build_search_response(all_complexes: list[dict], db: Session) -> dict:
    """검색 결과에 매물 수 추가"""
    complex_nos = [c["complex_no"] for c in all_complexes]
    counts = _get_article_counts(db, complex_nos)
    return {
        "complexes": [
            {**c, "article_count": counts.get(c["complex_no"], 0)}
            for c in all_complexes
        ],
        "total": len(all_complexes),
    }


@router.get("/search")
def live_search(
    q: str = Query(..., min_length=1, max_length=100, description="Search keyword"),
    types: str = Query(None, max_length=100, description="매물유형 코드 (쉼표 구분: APT,OPST,JGC 등)"),
    db: Session = Depends(get_db),
):
    """Live keyword search - Naver API -> DB upsert -> return"""
    allowed_types = _parse_allowed_types(types)
    cache_key = f"search:{q}:{','.join(sorted(allowed_types))}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    response = _search_with_fallback(
        keyword=q, allowed_types=allowed_types, db=db,
        fallback=lambda: search_complexes(db, q, limit=50),
    )
    # DB 폴백이면 짧게만 캐시 (네이버 복구 시 빠른 전환)
    if response.get("source") != "db_fallback":
        _cache.set(cache_key, response)
    return response


@router.get("/region")
def live_region(
    sido: str = Query(...),
    sigungu: str = Query(None),
    dong: str = Query(None),
    types: str = Query(None, max_length=100, description="매물유형 코드 (쉼표 구분: APT,OPST,JGC 등)"),
    db: Session = Depends(get_db),
):
    """Live region search - Naver API -> DB upsert -> return"""
    allowed_types = _parse_allowed_types(types)
    cache_key = f"region:{sido}:{sigungu}:{dong}:{','.join(sorted(allowed_types))}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    keyword = sido
    if sigungu and sigungu != sido:
        keyword += f" {sigungu}"
    if dong:
        keyword += f" {dong}"

    response = _search_with_fallback(
        keyword=keyword, allowed_types=allowed_types, db=db,
        upsert_kwargs={"sido": sido, "sigungu": sigungu, "dong": dong},
        fallback=lambda: get_complexes_by_region(db, sido, sigungu, dong, limit=500),
    )
    if response.get("source") != "db_fallback":
        _cache.set(cache_key, response)
    return response
