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
    db/price_queries.py:132 tt_key_map 의 "단기임대": "wolse" 매핑 회귀 가드.
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


def test_get_price_changed_articles_sql_matches_v064_index_condition(db):
    """get_price_changed_articles 의 실제 SQL 이 V064 부분 인덱스 조건과 일치하는지 검증.

    배경: V064 (db/migrations/V064__articles_price_changed_partial_idx.sql)는
    `WHERE is_active = true AND price_changed_at IS NOT NULL` 부분 인덱스를
    `ORDER BY price_changed_at DESC` 로 만든다. 쿼리의 WHERE·ORDER BY 가 이 조건과
    어긋나면(예: is_active 조건 누락, IS NOT NULL 누락, 정렬 컬럼 변경) 인덱스가
    planner 에 안 먹혀 V064 가 있어도 여전히 풀스캔이 난다.

    CI 는 SQLite 라 이 쿼리를 실행은 할 수 있어도 PostgreSQL 의 부분 인덱스 매칭
    여부는 실행 결과로 못 본다 — 그래서 생성되는 SQL 문자열 자체를 PostgreSQL
    방언으로 컴파일해 조건을 직접 확인한다
    (선례: feedback_sqlite_ci_hides_postgres_errors, test_field_drift_monitor.py).
    """
    from sqlalchemy.dialects import postgresql

    captured: list[str] = []
    original = db.execute

    def _spy(stmt, *a, **kw):
        try:
            captured.append(
                str(stmt.compile(dialect=postgresql.dialect(),
                                 compile_kwargs={"literal_binds": True}))
            )
        except Exception:
            pass
        return original(stmt, *a, **kw)

    db.execute = _spy  # type: ignore[method-assign]
    try:
        queries.get_price_changed_articles(db, complex_no=None, limit=50)
    finally:
        db.execute = original  # type: ignore[method-assign]

    sql = chr(10).join(captured)
    assert "is_active" in sql, f"is_active 조건이 SQL 에 없다: {sql}"
    assert "price_changed_at IS NOT NULL" in sql, (
        f"price_changed_at IS NOT NULL 조건이 SQL 에 없다 (V064 인덱스 조건과 불일치): {sql}"
    )
    assert "ORDER BY articles.price_changed_at DESC" in sql, (
        f"price_changed_at DESC 정렬이 없다 (V064 인덱스 정렬과 불일치): {sql}"
    )


# ── 세션 475 PR 6 — 층별 시세는 대표 면적 묶음 매물만 ──────────────────────────
# floor_stmt 는 PostgreSQL 전용이라 SQLite 에서 돌릴 수 없다 → 진짜 세션을 감싸 방언 이름만 postgresql 로 보이게 하고,
# 층별 SQL 은 실행 대신 문장·바인드 값을 잡아 둔다(나머지 조회는 진짜 SQLite 로).


class _PgProxy:
    def __init__(self, db):
        from types import SimpleNamespace

        self._db = db
        self.bind = SimpleNamespace(dialect=SimpleNamespace(name="postgresql"))
        self.floor_sql: list[tuple[str, dict]] = []

    def execute(self, stmt, *args, **kwargs):
        from types import SimpleNamespace

        sql = str(stmt)
        if "floor_tier" in sql:
            self.floor_sql.append((sql, dict(stmt.compile().params)))
            return SimpleNamespace(fetchall=lambda: [])
        return self._db.execute(stmt, *args, **kwargs)

    def __getattr__(self, name):
        return getattr(self._db, name)


def _add_pyeong(db, complex_no, rows):
    from db.models import ComplexPyeongDetail

    for pno, area, hh in rows:
        db.add(ComplexPyeongDetail(complex_no=complex_no, pyeong_no=pno, exclusive_area=area,
                                   household_count_by_pyeong=hh))
    db.commit()


def test_층별_시세_대표면적_묶음만_거른다(db):
    """6139 처럼 대표 면적 59 → 층별 SQL 에 FLOOR(area2_m2) = 59 조건, 응답 floor_area_m2 = 59.
    뮤테이션 표적: SQL 의 면적 조건을 지우면 FAIL."""
    db.add(Complex(complex_no="FA1", complex_name="자연", rep_area_m2=59))
    db.commit()
    proxy = _PgProxy(db)

    result = queries.get_price_stats_aggregated(proxy, "FA1")

    assert result["floor_area_m2"] == 59
    (sql, params), = proxy.floor_sql
    assert "FLOOR(area2_m2) = :area" in sql
    assert params["area"] == 59 and params["cno"] == "FA1"


def test_층별_시세_대표면적_없으면_평형표_세대수_최다(db):
    """rep_area_m2 가 비면 평형표(세대수 최다 묶음)로 — 84.97·84.36 은 84 묶음으로 합쳐 28세대 > 59 묶음 20세대."""
    _add_complex(db, "FA2")
    _add_pyeong(db, "FA2", [(1, "59.98", "20"), (2, "84.97", "15"), (3, "84.36", "13")])

    result = queries.get_price_stats_aggregated(_PgProxy(db), "FA2")

    assert result["floor_area_m2"] == 84


def test_층별_시세_면적을_모르면_전체_매물(db):
    """대표 면적도 평형표도 없으면 지금처럼 전체 매물 — SQL 에 면적 조건 없음, floor_area_m2 = None."""
    _add_complex(db, "FA3")
    proxy = _PgProxy(db)

    result = queries.get_price_stats_aggregated(proxy, "FA3")

    assert result["floor_area_m2"] is None
    (sql, params), = proxy.floor_sql
    assert "FLOOR(area2_m2)" not in sql and "area" not in params


def test_층별_시세_SQLite_에서도_응답_칸(db):
    """SQLite(시험 엔진)는 층별을 비워 두지만 floor_area_m2 칸은 같은 규칙으로 싣는다."""
    db.add(Complex(complex_no="FA4", complex_name="자연", rep_area_m2=84))
    db.commit()

    result = queries.get_price_stats_aggregated(db, "FA4")

    assert result["by_floor"] == [] and result["floor_area_m2"] == 84


def test_매물_목록_면적_묶음_필터는_N이상_N플러스1_미만(client, db, approved_headers):
    """세션 475 보완 Q3: 화면이 같은 면적 묶음(소수점 버림)을 min_area_m2=N · max_area_m2=N+0.999 로 서버에 요청한다.
    서버는 max 를 `<=` 로 비교 — 59.0·59.99 는 들어오고 58.99·60.0 은 빠져야 내림 규칙과 같다."""
    _add_complex(db, "FR1")
    for no, area in (("R1", 58.99), ("R2", 59.0), ("R3", 59.99), ("R4", 60.0)):
        _add_article(db, no, "FR1", trade="매매", price=17000, area2_m2=area)

    res = client.get("/api/complexes/FR1/articles?trade_types=매매&min_area_m2=59&max_area_m2=59.999",
                     headers=approved_headers)

    assert res.status_code == 200
    assert sorted(a["article_no"] for a in res.json()["articles"]) == ["R2", "R3"]
