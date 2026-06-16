"""mibunyang 분양/경쟁률 API 회귀 가드 (세션 314 신설).

워크플로 wf_0ed0ffe6 적대검증 확증 결함 회귀:
- 분류 dead string("민간임대" 0매칭) + 6종 silent 누락
- recruit_date_desc 정렬이 presale_move_in('미정' 혼재 Text)로 솟음
- get_unit_supplies model_no Text 사전순 역전
- 5 신규함수 테스트 0건 (testing.md 위반)
"""

from datetime import date, datetime

from db.mb_apartment_queries import (
    PRIVATE_TYPES,
    PUBLIC_TYPES,
    get_competition_page,
    get_presale_page,
    get_presale_schedules,
    get_unit_supplies,
)
from db.mb_models import (
    Apartment,
    ApplyhomeUnitSupply,
    PresaleScheduleOfficial,
)
from routers.mb_serializers import (
    SPECIAL_TYPE_LABELS,
    presale_summary,
    unit_supply_to_dict,
)

# prod 실측 11종 (세션 314) — partition 가드의 ground truth.
# 신규 유형 추가 시 본 리스트 + PRIVATE/PUBLIC_TYPES 동시 갱신 강제.
PROD_PRESALE_TYPES_11 = [
    "민간분양",
    "국민임대",
    "시프트(장기전세)",
    "민간임대시행자임의",
    "공공분양",
    "행복주택",
    "공공지원민간임대",
    "장기민간임대",
    "영구임대",
    "공공임대6년",
    "공공임대5년",
]


def _add_apt(db, id_, name="단지", region="서울", **kw):
    a = Apartment(id=id_, name=name, region=region, **kw)
    db.add(a)
    db.commit()
    return a


def _add_schedule(db, apartment_id, house_manage_no, recruit_date=None, **kw):
    s = PresaleScheduleOfficial(
        apartment_id=apartment_id,
        house_manage_no=house_manage_no,
        recruit_date=recruit_date,
        **kw,
    )
    db.add(s)
    db.commit()
    return s


def _add_unit(db, apartment_id, house_manage_no, model_no, **kw):
    u = ApplyhomeUnitSupply(
        apartment_id=apartment_id,
        house_manage_no=house_manage_no,
        model_no=model_no,
        **kw,
    )
    db.add(u)
    db.commit()
    return u


# ── 분류 정책 가드 (dead string + partition) ──────────────────


def test_classification_partition_covers_all_11_types_exactly_once():
    """prod 11종 각각이 PRIVATE∪PUBLIC 에 정확히 1번 (중복 0 · 누락 0)."""
    union = PRIVATE_TYPES + PUBLIC_TYPES
    # 중복 0
    assert len(union) == len(set(union)), "PRIVATE/PUBLIC 교집합 존재 (중복 분류)"
    # 11종 전부 덮음 (누락 0) — 신규 유형 추가 시 이 단언이 깨져 자동 검출
    for t in PROD_PRESALE_TYPES_11:
        assert t in union, f"presale_type '{t}' 가 어느 그룹에도 없음 (silent 누락)"
    # 역방향: 분류 리스트에 prod 에 없는 유령 값 없음
    for t in union:
        assert t in PROD_PRESALE_TYPES_11, f"분류에 prod 부재 dead string '{t}'"


def test_dead_string_minganimdae_absent():
    """옛 dead string '민간임대'(prod 0매칭) 가 어느 리스트에도 없어야."""
    assert "민간임대" not in PUBLIC_TYPES
    assert "민간임대" not in PRIVATE_TYPES
    # 실제값은 '민간임대시행자임의' — private 에 존재
    assert "민간임대시행자임의" in PRIVATE_TYPES


def test_classification_exact_string_preservation():
    """문자열 정확 보존 — '시프트(장기전세)' 반각괄호 등 1글자 오타도 71건 누락."""
    assert "시프트(장기전세)" in PUBLIC_TYPES
    # 반각 괄호 U+0028/U+0029 확인 (전각 （） 아님)
    sipt = next(t for t in PUBLIC_TYPES if t.startswith("시프트"))
    assert "(" in sipt and ")" in sipt
    assert "（" not in sipt and "）" not in sipt


def test_get_presale_private_matches_real_value(db):
    """'민간임대시행자임의' 단지가 private 에 매칭 (dead string 이었으면 0건)."""
    _add_apt(db, "P1", presale_type="민간임대시행자임의", presale_min_price=5000)
    _add_apt(db, "P2", presale_type="공공분양", presale_min_price=4000)
    items, total = get_presale_page(db, presale_type="private")
    ids = {a.id for a in items}
    assert "P1" in ids
    assert "P2" not in ids
    assert total == 1


def test_get_presale_public_recovers_6_missing_types(db):
    """옛 누락 6종 중 '행복주택'·'영구임대' 가 public 에 잡힘 (누락 복구 검증)."""
    _add_apt(db, "PUB1", presale_type="행복주택")
    _add_apt(db, "PUB2", presale_type="영구임대")
    _add_apt(db, "PRIV1", presale_type="민간분양")
    items, total = get_presale_page(db, presale_type="public")
    ids = {a.id for a in items}
    assert ids == {"PUB1", "PUB2"}
    assert total == 2


def test_get_presale_all_includes_every_non_null(db):
    """all 은 presale_type 있는 전체 (None 제외)."""
    _add_apt(db, "A1", presale_type="민간분양")
    _add_apt(db, "A2", presale_type="공공분양")
    _add_apt(db, "A3", presale_type=None)
    items, total = get_presale_page(db, presale_type="all")
    assert total == 2
    assert "A3" not in {a.id for a in items}


# ── 정렬 가드 (recruit_date_desc 결함 폭로) ────────────────────


def test_presale_recruit_date_sort_uses_real_date_not_move_in(db):
    """recruit_date_desc 가 presale_move_in('미정') 이 아니라 schedule.recruit_date(DATE)로 정렬.

    옛 결함: presale_move_in='미정'(한글) 단지가 모든 날짜 위로 솟음.
    수정 후: schedule 의 진짜 공고일 MAX 내림차순, schedule 없는 단지는 NULL 맨 뒤.
    """
    # B: 최신 공고 2026-03, A: 옛 공고 2025-01, C: '미정' move_in + schedule 없음
    _add_apt(db, "B", presale_type="민간분양", presale_move_in="2027-01")
    _add_apt(db, "A", presale_type="민간분양", presale_move_in="미정")
    _add_apt(db, "C", presale_type="민간분양", presale_move_in="미정")
    _add_schedule(db, "B", "HMN-B", recruit_date=date(2026, 3, 1))
    _add_schedule(db, "A", "HMN-A", recruit_date=date(2025, 1, 1))
    # C 는 schedule 없음 → NULL → 맨 뒤

    items, _ = get_presale_page(db, presale_type="private", sort_by="recruit_date_desc")
    order = [a.id for a in items]
    # B(2026-03) 가 A(2025-01) 보다 앞, schedule 없는 C 는 맨 뒤
    assert order.index("B") < order.index("A"), f"최신 공고가 앞이어야: {order}"
    assert order[-1] == "C", f"schedule 없는 단지는 맨 뒤여야: {order}"


def test_presale_recruit_date_uses_max_per_apartment(db):
    """차수 여러 행이면 단지별 MAX(recruit_date) 기준 (행 폭증 없이 단지 1행)."""
    _add_apt(db, "M", presale_type="민간분양")
    _add_apt(db, "N", presale_type="민간분양")
    # M: 2차(2026-06)가 최신, N: 단일 2026-03
    _add_schedule(db, "M", "M-1", recruit_date=date(2025, 1, 1))
    _add_schedule(db, "M", "M-2", recruit_date=date(2026, 6, 1))
    _add_schedule(db, "N", "N-1", recruit_date=date(2026, 3, 1))

    items, total = get_presale_page(db, presale_type="private", sort_by="recruit_date_desc")
    order = [a.id for a in items]
    # M 의 MAX(2026-06) > N(2026-03) → M 먼저. M 은 차수 2개여도 1행만.
    assert order == ["M", "N"], f"단지별 MAX 정렬: {order}"
    assert total == 2, "차수 중복으로 total 폭증하면 안 됨"


# ── 경쟁률(분양결과) 가드 ─────────────────────────────────────


def test_competition_or_filter_stage_or_rate(db):
    """presale_stage 또는 competition_rate 있으면 잡힘 (or_ 필터)."""
    _add_apt(db, "S", presale_stage="분양중")  # stage 만
    _add_apt(db, "R", competition_rate=12.5)  # rate 만
    _add_apt(db, "X")  # 둘 다 없음
    items, total = get_competition_page(db)
    ids = {a.id for a in items}
    assert ids == {"S", "R"}
    assert "X" not in ids
    assert total == 2


def test_competition_sort_by_rate_desc(db):
    """경쟁률 내림차순 — NULL 맨 뒤."""
    _add_apt(db, "HI", competition_rate=50.0)
    _add_apt(db, "LO", competition_rate=3.0)
    _add_apt(db, "NULL", presale_stage="분양중")  # rate NULL
    items, _ = get_competition_page(db, sort_by="competition_rate_desc")
    order = [a.id for a in items]
    assert order[0] == "HI"
    assert order.index("LO") < order.index("NULL")


def test_competition_sort_by_applicants_desc(db):
    """접수자수 내림차순."""
    _add_apt(db, "MANY", competition_rate=1.0, competition_applicants=9999)
    _add_apt(db, "FEW", competition_rate=1.0, competition_applicants=10)
    items, _ = get_competition_page(db, sort_by="applicants_desc")
    assert items[0].id == "MANY"


# ── 평형별 공급정보 가드 ──────────────────────────────────────


def test_unit_supplies_sorted_by_supply_area_not_model_no(db):
    """공급면적 오름차순 — model_no Text 사전순('10'<'2') 역전 방지."""
    _add_apt(db, "U")
    # model_no 사전순이면 '10' 이 '2' 앞으로 와 면적 역전. 면적순이면 작은→큰.
    _add_unit(db, "U", "H", model_no="2", supply_area=84.0)
    _add_unit(db, "U", "H", model_no="10", supply_area=59.0)
    _add_unit(db, "U", "H", model_no="1", supply_area=110.0)
    units = get_unit_supplies(db, "U")
    areas = [u.supply_area for u in units]
    assert areas == [59.0, 84.0, 110.0], f"면적 오름차순이어야: {areas}"


def test_unit_supply_breakdown_korean_labels(db):
    """special_by_type JSONB → 한글 라벨 리스트 (값 0 유형 제외)."""
    _add_apt(db, "L")
    u = _add_unit(
        db, "L", "H", model_no="1",
        supply_area=84.0, general_supply=100, special_supply=30,
        special_by_type={"dazanyeo": 10, "sinhon": 20, "nobumo": 0},
    )
    d = unit_supply_to_dict(u)
    breakdown = d["special_supply_breakdown"]
    labels = {b["label"]: b["count"] for b in breakdown}
    assert labels == {"다자녀": 10, "신혼부부": 20}, f"값 0(노부모) 제외: {labels}"
    # 라벨 매핑 SSOT 존재
    assert SPECIAL_TYPE_LABELS["saengae_choecho"] == "생애최초"


# ── 상세 요약 집계 가드 (BE SSOT) ─────────────────────────────


def test_presale_summary_aggregates_supply_and_special(db):
    """presale_summary 가 전 평형 공급/특공을 BE 1회 집계 (FE 합산 금지)."""
    _add_apt(db, "AGG")
    u1 = _add_unit(
        db, "AGG", "H", model_no="1",
        general_supply=50, special_supply=20, top_amount=80000,
        special_by_type={"dazanyeo": 5, "sinhon": 5},
    )
    u2 = _add_unit(
        db, "AGG", "H", model_no="2",
        general_supply=30, special_supply=10, top_amount=120000,
        special_by_type={"dazanyeo": 5, "cheongnyeon": 5},
    )
    s = _add_schedule(db, "AGG", "H", recruit_date=date(2026, 1, 1))
    summary = presale_summary([u1, u2], [s])

    assert summary["total_general_supply"] == 80
    assert summary["total_special_supply"] == 30
    assert summary["total_supply"] == 110
    assert summary["max_top_amount"] == 120000
    assert summary["min_top_amount"] == 80000
    assert summary["unit_type_count"] == 2
    assert summary["schedule_count"] == 1
    # 유형별 합산: dazanyeo 5+5=10
    by_type = {b["label"]: b["count"] for b in summary["special_by_type_total"]}
    assert by_type["다자녀"] == 10
    assert by_type["신혼부부"] == 5
    assert by_type["청년"] == 5


def test_presale_summary_empty():
    """빈 단지 — 0 집계 (None 안전)."""
    summary = presale_summary([], [])
    assert summary["total_supply"] == 0
    assert summary["max_top_amount"] is None
    assert summary["special_by_type_total"] == []


# ── 일정 조회 가드 ────────────────────────────────────────────


def test_get_presale_schedules_returns_rows(db):
    """단지 일정 차수별 반환 (recruit_date DESC)."""
    _add_apt(db, "SCH")
    _add_schedule(db, "SCH", "S1", recruit_date=date(2025, 1, 1), fetched_at=datetime(2026, 1, 1))
    _add_schedule(db, "SCH", "S2", recruit_date=date(2026, 5, 1), fetched_at=datetime(2026, 1, 1))
    rows = get_presale_schedules(db, "SCH")
    assert len(rows) == 2
    # recruit_date DESC → 2026-05 먼저
    assert rows[0].recruit_date == date(2026, 5, 1)
