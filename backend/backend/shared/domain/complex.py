from dataclasses import dataclass, field
from typing import List, Optional
from datetime import datetime
from shared.domain.article import RealEstateArticle

@dataclass
class RealEstateComplex:
    """부동산 단지 정보를 나타내는 데이터 클래스"""
    complex_no: str
    complex_name: str
    cortar_no: Optional[str] = None # 법정동 코드
    real_estate_type_code: Optional[str] = None # APT, JGC 등
    real_estate_type_name: Optional[str] = None # 아파트, 재건축 등
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    total_household_count: Optional[int] = None
    high_floor: Optional[int] = None
    low_floor: Optional[int] = None
    use_approve_ymd: Optional[str] = None # 준공일 (YYYYMMDD)
    total_dong_count: Optional[int] = None
    min_supply_area_m2: Optional[float] = None # 최소 공급면적
    max_supply_area_m2: Optional[float] = None # 최대 공급면적
    cortar_address: Optional[str] = None # 주소
    
    articles: List[RealEstateArticle] = field(default_factory=list) # 해당 단지의 매물 리스트

    @property
    def formatted_use_approve_date(self) -> str:
        """표시용 준공일 (예: 2020.09.28)"""
        if self.use_approve_ymd and len(self.use_approve_ymd) >= 8:
            try:
                # YYYYMMDD 또는 YYYYMM 형식 모두 처리 시도
                if len(self.use_approve_ymd) == 8:
                    dt_obj = datetime.strptime(self.use_approve_ymd, '%Y%m%d')
                    return dt_obj.strftime('%Y.%m.%d')
                elif len(self.use_approve_ymd) == 6: # YYYYMM
                    dt_obj = datetime.strptime(self.use_approve_ymd, '%Y%m')
                    return dt_obj.strftime('%Y.%m')
            except ValueError:
                return self.use_approve_ymd # 원본 반환
        return self.use_approve_ymd or "-"

    @classmethod
    def from_dict(cls, data: dict, articles_data: Optional[List[dict]] = None,
                  article_objects: Optional[List[RealEstateArticle]] = None) -> "RealEstateComplex":
        """API 응답 딕셔너리로부터 RealEstateComplex 객체를 생성합니다.
           article_objects가 있으면 그대로 사용하고, 없으면 articles_data에서 생성합니다.
        """
        # 타입 변환 시도
        lat = data.get("latitude")
        lng = data.get("longitude")
        try:
            latitude = float(lat) if lat else None
            longitude = float(lng) if lng else None
        except ValueError:
            latitude = None
            longitude = None
        
        min_area = data.get("minSupplyArea") # API 응답 필드명 확인 필요
        max_area = data.get("maxSupplyArea")
        try:
            min_supply_area_m2 = float(min_area) if min_area else None
            max_supply_area_m2 = float(max_area) if max_area else None
        except ValueError:
            min_supply_area_m2 = None
            max_supply_area_m2 = None

        # totalHouseholdCount, highFloor 등은 정수형으로 변환
        total_household_count = data.get("totalHouseholdCount")
        high_floor = data.get("highFloor")
        low_floor = data.get("lowFloor")
        total_dong_count = data.get("totalDongCount")

        instance = cls(
            complex_no=str(data.get("complexNo", "")),
            complex_name=data.get("complexName", ""),
            cortar_no=data.get("cortarNo"),
            real_estate_type_code=data.get("realEstateTypeCode"),
            real_estate_type_name=data.get("realEstateTypeName"),
            latitude=latitude,
            longitude=longitude,
            total_household_count=int(total_household_count) if total_household_count else None,
            high_floor=int(high_floor) if high_floor else None,
            low_floor=int(low_floor) if low_floor else None,
            use_approve_ymd=data.get("useApproveYmd"),
            total_dong_count=int(total_dong_count) if total_dong_count else None,
            min_supply_area_m2=min_supply_area_m2,
            max_supply_area_m2=max_supply_area_m2,
            cortar_address=data.get("cortarAddress"),
            articles=[] # 초기에는 비어있는 리스트
        )

        if article_objects:
            instance.articles = article_objects
        elif articles_data:
            instance.articles = [RealEstateArticle.from_dict(article_data) for article_data in articles_data]

        # 각 매물에 단지번호 및 분양권 타입 설정
        is_presale_complex = instance.real_estate_type_code in ("ABYG", "PRE")
        for art in instance.articles:
            if not art.complex_no:
                art.complex_no = instance.complex_no
            # 단지 타입이 분양권이면 소속 매물도 분양권으로 설정
            if is_presale_complex and not art.is_presale:
                art.is_presale = True
                if not art.article_real_estate_type_name:
                    art.article_real_estate_type_name = instance.real_estate_type_name

        return instance