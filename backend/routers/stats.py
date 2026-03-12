"""통계 API 엔드포인트"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from deps import get_db
from db import queries

router = APIRouter()


@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    """DB 통계 (홈페이지용)"""
    return queries.get_db_stats(db)
