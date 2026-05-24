"""가격 통계 집계 쿼리 테스트 — 면적 버킷 단기임대 wolse 합산
실행: python -m pytest tests/test_price_queries.py -v

주의: floor_stmt 는 PostgreSQL `~` regex + `SPLIT_PART` 사용 → SQLite (테스트 엔진)
미지원. 본 파일은 area_stmt 만 검증 (단기임대 매핑 회귀 가드 목적).
floor_stmt 의 dialect 정렬은 별도 이슈.
"""
from db import queries
from db.models import Article, Complex


def _add_complex(db, no="PQ1"):
    db.add(Complex(complex_no=no, complex_name=f"단지{no}"))
    db.commit()


def _add_article(db, no, complex_no, trade, price, area2_m2, active=True):
    # floor_info 는 None — floor_stmt 의 PostgreSQL 의존성 우회
    db.add(Article(
        article_no=no, complex_no=complex_no, trade_type_name=trade,
        numeric_price=price, area2_m2=area2_m2, floor_info=None, is_active=active,
    ))
    db.commit()


def test_get_price_stats_단기임대_합산_to_wolse(db):
    """단기임대 매물의 보증금이 wolse 키에 월세와 합산되어 집계되는지 검증.

    배경: BE-FE 매핑 정렬 (세션 225).
    db/price_queries.py:88 tt_key_map 의 "단기임대": "wolse" 매핑 회귀 가드.
    """
    _add_complex(db, "PQ1")
    # 같은 면적 버킷 (80m²) — 월세 1 + 단기임대 1 → wolse 키에 합산
    _add_article(db, "WS1", "PQ1", trade="월세", price=10000, area2_m2=80)
    _add_article(db, "ST1", "PQ1", trade="단기임대", price=20000, area2_m2=80)

    result = queries.get_price_stats_aggregated(db, "PQ1")

    # by_area: 80m² 버킷에 wolse 2건 합산, 보증금 평균 (10000 + 20000) / 2 = 15000
    assert len(result["by_area"]) == 1
    bucket = result["by_area"][0]
    assert bucket["wolse_count"] == 2
    assert bucket["wolse"] == 15000


def test_get_price_stats_단기임대_only(db):
    """월세 0개 + 단기임대만 있는 단지도 wolse 키에 정상 집계되는지 검증."""
    _add_complex(db, "PQ2")
    _add_article(db, "ST2", "PQ2", trade="단기임대", price=15000, area2_m2=60)

    result = queries.get_price_stats_aggregated(db, "PQ2")

    assert len(result["by_area"]) == 1
    assert result["by_area"][0]["wolse_count"] == 1
    assert result["by_area"][0]["wolse"] == 15000


def test_get_price_stats_단기임대_제외_unmapped_trade_skipped(db):
    """매핑에 없는 거래유형은 스킵 (회귀 가드: 매핑 추가 후에도 unmapped 안전)."""
    _add_complex(db, "PQ3")
    _add_article(db, "ST3", "PQ3", trade="월세", price=10000, area2_m2=70)
    # tt_key_map 에 없는 가상 거래유형 → 스킵되어 wolse 카운트에 영향 없음
    _add_article(db, "UN3", "PQ3", trade="알수없음", price=99999, area2_m2=70)

    result = queries.get_price_stats_aggregated(db, "PQ3")

    assert len(result["by_area"]) == 1
    assert result["by_area"][0]["wolse_count"] == 1
    assert result["by_area"][0]["wolse"] == 10000
