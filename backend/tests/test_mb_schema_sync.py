"""mibunyang ORM ↔ serializer 동기화 가드 (CI 회귀).

목적: mibunyang 프로젝트가 같은 Supabase DB의 mb_* 테이블에 새 컬럼을 추가했을 때,
naver-estate 의 serializer(routers/mb_serializers.py)가 노출을 깜빡하면 CI 가 자동 감지한다.
사람이 매번 점검할 필요 없이 commit 마다 검증된다.

설계 (세션 258 적대검증 답습):
- 정규식 파싱 금지 — ast 파싱으로 serializer 함수가 반환 dict 에 넣은 키 + 인자에 접근한
  ORM 속성(x.attr)을 정확히 추출. (정규식은 TradeStats 13필드를 "누락"으로 오탐한 전례)
- information_schema 금지 — ORM `__table__.columns` 사용 (PostgreSQL/SQLite dialect 무관,
  domain-mapping-ssot.md 룰3 함정 회피).
- ALLOWLIST = 의도적 미노출(이름 변경/부모 응답 존재 등 false positive). 사유 명시.
- KNOWN_UNEXPOSED = 현재 진짜 미노출(노출 가치 미정). xfail 로 "예상된 누락" 표기 —
  리포트엔 XFAIL 로 드러나되 CI 파이프라인은 초록 유지(무관 PR 머지 안 막음). 노출 해결 시
  XPASS 로 바뀌어 "xfail 떼라" 신호.
- ALLOWLIST·KNOWN_UNEXPOSED 둘 다 없는 미지의 신규 컬럼 = hard fail (= 깜빡 누락 감지 본질).
"""

import ast
import inspect

import pytest

from db import mb_models
from routers import mb_serializers

# (ORM 모델명, serializer 함수명) 짝 — mb_serializers 12개 전부
MODEL_SERIALIZER_PAIRS = [
    ("Apartment", "apartment_to_dict"),
    ("UnsoldHistory", "unsold_history_to_dict"),
    ("MBRegion", "mb_region_to_dict"),
    ("MBTrade", "mb_trade_to_dict"),
    ("MBPrice", "mb_price_to_dict"),
    ("TradeStats", "trade_stats_to_dict"),
    ("Infra", "infra_to_dict"),
    ("School", "school_to_dict"),
    ("Transport", "transport_to_dict"),
    ("Builder", "builder_to_dict"),
    ("PresaleScheduleOfficial", "presale_schedule_to_dict"),
    ("ApplyhomeUnitSupply", "unit_supply_to_dict"),
]

# 의도적 미노출 (false positive 제외). 사유 명시 — 새 컬럼은 여기 없으면 가드가 잡는다.
ALLOWLIST: dict[str, set[str]] = {
    # latitude/longitude 로 이름 바꿔 노출됨 + created_at 은 생략(updated_at 만 노출, 설계 선택)
    "Apartment": {"lat", "lng", "created_at"},
    # apartment_id 는 부모 get_apartment_detail 응답에 이미 있어 부속 dict 엔 생략
    "Infra": {"apartment_id"},
    "School": {"apartment_id"},
    "Transport": {"apartment_id"},
    "TradeStats": {"apartment_id"},
    # fetched_at = 수집 메타(화면 가치 낮음). presale 일정은 모든 날짜 12종을 노출하므로 충분.
    "ApplyhomeUnitSupply": {"fetched_at"},
}

# 현재 진짜 미노출 — 노출 가치 없거나 노출 경로 부재라 xfail 로 "예상된 누락" 표기.
# 세션 259 에서 updated_at 5건(Infra/TradeStats/School/Transport/Builder) + MBPrice.recorded_at
# = "섹션별 데이터 신선도 표시 부재"(세션 258 감사 지적, medium) 해소로 노출 → 여기서 제거.
KNOWN_UNEXPOSED: dict[str, set[str]] = {
    "Apartment": {"balcony_value", "option_value"},  # 채움률 0% 빈칸 — 노출해도 항상 "-"
    "Infra": {"nearby_facilities"},  # JSON 복합시설 — 표시 UI 미설계(범위 밖)
    "MBTrade": {"recorded_at"},  # 실거래 region 단위 — 단지 상세 응답에 mb_trade_to_dict 미포함(노출 경로 없음)
    "Builder": {"corp_code"},  # 법인 고유번호 — 화면 가치 낮음(신용조회 미구현)
    # house_type (V040) — 이슈 #323 오피스텔 편입 최초 태스크(DB 컬럼만). 라우터 분기 노출은
    # 후속 태스크(Task 5) 범위. 노출 시 이 항목 제거 + serializer 추가.
    "PresaleScheduleOfficial": {"house_type"},
    "ApplyhomeUnitSupply": {"house_type"},
}


def _exposed_names(func) -> set[str]:
    """serializer 함수가 노출하는 ORM 속성 집합을 ast 로 정확히 추출.

    포착: (1) 반환 dict 의 "key" 문자열, (2) 인자에 접근한 속성 arg.attr (이름 변경 노출 포착).
    정규식이 아닌 ast 라 주석·문자열 리터럴 오탐 0.
    """
    tree = ast.parse(inspect.getsource(func))
    fn = tree.body[0]
    assert isinstance(fn, ast.FunctionDef)
    arg_name = fn.args.args[0].arg  # 단일 인자명 (a, u, r, ...)

    exposed: set[str] = set()
    for node in ast.walk(fn):
        # dict 키 문자열
        if isinstance(node, ast.Dict):
            for k in node.keys:
                if isinstance(k, ast.Constant) and isinstance(k.value, str):
                    exposed.add(k.value)
        # arg.attr 속성 접근 (예: a.latitude 가 lat 매핑 노출, recorded_at.isoformat())
        if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
            if node.value.id == arg_name:
                exposed.add(node.attr)
    return exposed


@pytest.mark.parametrize("model_name,serializer_name", MODEL_SERIALIZER_PAIRS)
def test_mb_serializer_exposes_all_orm_columns(model_name, serializer_name):
    """각 mb_* ORM 모델의 모든 컬럼이 serializer 로 노출되는지 검증.

    미지의 새 컬럼이 노출 누락되면 실패 → mb_serializers 에 추가하거나
    (안 쓸 것이면) ALLOWLIST/KNOWN_UNEXPOSED 에 사유와 함께 등록.
    """
    model = getattr(mb_models, model_name)
    func = getattr(mb_serializers, serializer_name)

    orm_cols = {c.key for c in model.__table__.columns}
    exposed = _exposed_names(func)
    allowed = ALLOWLIST.get(model_name, set())
    known = KNOWN_UNEXPOSED.get(model_name, set())

    missing = orm_cols - exposed - allowed - known

    assert not missing, (
        f"{model_name} ORM 에 새 컬럼 {sorted(missing)} 발견 — "
        f"routers/mb_serializers.{serializer_name} 에 노출 추가하거나, "
        f"안 쓸 것이면 test_mb_schema_sync 의 ALLOWLIST(영구 제외) 또는 "
        f"KNOWN_UNEXPOSED(노출 검토 대기) 에 사유와 함께 등록하세요."
    )


@pytest.mark.parametrize("model_name,serializer_name", MODEL_SERIALIZER_PAIRS)
def test_known_unexposed_still_unexposed(model_name, serializer_name):
    """KNOWN_UNEXPOSED 로 등록한 컬럼이 아직 미노출인지 확인 (xfail).

    노출이 해결되면 XPASS 로 바뀌어 "KNOWN_UNEXPOSED 에서 제거하라"는 신호가 된다.
    """
    known = KNOWN_UNEXPOSED.get(model_name, set())
    if not known:
        pytest.skip(f"{model_name}: KNOWN_UNEXPOSED 없음")

    func = getattr(mb_serializers, serializer_name)
    exposed = _exposed_names(func)
    still_unexposed = known - exposed

    pytest.xfail(
        f"{model_name} 미노출 컬럼 {sorted(still_unexposed)} — 노출 가치 검토 대기 "
        f"(세션 258). 노출 결정 시 serializer 추가 + KNOWN_UNEXPOSED 에서 제거."
    )


def test_presale_schedule_official_has_house_type_column():
    """V040 컬럼이 ORM에 매핑돼 있는지 — 마이그 누락 시 즉시 실패."""
    from db.mb_models import PresaleScheduleOfficial

    assert "house_type" in PresaleScheduleOfficial.__table__.columns


def test_applyhome_unit_supply_has_house_type_column():
    from db.mb_models import ApplyhomeUnitSupply

    assert "house_type" in ApplyhomeUnitSupply.__table__.columns


def test_rental_schedule_official_model_maps_expected_columns():
    from db.mb_models import RentalScheduleOfficial
    cols = set(RentalScheduleOfficial.__table__.columns.keys())
    assert {"house_manage_no", "house_nm", "recruit_date", "region_code"} <= cols


def test_rental_unit_supply_model_maps_expected_columns():
    from db.mb_models import RentalUnitSupply
    cols = set(RentalUnitSupply.__table__.columns.keys())
    assert {"house_manage_no", "model_no", "monthly_rent", "deposit"} <= cols
