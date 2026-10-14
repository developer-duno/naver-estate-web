"""미분양 '단지 전체' 세대수(bundle_units) — 묶음 값 전환 표식 뒤에만 켜지는지 (B22)

운영에서만 켜지는 도우미(db/mb_bundle_units.py)라 SQLite 시험에선 `_is_postgres` 를 열고,
미분양 소유 표 `collector_runs`·VIEW `apartments_flat` 을 시험용 표로 흉내 낸다
(`"memberIds"` 는 SQLite 에 배열이 없어 PostgreSQL 배열 글자 꼴 `{a,b}` 로 넣는다).
VIEW 를 읽었는지는 엔진에 지나간 SQL 글자로 센다 — 결과값(null)만으로는
"안 읽었다"와 "읽다 실패했다"가 갈리지 않는다.
실행: python -m pytest tests/test_mb_bundle_units.py -v
"""

import pytest
from sqlalchemy import event, text

from db import mb_bundle_units
from db.mb_models import Apartment

MARKER = "rows=3282 KOSIS_BUNDLE_APPLIED"


# ── 팩토리 함수 ──────────────────────────────────────────────


def _add_apartment(db, id_="APT001", complex_key="CK-1", units=4, unsold=231, name=None, **kw):
    # 이름이 같으면 목록이 대표 행 하나로 묶으므로 기본 이름을 id 로 달리한다
    defaults = dict(
        id=id_, name=name or f"단지{id_}", region="서울", gu="강남", dong="역삼동",
        complex_key=complex_key, units=units, unsold=unsold,
    )
    defaults.update(kw)
    a = Apartment(**defaults)
    db.add(a)
    db.commit()
    return a


def _make_runs_table(db, *, marker: bool, extra=()):
    db.execute(text(
        "CREATE TABLE collector_runs (id INTEGER PRIMARY KEY, collector TEXT, "
        "status TEXT, error_message TEXT)"
    ))
    rows = [("kosis-unsold", "success", None)]  # 표식 없는 평소 회차 — '아무 행이나 참' 결함 거르기
    if marker:
        rows.append(("kosis-unsold", "success", MARKER))
    rows.extend(extra)
    for collector, status, msg in rows:
        db.execute(text(
            "INSERT INTO collector_runs (collector, status, error_message) VALUES (:c, :s, :m)"
        ), {"c": collector, "s": status, "m": msg})
    db.commit()


def _make_flat_view(db, rows):
    """rows = (complexKey, units, unsold, memberIds 글자 또는 None)"""
    db.execute(text(
        'CREATE TABLE apartments_flat ("complexKey" TEXT, units INTEGER, unsold INTEGER, "memberIds" TEXT)'
    ))
    for key, units, unsold, members in rows:
        db.execute(text(
            'INSERT INTO apartments_flat ("complexKey", units, unsold, "memberIds") VALUES (:k, :u, :s, :m)'
        ), {"k": key, "u": units, "s": unsold, "m": members})
    db.commit()


@pytest.fixture
def pg_on(db, monkeypatch):
    """운영 분기를 열고, 표식 캐시를 비우고, 흉내 표를 끝나면 지운다."""
    monkeypatch.setattr(mb_bundle_units, "_is_postgres", lambda _db: True)
    mb_bundle_units._reset_cache()
    yield
    mb_bundle_units._reset_cache()
    db.rollback()
    db.execute(text("DROP TABLE IF EXISTS collector_runs"))
    db.execute(text("DROP TABLE IF EXISTS apartments_flat"))
    db.commit()


@pytest.fixture
def clock(monkeypatch):
    now = {"t": 1000.0}
    monkeypatch.setattr(mb_bundle_units.time, "monotonic", lambda: now["t"])
    return now


@pytest.fixture
def sql_log(db):
    """엔진에 지나간 SQL 글자 목록."""
    seen: list[str] = []
    bind = db.get_bind()

    def _capture(conn, cursor, statement, params, context, executemany):
        seen.append(statement)

    event.listen(bind, "before_cursor_execute", _capture)
    yield seen
    event.remove(bind, "before_cursor_execute", _capture)


def _count(seen, word):
    return sum(1 for s in seen if word in s)


# ── 표식 ──────────────────────────────────────────────────────


def test_no_marker_bundle_units_null_and_view_not_read(client, db, pg_on, sql_log):
    """(가) 표식 없음 → bundle_units null, VIEW 는 읽지 않는다"""
    _add_apartment(db)
    _make_runs_table(db, marker=False)
    _make_flat_view(db, [("CK-1", 1200, 231, None)])
    sql_log.clear()

    res = client.get("/api/mb/apartments?region=서울")
    assert res.status_code == 200
    assert res.json()["apartments"][0]["bundle_units"] is None
    assert _count(sql_log, "apartments_flat") == 0
    assert _count(sql_log, "collector_runs") == 1


def test_marker_text_on_failed_run_or_other_collector_is_not_marker(db, pg_on, sql_log):
    """표식 글자가 있어도 실패 회차·다른 수집기 행이면 표식이 아니다"""
    apt = _add_apartment(db)
    _make_runs_table(db, marker=False, extra=[
        ("kosis-unsold", "failed", MARKER),
        ("other-collector", "success", MARKER),
    ])
    _make_flat_view(db, [("CK-1", 1200, 231, None)])
    sql_log.clear()

    assert mb_bundle_units.get_bundle_units(db, [apt]) == {}
    assert _count(sql_log, "apartments_flat") == 0


def test_sqlite_without_patch_reads_nothing(client, db, sql_log):
    """운영 분기를 안 열면(SQLite) 표식도 VIEW 도 읽지 않는다 — 기존 시험 영향 0"""
    mb_bundle_units._reset_cache()
    _add_apartment(db)
    sql_log.clear()

    res = client.get("/api/mb/apartments?region=서울")
    assert res.json()["apartments"][0]["bundle_units"] is None
    assert _count(sql_log, "collector_runs") == 0
    assert _count(sql_log, "apartments_flat") == 0


# ── 값 ────────────────────────────────────────────────────────


def test_marker_present_bundle_units_from_view(client, db, pg_on, sql_log):
    """(나) 표식 있음 + VIEW 에 묶음 값 → 그 값 (10분 안 여러 요청에 VIEW 1회)"""
    _add_apartment(db, "APT001", complex_key="CK-1", units=4)
    _add_apartment(db, "APT002", complex_key="CK-1", units=1196)
    _add_apartment(db, "APT003", complex_key="CK-2", units=280, unsold=50)
    _make_runs_table(db, marker=True)
    _make_flat_view(db, [
        ("CK-1", 1200, 231, "{APT001,APT002}"),
        ("CK-2", 300, 50, "{APT003}"),
        ("CK-9", 50, 1, "{X}"),
    ])
    sql_log.clear()

    res = client.get("/api/mb/apartments?region=서울")
    assert res.status_code == 200
    by_id = {a["id"]: a for a in res.json()["apartments"]}
    assert by_id["APT001"]["bundle_units"] == 1200
    assert by_id["APT001"]["units"] == 4  # 행 값은 그대로
    assert by_id["APT002"]["bundle_units"] == 1200
    assert by_id["APT003"]["bundle_units"] == 300

    detail = client.get("/api/mb/apartments/APT001").json()
    assert detail["bundle_units"] == 1200
    assert client.get("/api/mb/unsold?region=서울").status_code == 200
    # VIEW 는 통째로 한 번 읽어 10분 기억 — 여러 요청에도 1회, 표식도 1회
    assert _count(sql_log, "apartments_flat") == 1
    assert _count(sql_log, "collector_runs") == 1


def test_marker_present_key_missing_in_view_null(client, db, pg_on):
    """(다) 표식 있음 + VIEW 에 그 키 없음 → null · 묶음 키 없는 행도 null (두 행 모두 응답에 나옴)"""
    _add_apartment(db, "APT001", complex_key="CK-LONE")
    _add_apartment(db, "APT002", complex_key=None)
    _make_runs_table(db, marker=True)
    _make_flat_view(db, [("CK-1", 1200, 231, None)])

    res = client.get("/api/mb/apartments?region=서울")
    assert res.status_code == 200
    by_id = {a["id"]: a for a in res.json()["apartments"]}
    assert set(by_id) == {"APT001", "APT002"}
    assert by_id["APT001"]["bundle_units"] is None
    assert by_id["APT002"]["bundle_units"] is None


def test_only_rows_receiving_bundle_value_get_bundle_units(db, pg_on):
    """묶음 값을 받는 줄에만 — (오)처럼 memberIds 밖이면 null, 미분양이 묶음 값과 다르면(보류 등) null"""
    member = _add_apartment(db, "APT001", complex_key="CK-1", unsold=231)
    outside = _add_apartment(db, "APT002", complex_key="CK-1", unsold=231)  # (오) — 구성원 아님
    held = _add_apartment(db, "APT003", complex_key="CK-1", unsold=7)  # 보류 — 자기 미분양 유지
    no_members = _add_apartment(db, "APT004", complex_key="CK-2", unsold=50)  # memberIds 비면 (a) 건너뜀
    _make_runs_table(db, marker=True)
    _make_flat_view(db, [
        ("CK-1", 1200, 231, "{APT001,APT003}"),
        ("CK-2", 300, 50, None),
    ])

    got = mb_bundle_units.get_bundle_units(db, [member, outside, held, no_members])
    assert got == {"APT001": 1200, "APT004": 300}


def test_duplicate_key_in_view_uses_first_row_and_warns(db, pg_on, caplog):
    """VIEW 에 같은 묶음 키가 여러 행이면 첫 행만 쓰고 경고 1줄"""
    apt = _add_apartment(db, "APT001", complex_key="CK-1", unsold=231)
    _make_runs_table(db, marker=True)
    _make_flat_view(db, [("CK-1", 1200, 231, None), ("CK-1", 999, 231, None)])

    with caplog.at_level("WARNING", logger="db.mb_bundle_units"):
        assert mb_bundle_units.get_bundle_units(db, [apt]) == {"APT001": 1200}
        assert mb_bundle_units.get_bundle_units(db, [apt]) == {"APT001": 1200}
    assert sum("같은 묶음 키" in r.getMessage() for r in caplog.records) == 1


# ── 실패·차단기 ────────────────────────────────────────────────


def test_view_query_error_null_and_response_ok(client, db, pg_on, caplog):
    """(라) VIEW 조회 예외 → null · 응답 정상 · 같은 요청의 뒤 조회도 막히지 않음"""
    _add_apartment(db, "APT001", complex_key="CK-1")
    _make_runs_table(db, marker=True)
    # apartments_flat 을 만들지 않는다 → VIEW 조회가 "no such table" 로 실패

    with caplog.at_level("WARNING", logger="db.mb_bundle_units"):
        res = client.get("/api/mb/apartments/APT001")
    assert res.status_code == 200
    assert res.json()["bundle_units"] is None
    assert any("묶음 세대수 조회 실패" in r.getMessage() for r in caplog.records)
    # 실패 뒤에도 같은 세션으로 조회가 된다(SAVEPOINT 로 감쌈)
    assert client.get("/api/mb/unsold?region=서울").status_code == 200


def test_view_error_trips_breaker_for_ten_minutes(db, pg_on, sql_log, clock, caplog):
    """VIEW 조회가 실패하면 10분 동안 표식·VIEW 를 다시 안 묻고 경고도 1줄만, 10분 뒤 다시 시도"""
    apt = _add_apartment(db)
    _make_runs_table(db, marker=True)  # apartments_flat 없음 → 실패

    with caplog.at_level("WARNING", logger="db.mb_bundle_units"):
        assert mb_bundle_units.get_bundle_units(db, [apt]) == {}
        sql_log.clear()
        clock["t"] += 599
        assert mb_bundle_units.get_bundle_units(db, [apt]) == {}
        assert mb_bundle_units.get_bundle_units(db, [apt]) == {}
    assert _count(sql_log, "collector_runs") == 0
    assert _count(sql_log, "apartments_flat") == 0
    assert sum("묶음 세대수 조회 실패" in r.getMessage() for r in caplog.records) == 1

    clock["t"] += 2  # 실패 뒤 601초
    assert mb_bundle_units.get_bundle_units(db, [apt]) == {}
    assert _count(sql_log, "apartments_flat") == 1


def test_view_query_runs_inside_savepoint(db, pg_on, sql_log):
    """VIEW 조회는 SAVEPOINT 안에서 — 운영(PostgreSQL)에서 실패해도 요청의 트랜잭션이 안 깨지게"""
    apt = _add_apartment(db)
    _make_runs_table(db, marker=True)
    _make_flat_view(db, [("CK-1", 1200, 231, None)])
    sql_log.clear()

    mb_bundle_units.get_bundle_units(db, [apt])
    i = next(i for i, s in enumerate(sql_log) if "apartments_flat" in s)
    assert sql_log[i - 1].startswith("SAVEPOINT")


# ── (마) 표식 캐시 ─────────────────────────────────────────────


def test_marker_false_cached_for_ten_minutes(db, pg_on, sql_log, clock):
    """(마) 표식 거짓 뒤 10분 안엔 다시 묻지 않고, 10분이 지나면 다시 묻는다"""
    apt = _add_apartment(db)
    _make_runs_table(db, marker=False)
    sql_log.clear()

    assert mb_bundle_units.get_bundle_units(db, [apt]) == {}
    clock["t"] += 599
    assert mb_bundle_units.get_bundle_units(db, [apt]) == {}
    assert _count(sql_log, "collector_runs") == 1

    clock["t"] += 2  # 처음 확인 뒤 601초
    assert mb_bundle_units.get_bundle_units(db, [apt]) == {}
    assert _count(sql_log, "collector_runs") == 2


def test_marker_true_rechecked_after_ten_minutes_reverted(db, pg_on, sql_log, clock):
    """표식 참도 10분 캐시 — 그사이 미분양이 되돌려 REVERTED 로 바뀌면 10분 뒤 꺼진다"""
    apt = _add_apartment(db)
    _make_runs_table(db, marker=True)
    _make_flat_view(db, [("CK-1", 1200, 231, None)])

    assert mb_bundle_units.get_bundle_units(db, [apt]) == {"APT001": 1200}
    # 되돌림: 행은 남고 글자만 REVERTED 로 바뀐다
    db.execute(text(
        "UPDATE collector_runs SET error_message = 'rows=3282 KOSIS_BUNDLE_REVERTED' "
        "WHERE error_message LIKE '%KOSIS_BUNDLE_APPLIED%'"
    ))
    db.commit()
    sql_log.clear()

    clock["t"] += 599  # 10분 안 — 아직 참(다시 묻지 않음)
    assert mb_bundle_units.get_bundle_units(db, [apt]) == {"APT001": 1200}
    assert _count(sql_log, "collector_runs") == 0

    clock["t"] += 2  # 처음 확인 뒤 601초 — 다시 묻고 꺼진다, VIEW 는 안 읽는다
    sql_log.clear()
    assert mb_bundle_units.get_bundle_units(db, [apt]) == {}
    assert _count(sql_log, "collector_runs") == 1
    assert _count(sql_log, "apartments_flat") == 0


def test_recheck_keeps_previous_result_while_querying(db, pg_on, clock):
    """10분 재확인 중에는 직전 결과(참)를 그대로 보인다 — 확인 쿼리 도중 거짓으로 깜빡이지 않음"""
    apt = _add_apartment(db)
    _make_runs_table(db, marker=True)
    _make_flat_view(db, [("CK-1", 1200, 231, None)])
    assert mb_bundle_units.get_bundle_units(db, [apt]) == {"APT001": 1200}

    seen_during_query: list[bool] = []
    bind = db.get_bind()

    def _capture(conn, cursor, statement, params, context, executemany):
        if "collector_runs" in statement:
            seen_during_query.append(mb_bundle_units._state["applied"])

    clock["t"] += 601
    event.listen(bind, "before_cursor_execute", _capture)
    try:
        assert mb_bundle_units.get_bundle_units(db, [apt]) == {"APT001": 1200}
    finally:
        event.remove(bind, "before_cursor_execute", _capture)
    assert seen_during_query == [True]
