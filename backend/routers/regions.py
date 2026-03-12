"""지역 정보 API 엔드포인트"""

from fastapi import APIRouter, HTTPException

from shared.constants import KOREA_REGIONS

router = APIRouter()


@router.get("/regions")
def get_regions():
    """전국 시도/시군구/동 목록"""
    return KOREA_REGIONS


@router.get("/regions/{sido}")
def get_sigungu_list(sido: str):
    """시도 내 시군구 목록"""
    sigungu_dict = KOREA_REGIONS.get(sido)
    if not sigungu_dict:
        raise HTTPException(status_code=404, detail=f"'{sido}' 시도를 찾을 수 없습니다")
    return {"sido": sido, "sigungu_list": list(sigungu_dict.keys())}


@router.get("/regions/{sido}/{sigungu}")
def get_dong_list(sido: str, sigungu: str):
    """시군구 내 동 목록"""
    sigungu_dict = KOREA_REGIONS.get(sido, {})
    dong_list = sigungu_dict.get(sigungu)
    if dong_list is None:
        raise HTTPException(status_code=404, detail=f"'{sido} {sigungu}'를 찾을 수 없습니다")
    return {"sido": sido, "sigungu": sigungu, "dong_list": dong_list}
