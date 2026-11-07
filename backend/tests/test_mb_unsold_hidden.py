"""미분양 수 비공개(지자체 명단 govlist + unsold NULL) 판정·목록·응답 시험 (세션 500)

2026-09 부터 대구시 명단이 단지별 미분양 수를 공개하지 않아, 미분양 쪽이 그 단지를
unsold_source='govlist' · unsold=NULL 로 둔다. 2u 는 이 단지를
① 응답에 unsold_hidden=true 로 알리고 ② 지역별 미분양 목록에 남기되 숫자 있는 단지 뒤에 둔다.
실행: python -m pytest tests/test_mb_unsold_hidden.py -q
"""

from datetime import date

import pytest

from db import mb_queries
from db.mb_models import Apartment
from db.mb_query_helpers import is_unsold_hidden

# ── 팩토리 ──────────────────────────────────────────────────


def _add(db, id_, name, region="대구", **kw):
    defaults = dict(id=id_, name=name, region=region, gu="북구", dong="읍내동")
    defaults.update(kw)
    a = Apartment(**defaults)
    db.add(a)
    db.commit()
    return a


def _hidden(db, id_, name, **kw):
    """명단에 있으나 수 비공개인 단지"""
    return _add(db, id_, name, unsold=None, unsold_source="govlist",
                unsold_listed_as_of=date(2026, 9, 30), **kw)


# ── 판정 함수 ───────────────────────────────────────────────


@pytest.mark.parametrize(
    "source, unsold, expected",
    [
        ("govlist", None, True),   # 명단 + 수 비공개
        ("govlist", 25, False),    # 명단 + 숫자 공개(대명헤리티지 류)
        ("govlist", 0, False),     # 0 은 공개된 숫자
        ("kosis", None, False),    # 다른 출처의 빈 값은 비공개가 아니다
        ("hold", None, False),
        ("applyhome", None, False),
        (None, None, False),
    ],
)
def test_is_unsold_hidden(source, unsold, expected):
    assert is_unsold_hidden(source, unsold) is expected


# ── 지역별 미분양 목록 ──────────────────────────────────────


def test_unsold_by_region_includes_hidden_in_list_and_total(db):
    """비공개 단지도 목록·전체 수에 들어가고, 다른 출처의 빈 값·0 은 여전히 빠진다"""
    _add(db, "N1", "숫자단지", unsold=10, unsold_source="kosis")
    _hidden(db, "H1", "비공개단지")
    _add(db, "K0", "콘시스빈값", unsold=None, unsold_source="kosis")
    _add(db, "Z0", "영단지", unsold=0, unsold_source="govlist")

    rows, total = mb_queries.get_unsold_by_region(db, region="대구")
    assert {a.id for a in rows} == {"N1", "H1"}
    assert total == 2


@pytest.mark.parametrize("sort_by", ["unsold_desc", "unsold_asc", "unsold_rate_desc", "name_asc"])
def test_unsold_by_region_hidden_sorted_after_numbers(db, sort_by):
    """어느 정렬이든 비공개 단지는 숫자 있는 단지 뒤 — 이름순에서 비공개가 앞 글자여도 뒤"""
    _hidden(db, "H1", "가가비공개")  # 이름순이면 맨 앞이 될 이름
    _add(db, "N1", "나단지", unsold=5, unsold_rate=10.0, unsold_source="kosis")
    _add(db, "N2", "다단지", unsold=50, unsold_rate=None, unsold_source="kosis")  # 미분양률 빈 숫자 단지
    _hidden(db, "H2", "라비공개")

    rows, total = mb_queries.get_unsold_by_region(db, region="대구", sort_by=sort_by)
    ids = [a.id for a in rows]
    assert total == 4
    assert set(ids[:2]) == {"N1", "N2"}, ids
    assert set(ids[2:]) == {"H1", "H2"}, ids


def test_unsold_by_region_hidden_last_keeps_number_order(db):
    """비공개를 뒤로 보내도 숫자 단지끼리의 정렬(많은순)은 그대로"""
    _add(db, "N1", "작은단지", unsold=5, unsold_source="kosis")
    _hidden(db, "H1", "비공개단지")
    _add(db, "N2", "큰단지", unsold=50, unsold_source="kosis")

    rows, _ = mb_queries.get_unsold_by_region(db, region="대구", sort_by="unsold_desc")
    assert [a.id for a in rows] == ["N2", "N1", "H1"]


def test_unsold_by_region_hidden_on_last_page(db):
    """페이지를 넘겨도 비공개 단지는 마지막 쪽에 — 첫 쪽은 숫자 단지만"""
    _hidden(db, "H1", "가비공개")
    for i in range(3):
        _add(db, f"N{i}", f"나단지{i}", unsold=10 + i, unsold_source="kosis")

    page1, total = mb_queries.get_unsold_by_region(db, region="대구", page=1, page_size=3)
    page2, _ = mb_queries.get_unsold_by_region(db, region="대구", page=2, page_size=3)
    assert total == 4
    assert all(a.id.startswith("N") for a in page1)
    assert [a.id for a in page2] == ["H1"]


def test_apartments_page_not_reordered(db):
    """일반 단지 목록(get_apartments_page)은 hidden_last 를 쓰지 않는다 — 이름순 그대로"""
    _hidden(db, "H1", "가가비공개")
    _add(db, "N1", "나단지", unsold=5, unsold_source="kosis")

    rows, _ = mb_queries.get_apartments_page(db, region="대구", sort_by="name_asc")
    assert [a.id for a in rows] == ["H1", "N1"]


# ── 응답 칸 ─────────────────────────────────────────────────


def test_detail_response_hidden_fields(client, db):
    """상세 응답: 비공개 단지는 unsold_hidden=true + 명단 기준일 ISO"""
    _hidden(db, "ah-2021910048", "북구청역 푸르지오 에듀포레")
    data = client.get("/api/mb/apartments/ah-2021910048").json()
    assert data["unsold"] is None
    assert data["unsold_hidden"] is True
    assert data["unsold_listed_as_of"] == "2026-09-30"


def test_detail_response_govlist_with_number(client, db):
    """명단 + 숫자 공개 단지는 unsold_hidden=false"""
    _add(db, "ap-6026533", "대명헤리티지", unsold=25, unsold_source="govlist",
         unsold_listed_as_of=date(2026, 9, 30))
    data = client.get("/api/mb/apartments/ap-6026533").json()
    assert data["unsold"] == 25
    assert data["unsold_hidden"] is False
    assert data["unsold_listed_as_of"] == "2026-09-30"


def test_detail_response_other_source_defaults(client, db):
    """출처·기준일이 빈 단지는 false + null"""
    _add(db, "K1", "콘시스", region="서울", unsold=None, unsold_source=None)
    data = client.get("/api/mb/apartments/K1").json()
    assert data["unsold_hidden"] is False
    assert data["unsold_listed_as_of"] is None


def test_unsold_list_response_carries_hidden(client, db):
    """/api/mb/unsold 목록 응답에도 칸이 실린다"""
    _add(db, "N1", "숫자단지", unsold=10, unsold_source="kosis")
    _hidden(db, "H1", "비공개단지")
    body = client.get("/api/mb/unsold", params={"region": "대구"}).json()
    assert body["total"] == 2
    by_id = {x["id"]: x for x in body["unsold"]}
    assert by_id["H1"]["unsold_hidden"] is True
    assert by_id["N1"]["unsold_hidden"] is False
    assert [x["id"] for x in body["unsold"]] == ["N1", "H1"]
