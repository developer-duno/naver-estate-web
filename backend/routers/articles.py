"""매물 관련 API 엔드포인트"""

import io
import logging
import re
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

# 엑셀 파일명 날짜 = 한국 사용자 기준 KST 고정 (환경 무관 — 서버 TZ 와 무관하게 KST).
# query_helpers.py 의 동명 상수와 동일 의도 (저장 아닌 한국 표시용 시각).
_KST = timezone(timedelta(hours=9))

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from auth.audit import log_action
from auth.permissions import check_quota
from auth.rate_limiter import _get_client_ip
from db import queries
from deps import get_approved_user, get_db, get_optional_user
from routers.serializers import article_to_dict, build_filter_dict
from services.naver_call_counter import record_call
from shared.constants import M2_TO_PYEONG
from shared.naver_api import NaverEstateAPI
from utils import format_acquisition_tax, format_broker_fee, format_date_ymd, format_parking_count

router = APIRouter()

MAX_EXPORT_ROWS = 5000


@router.get("/price-changes")
def get_price_changed_articles_endpoint(
    complex_no: str | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """최근 가격 변동 매물 조회"""
    articles = queries.get_price_changed_articles(db, complex_no, limit)
    return {
        "articles": [article_to_dict(a) for a in articles],
        "total": len(articles),
    }


@router.get("/{article_no}")
def get_article(
    article_no: str,
    db: Session = Depends(get_db),
):
    """매물 상세 조회 (DB 저장 데이터)"""
    article = queries.get_article_by_no(db, article_no)
    if not article:
        raise HTTPException(status_code=404, detail="매물을 찾을 수 없습니다")
    return article_to_dict(article)


@router.get("/{article_no}/price-history")
def get_article_price_history_endpoint(
    article_no: str,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """매물 가격 변동 이력 조회"""
    history = queries.get_article_price_history(db, article_no, limit)
    return {
        "article_no": article_no,
        "history": [
            {
                "price": h.price,
                "rent_price": h.rent_price,
                "recorded_at": h.recorded_at.isoformat() if h.recorded_at else None,
            }
            for h in history
        ],
    }


@router.get("/{article_no}/detail")
def get_article_realtime_detail(
    article_no: str,
    user: dict | None = Depends(get_optional_user),
):
    """매물 실시간 상세 조회 (네이버 API 직접 호출, 인증 필수)"""
    record_call("article_detail_realtime")
    detail_data = NaverEstateAPI.get_article_detail(article_no)
    if not detail_data:
        raise HTTPException(status_code=404, detail="매물 상세 정보를 찾을 수 없습니다")
    if "error" in detail_data:
        raise HTTPException(status_code=502, detail="네이버 API에서 상세 정보를 가져올 수 없습니다")
    return detail_data


@router.post("/export")
def export_articles_to_excel(
    complex_no: str,
    # 필터 (complexes.py의 get_complex_articles와 동일)
    trade_types: str | None = None,
    min_price: int | None = None,
    max_price: int | None = None,
    min_rent: int | None = None,
    max_rent: int | None = None,
    min_area_m2: float | None = None,
    max_area_m2: float | None = None,
    min_rooms: int | None = None,
    min_baths: int | None = None,
    direction: str | None = None,
    min_ppyeong: int | None = None,
    max_ppyeong: int | None = None,
    min_maintenance: int | None = None,
    max_maintenance: int | None = None,
    building_name: str | None = None,
    verified_only: bool = False,
    max_building_age: int | None = None,
    move_in_type: str | None = None,
    estate_type: str | None = None,
    min_floor: int | None = None,
    max_floor: int | None = None,
    tags: str | None = None,
    selected_articles: str | None = None,
    sort_by: str = "rank",  # export는 Literal 미적용 (프론트 FilterBar에서 선택지 제한)
    request: Request = None,
    db: Session = Depends(get_db),
    user: dict = Depends(get_approved_user),  # B2 게이트: 승인 중개사 전용 (가드3 흡수 — 비로그인 5000행 추출 봉합)
):
    """매물 목록 엑셀 다운로드 — 승인 중개사 전용 (쿼터 적용)"""
    # admin은 쿼터 무제한
    if user["role"] != "admin":
        check_quota(db, user["user_id"], "export", user["daily_export_quota"])
    # 감사 로그 IP: 위조 가능한 X-Forwarded-For 대신 CF-Connecting-IP 우선 (#339 정책 정렬)
    client_ip = _get_client_ip(request) if request else None
    log_action(db, user["user_id"], "export", "complex", complex_no, ip=client_ip)
    db.commit()
    filters = build_filter_dict(
        trade_types=trade_types, min_price=min_price, max_price=max_price,
        min_rent=min_rent, max_rent=max_rent,
        min_area_m2=min_area_m2, max_area_m2=max_area_m2,
        min_rooms=min_rooms, min_baths=min_baths, direction=direction,
        min_ppyeong=min_ppyeong, max_ppyeong=max_ppyeong,
        min_maintenance=min_maintenance, max_maintenance=max_maintenance,
        building_name=building_name, verified_only=verified_only,
        max_building_age=max_building_age, move_in_type=move_in_type,
        estate_type=estate_type,
        min_floor=min_floor, max_floor=max_floor, tags=tags,
    )

    articles, _ = queries.get_articles_by_complex(
        db, complex_no, filters=filters, sort_by=sort_by,
        page=1, page_size=MAX_EXPORT_ROWS,
    )

    # 선택된 매물만 필터링
    if selected_articles:
        selected_set = set(selected_articles.split(","))
        articles = [a for a in articles if a.article_no in selected_set]

    if not articles:
        raise HTTPException(status_code=404, detail="내보낼 매물이 없습니다")

    # 파일명용 단지명 조회
    complex_obj = queries.get_complex_by_no(db, complex_no)
    _complex_name = (complex_obj.complex_name if complex_obj else None) or articles[0].complex_name

    def _safe_excel(val: str) -> str:
        """엑셀 수식 인젝션 방어 — =, +, -, @, \\t, \\r 로 시작하는 문자열에 접두사 추가"""
        if isinstance(val, str) and val and val[0] in "=+@-\t\r":
            return "'" + val
        return val

    rows = []
    for art in articles:
        area_m2 = art.area2_m2 or art.area1_m2 or 0
        pyeong = round(area_m2 / M2_TO_PYEONG, 1) if area_m2 else 0

        if art.trade_type_name == "월세":
            price = f"{art.deal_or_warrant_prc or '-'} / {art.rent_prc or '-'}"
        else:
            price = art.deal_or_warrant_prc or "-"

        confirm = art.article_confirm_ymd or ""
        if confirm and len(confirm) == 8:
            confirm = f"{confirm[:4]}.{confirm[4:6]}.{confirm[6:8]}"

        rows.append({
            "매물번호": _safe_excel(art.article_no),
            "거래유형": art.trade_type_name or "",
            "단지명": _safe_excel(art.complex_name or (_complex_name or "")),
            "동": _safe_excel(art.building_name or ""),
            "층": art.floor_info or "",
            "가격": _safe_excel(price),
            "가격(만원)": art.numeric_price or "",
            "전용면적(m2)": area_m2,
            "전용면적(평)": pyeong,
            "평당가(만원)": art.price_per_pyeong or "",
            "방수": art.room_count or "",
            "욕실수": art.bathroom_count or "",
            "방향": art.direction or "",
            "입주가능일": format_date_ymd(art.move_in_date),
            "관리비(만원)": art.maintenance_cost or "",
            "난방방식": art.heating_type or "",
            "특징": _safe_excel(art.article_feature_desc or ""),
            "상세설명": _safe_excel(art.detail_description or ""),
            "태그": _safe_excel(", ".join(art.tags) if art.tags else ""),
            "중개사": _safe_excel(art.realtor_name or ""),
            "확인일자": confirm,
            "주차": format_parking_count(art.parking_count),
            "취득세": format_acquisition_tax(art.acquisition_tax),
            "중개보수": format_broker_fee(art.broker_fee),
            "주소": _safe_excel(art.jibun_address or ""),
            "매물유형": art.article_real_estate_type_name or "",
            "월세수익률(%)": (
                round((art.numeric_rent_price * 12) / art.numeric_price * 100, 2)
                if art.trade_type_name == "월세" and art.numeric_rent_price and art.numeric_price and art.numeric_price > 0
                else ""
            ),
            "전세가율(%)": (
                round(art.numeric_price / complex_obj.nearby_median_price * 100, 1)
                if art.trade_type_name == "전세" and art.numeric_price and complex_obj and complex_obj.nearby_median_price and complex_obj.nearby_median_price > 0
                else ""
            ),
        })

    try:
        df = pd.DataFrame(rows)
        buffer = io.BytesIO()
        with pd.ExcelWriter(buffer, engine="xlsxwriter") as writer:
            df.to_excel(writer, index=False, sheet_name="매물목록")
        buffer.seek(0)
    except Exception:
        logger.exception("엑셀 생성 실패: complex=%s articles=%d", complex_no, len(articles))
        raise HTTPException(status_code=500, detail="엑셀 파일 생성에 실패했습니다")

    # 엑셀 파일명 날짜 = 한국 사용자 기준 KST 고정 (모듈 상수 _KST, 환경 무관)
    timestamp = datetime.now(_KST).strftime("%Y%m%d_%H%M%S")
    raw_name = _complex_name or "매물"
    safe_name = re.sub(r'[^\w가-힣.\-]', '_', raw_name)[:50]
    filename = f"{safe_name}_{timestamp}.xlsx"

    logger.info("엑셀 내보내기 완료: complex=%s articles=%d user=%s", complex_no, len(articles), user["user_id"] if user else "anonymous")

    # RFC 5987: 한글 파일명은 UTF-8 percent-encoding 필요
    from urllib.parse import quote
    encoded_filename = quote(filename)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"},
    )


