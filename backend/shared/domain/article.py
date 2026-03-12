from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional
from shared.constants import M2_TO_PYEONG

# 향후 가격, 면적 등의 값 객체를 정의할 수 있습니다.
# 예:
# @dataclass(frozen=True)
# class Price:
#     value: int
#     currency: str = "KRW"

# @dataclass(frozen=True)
# class Area:
#     value_m2: float # 제곱미터
#
#     @property
#     def value_pyeong(self) -> float:
#         return round(self.value_m2 / M2_TO_PYEONG, 1)

@dataclass
class RealEstateArticle:
    """부동산 매물 정보를 나타내는 데이터 클래스"""
    article_no: str
    trade_type_name: str
    building_name: Optional[str] = None # 동
    floor_info: Optional[str] = None # 층
    deal_or_warrant_prc: Optional[str] = None # 매매가/전세가/보증금
    rent_prc: Optional[str] = None # 월세 (월세 매물인 경우)
    area1_m2: Optional[float] = None # 공급면적 (m²)
    area2_m2: Optional[float] = None # 전용면적 (m²)
    direction: Optional[str] = None # 방향
    article_feature_desc: Optional[str] = None # 특징
    tags: List[str] = field(default_factory=list) # 태그
    realtor_name: Optional[str] = None # 중개사명
    article_confirm_ymd: Optional[str] = None # 확인일자 (YYYYMMDD)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    
    # 추가적으로 API 응답에 있는 모든 유용한 필드를 포함할 수 있습니다.
    # 예: complex_name, article_name, etc.
    complex_name: Optional[str] = None # 단지명 (매물 정보에 포함된 경우)
    complex_no: Optional[str] = None # 단지번호 (complexNo)
    article_name: Optional[str] = None # 매물명 (전체 이름)
    realtor_id: Optional[str] = None
    realtor_phone: Optional[str] = None
    is_verified: bool = False # 검증매물 여부 등

    # 분양권 관련 필드
    article_real_estate_type_name: Optional[str] = None  # "아파트", "아파트분양권" 등
    is_presale: bool = False  # 분양권 여부

    # 상세 API에서 가져오는 추가 필드
    detail_description: Optional[str] = None  # 상세설명
    room_count: Optional[int] = None  # 방수
    bathroom_count: Optional[int] = None  # 욕실수
    move_in_date: Optional[str] = None  # 입주가능일
    maintenance_cost: Optional[str] = None  # 관리비 (만원)
    parking_count: Optional[str] = None  # 주차대수
    photo_urls: List[str] = field(default_factory=list)  # 매물 사진 URL
    representative_img_url: Optional[str] = None  # 대표이미지
    realtor_phone_display: Optional[str] = None  # 중개사 대표전화
    realtor_address: Optional[str] = None  # 중개사 주소
    acquisition_tax: Optional[str] = None  # 취득세
    broker_fee: Optional[str] = None  # 중개보수
    heating_type: Optional[str] = None  # 난방방식
    total_floor_count: Optional[int] = None  # 총층수
    jibun_address: Optional[str] = None  # 지번주소
    use_approve_ymd: Optional[str] = None  # 사용승인일


    @property
    def display_trade_type(self) -> str:
        """표시용 거래유형."""
        return self.trade_type_name

    @property
    def formatted_price(self) -> str:
        """표시용 가격 문자열 (예: 10억 5,000 / 50)"""
        if self.trade_type_name == "월세":
            return f"{self.deal_or_warrant_prc or '-'} / {self.rent_prc or '-'}"
        return self.deal_or_warrant_prc or "-"

    @property
    def formatted_area_m2_pyeong(self) -> str:
        """표시용 면적 문자열 (예: 84.98㎡ (25.7평))"""
        if self.area2_m2:
            pyeong = round(self.area2_m2 / M2_TO_PYEONG, 1)
            return f"{self.area2_m2}㎡ ({pyeong}평)"
        if self.area1_m2: # 전용면적이 없을 경우 공급면적이라도 표시
            pyeong = round(self.area1_m2 / M2_TO_PYEONG, 1)
            return f"{self.area1_m2}㎡ ({pyeong}평) (공급)"
        return "-"

    @property
    def formatted_confirm_date(self) -> str:
        """표시용 확인일자 (예: 23.12.25)"""
        if self.article_confirm_ymd and len(self.article_confirm_ymd) == 8:
            try:
                dt_obj = datetime.strptime(self.article_confirm_ymd, '%Y%m%d')
                return dt_obj.strftime('%y.%m.%d')
            except ValueError:
                return "-"
        return "-"
        
    @property
    def naver_map_url(self) -> Optional[str]:
        """nmap:// 딥링크 (모바일 네이버 지도 앱)"""
        if self.latitude and self.longitude:
            from urllib.parse import quote
            title = self.article_name or self.complex_name or ""
            return f"nmap://place?lat={self.latitude}&lng={self.longitude}&name={quote(title)}&appname=naver_estate"
        return None

    @property
    def naver_map_web_url(self) -> Optional[str]:
        """웹 네이버 지도 URL (fallback)"""
        if self.latitude and self.longitude:
            from urllib.parse import quote
            title = self.article_name or self.complex_name or ""
            return f"https://map.naver.com/p?lat={self.latitude}&lng={self.longitude}&title={quote(title)}"
        return None

    @property
    def building_age_years(self) -> Optional[int]:
        """준공 후 경과 연수. use_approve_ymd 기반."""
        if self.use_approve_ymd and len(self.use_approve_ymd) >= 4:
            try:
                year = int(self.use_approve_ymd[:4])
                return datetime.now().year - year
            except ValueError:
                pass
        return None

    @property
    def formatted_rooms(self) -> str:
        """방/욕실 표시 (예: 3/2)"""
        if self.room_count is not None and self.bathroom_count is not None:
            return f"{self.room_count}/{self.bathroom_count}"
        if self.room_count is not None:
            return f"{self.room_count}/-"
        return "-"

    @property
    def formatted_maintenance_cost(self) -> str:
        """관리비 표시"""
        if self.maintenance_cost:
            return f"{self.maintenance_cost}만원"
        return "-"

    @property
    def formatted_move_in_date(self) -> str:
        """입주가능일 표시"""
        if self.move_in_date:
            if len(self.move_in_date) == 8:
                try:
                    dt_obj = datetime.strptime(self.move_in_date, '%Y%m%d')
                    return dt_obj.strftime('%y.%m.%d')
                except ValueError:
                    pass
            return self.move_in_date
        return "-"

    def update_from_detail(self, detail_data: dict):
        """상세 API 응답에서 필드 업데이트"""
        ad = detail_data.get("articleDetail", {})
        aa = detail_data.get("articleAddition", {})
        ar = detail_data.get("articleRealtor", {})
        at = detail_data.get("articleTax", {})
        photos = detail_data.get("articlePhotos", [])

        if ad:
            self.detail_description = ad.get("detailDescription") or ad.get("articleFeatureDescription")
            room = ad.get("roomCount")
            if room is not None:
                try:
                    self.room_count = int(room)
                except (ValueError, TypeError):
                    pass
            bath = ad.get("bathroomCount")
            if bath is not None:
                try:
                    self.bathroom_count = int(bath)
                except (ValueError, TypeError):
                    pass
            self.move_in_date = ad.get("moveInPossibleYmd")
            mc = ad.get("maintenanceCost")
            if mc is not None and isinstance(mc, (int, float, str)):
                self.maintenance_cost = str(mc)  # 0도 "0"으로 저장
            pc = ad.get("aptParkingCount") or ad.get("parkingCount")
            if pc is not None and isinstance(pc, (int, float, str)):
                self.parking_count = str(pc)
            self.heating_type = ad.get("heatingTypeName")
            tfc = ad.get("totalFloorCount")
            if tfc is not None:
                try:
                    self.total_floor_count = int(tfc)
                except (ValueError, TypeError):
                    pass
            self.jibun_address = ad.get("jibunAddress")
            self.use_approve_ymd = ad.get("useApproveYmd") or self.use_approve_ymd

        if aa:
            self.representative_img_url = aa.get("representativeImgUrl")

        if ar:
            self.realtor_phone_display = ar.get("representativeTelNo") or ar.get("cellPhoneNo")
            self.realtor_address = ar.get("address")

        if at:
            acq = at.get("acquisitionTax")
            if acq is not None:
                self.acquisition_tax = str(acq)
            bf = at.get("brokerFee")
            if bf is not None:
                self.broker_fee = str(bf)

        if photos:
            self.photo_urls = [p.get("imageSrc") for p in photos if isinstance(p, dict) and p.get("imageSrc")]

    @staticmethod
    def _parse_price_str(price_str: Optional[str]) -> int:
        """가격 문자열을 만원 단위 정수로 변환.
        예: '2억 5,000' -> 25000, '5000' -> 5000, '2억' -> 20000
        """
        if not price_str:
            return 0
        price_str = price_str.replace(',', '').replace(' ', '').replace('만원', '').replace('만', '')
        num = 0
        if '억' in price_str:
            parts = price_str.split('억', 1)
            try:
                num += int(parts[0]) * 10000
            except ValueError:
                return 0
            remainder = parts[1].strip() if len(parts) > 1 else ''
            if remainder:
                try:
                    num += int(remainder)
                except ValueError:
                    pass
        else:
            try:
                num = int(price_str)
            except ValueError:
                return 0
        return num

    @property
    def numeric_price(self) -> int:
        """정렬을 위한 숫자 가격 (단위: 만원). 월세는 보증금 기준."""
        return self._parse_price_str(self.deal_or_warrant_prc)

    @property
    def numeric_rent_price(self) -> int:
        """월세액의 숫자 가격 (단위: 만원)."""
        return self._parse_price_str(self.rent_prc)

    @property
    def price_per_pyeong(self) -> Optional[int]:
        """평당가 (만원/평). 전용면적 기준."""
        if self.area2_m2 and self.area2_m2 > 0:
            pyeong = self.area2_m2 / M2_TO_PYEONG
            price = self.numeric_price
            if price > 0:
                return round(price / pyeong)
        return None

    @classmethod
    def from_dict(cls, data: dict) -> "RealEstateArticle":
        """API 응답 딕셔너리로부터 RealEstateArticle 객체를 생성합니다."""
        
        # API 필드명과 클래스 속성명을 매핑합니다.
        # API 응답의 area1, area2는 문자열일 수 있으므로 float으로 변환 시도
        area1 = data.get("area1")
        area2 = data.get("area2")
        try:
            area1_m2 = float(area1) if area1 else None
        except ValueError:
            area1_m2 = None # 또는 기본값 처리

        try:
            area2_m2 = float(area2) if area2 else None
        except ValueError:
            area2_m2 = None

        lat = data.get("latitude")
        lng = data.get("longitude")
        try:
            latitude = float(lat) if lat else None
            longitude = float(lng) if lng else None
        except ValueError:
            latitude = None
            longitude = None
            
        return cls(
            article_no=str(data.get("articleNo", "")),
            trade_type_name=data.get("tradeTypeName", ""),
            building_name=data.get("buildingName"),
            floor_info=data.get("floorInfo"),
            deal_or_warrant_prc=data.get("dealOrWarrantPrc"),
            rent_prc=data.get("rentPrc"),
            area1_m2=area1_m2,
            area2_m2=area2_m2,
            direction=data.get("direction"),
            article_feature_desc=data.get("articleFeatureDesc"),
            tags=data.get("tagList", []),
            realtor_name=data.get("realtorName"),
            article_confirm_ymd=data.get("articleConfirmYmd"),
            latitude=latitude,
            longitude=longitude,
            complex_name=data.get("complexName"),
            complex_no=str(data.get("complexNo")) if data.get("complexNo") else None,
            article_name=data.get("articleName"),
            realtor_id=data.get("realtorId"),
            realtor_phone=data.get("realtorPhone"),
            is_verified=data.get("isVerified", False),
            article_real_estate_type_name=data.get("realEstateTypeName") or data.get("articleRealEstateTypeName"),
            is_presale="분양권" in (data.get("realEstateTypeName") or data.get("articleRealEstateTypeName") or ""),
        ) 