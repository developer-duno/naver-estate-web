"""검색엔진용 지역 페이지 자료 — 시군구 허브·동 페이지 (세션 483 PR 3a · 결정 19·20 · 설계 v2 O9).

⚠ main.py 에서 routers/regions.py 보다 **먼저** 등록한다 — 그쪽 `/regions/{sido}/{sigungu}` 가
`/regions/30200/hub` 와 모양이 같아 먼저 잡히면 404 가 된다(세션 483 ② 실측).
인증 없음. 200 에만 `public, max-age=3600`(main.py 미들웨어의 /api/regions 86400 을 덮지 않게 라우트에서 직접).
"""

import re

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from deps import get_db
from services.public_pages import dong_page, region_hub

router = APIRouter()

_PUBLIC_CACHE = "public, max-age=3600"
_SIGUNGU5 = re.compile(r"\d{5}")
_DONG10 = re.compile(r"\d{10}")


@router.get("/regions/{sigungu5}/hub")
def get_region_hub(sigungu5: str, response: Response, db: Session = Depends(get_db)):
    """시군구 허브 — 이름·부동산원 지역 추이 24개월·동별 단지 목록(C 단지 포함). 없는 코드·단지 0 = 404."""
    if not _SIGUNGU5.fullmatch(sigungu5):
        raise HTTPException(status_code=404, detail="지역을 찾을 수 없습니다")
    result = region_hub(db, sigungu5)
    if result is None:
        raise HTTPException(status_code=404, detail="지역을 찾을 수 없습니다")
    response.headers["Cache-Control"] = _PUBLIC_CACHE
    return result


@router.get("/regions/{sigungu5}/dongs/{dong10}")
def get_dong_page(sigungu5: str, dong10: str, response: Response, db: Session = Depends(get_db)):
    """동 페이지 — 자료 있는 단지(A·B) 10곳 이상인 법정동만. 시작이 안 맞음·10곳 미만 = 404."""
    if not _SIGUNGU5.fullmatch(sigungu5) or not _DONG10.fullmatch(dong10):
        raise HTTPException(status_code=404, detail="동을 찾을 수 없습니다")
    result = dong_page(db, sigungu5, dong10)
    if result is None:
        raise HTTPException(status_code=404, detail="동을 찾을 수 없습니다")
    response.headers["Cache-Control"] = _PUBLIC_CACHE
    return result
