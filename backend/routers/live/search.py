"""검색 라우트 — 키워드/지역 검색 + 매물 수 집계"""

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from fastapi import Depends, HTTPException, Query
from sqlalchemy.orm import Session

from db.database import SessionLocal
from db.models import Article as ArticleModel
from deps import get_db
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

    # 모든 그룹 실패 + 결과 0건이면 502
    if not all_complexes and first_error is not None:
        detail = first_error.get("error", "네이버 API 요청 실패") if first_error else "네이버 API 응답 없음"
        raise HTTPException(status_code=502, detail=str(detail))

    return all_complexes


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

    all_complexes = _search_all_types(q, allowed_types, db)
    response = _build_search_response(all_complexes, db)
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

    all_complexes = _search_all_types(
        keyword, allowed_types, db,
        upsert_kwargs={"sido": sido, "sigungu": sigungu, "dong": dong},
    )
    response = _build_search_response(all_complexes, db)
    _cache.set(cache_key, response)
    return response
