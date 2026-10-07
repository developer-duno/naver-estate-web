"""상세 배치 '매물 한 건 저장 실패' 격리 회귀 가드 (2026-10-07 사고 후속).

배경: 2026-10-07 05:35~10:25 매물 상세 수집(crawl_article_details)이 9회 연속 회차 전체
실패(processed 0)했다. 매물 한 건의 상세 문자열에 NUL 이 섞여 UPDATE 가 깨졌고, 예외가
회차 전체를 끝냈으며, 그 매물이 신선도 정렬 맨 앞에 남아 매 회차 반복됐다. NUL 자체는
#678 이 막았고, 이 파일은 **같은 꼴(불량값 한 건이 매 회차를 막음)** 을 원인과 무관하게 막는지 본다.

검증하는 것 (두 경로 — crawl_article_details · backfill_article_details(_process_detail_batch)):
1. 가운데 매물 저장만 실패 → 앞뒤 매물은 저장, 회차 completed + 우리말 error_message,
   실패 매물만 detail_fail_count +1.
2. 불량 매물 3건이 나란히 붙어도 저장 성공이 1건이라도 있으면 completed, 3건 모두 +1.
3. 저장 성공 0건 + 실패 20건 이상 → 시스템성 장애로 보고 카운트 보류 + 회차 failed.
   20건 미만(불량 몇 건만 대기)이면 회차는 completed, 카운트가 올라 상한에서 저절로 빠진다.
   단 보류 회차에도 정비 잡이 CAP-1 로 되살린 매물은 +1(매물오류 차단기 revived 와 같은 예외).
4. DB 연결 계열 오류(OperationalError)는 매물 탓으로 세지 않는다(codes.md "transient 는 세지 않음").
5. DB 연결 계열 오류가 성공 없이 3건 쌓이면 루프 도중 멈춘다(DB 장애 중 네이버 콜 낭비 방지).
   사이에 저장 성공이 끼면 그 수가 초기화돼 멈추지 않는다.
6. 실패 매물의 UPDATE 가 이미 실행된 뒤 실패해도 그 변경은 되돌려진다(rollback 증명).
7. 상한 직전 매물이 저장 실패하면 다음 회차 선정에서 빠진다.

예외 주입: build_detail_update_dict 가 특정 매물에만 SQLite 가 바인딩할 수 없는 값(object())을
돌려주게 해, UPDATE 실행 시점에 진짜 DB 드라이버 예외(ProgrammingError — 자료 모양 오류)가 나게 한다.
"""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.exc import OperationalError

from crawler import service_discover
from crawler.plain_words import explain_stored_error
from crawler.service_discover import backfill_article_details, crawl_article_details
from db.models import Article, CrawlJob
from services.upsert import build_detail_update_dict as _real_build


def _make_detail_target(db, article_no: str, *, last_seen: datetime, backfill: bool) -> None:
    """상세 수집(backfill=False) 또는 상세 백필(backfill=True) 후보 매물 1건 심기."""
    db.add(
        Article(
            article_no=article_no,
            complex_no="100",
            trade_type_name="매매",
            detail_crawled=backfill,
            is_active=True,
            last_seen_at=last_seen,
            heating_type=None,
            detail_fail_count=0,
        )
    )
    db.commit()


def _seed(db, article_nos: list[str], *, backfill: bool) -> None:
    """앞 번호일수록 최신 — 신선도 정렬(last_seen_at DESC)대로 처리 순서가 고정된다."""
    now = datetime.now(timezone.utc)
    for i, no in enumerate(article_nos):
        _make_detail_target(db, no, last_seen=now - timedelta(minutes=i), backfill=backfill)


def _patch(monkeypatch, *, bad: set[str] = frozenset(), db_down: set[str] = frozenset()) -> list[str]:
    """네이버 호출·대기를 끄고 불량 매물을 주입한다. 반환 = 상세 API 를 부른 매물 순서.

    bad: 저장 값에 바인딩 불가 값(자료 모양 오류). db_down: OperationalError(DB 연결 계열).
    """
    called: list[str] = []
    monkeypatch.setattr(service_discover._throttle_details, "wait", lambda: None)
    monkeypatch.setattr(service_discover, "record_call", lambda *a, **k: None)

    def _detail(an):
        called.append(an)
        return {"articleDetail": {"articleNo": an, "aptHeatMethodTypeName": "개별난방"}}

    monkeypatch.setattr(service_discover.NaverEstateAPI, "get_article_detail", staticmethod(_detail))

    def _build(domain_article, detail_data=None):
        if domain_article.article_no in db_down:
            raise OperationalError("UPDATE articles", {}, Exception("server closed the connection"))
        data = _real_build(domain_article, detail_data)
        if domain_article.article_no in bad:
            data["detail_description"] = object()  # DB 드라이버가 거부하는 값
        return data

    monkeypatch.setattr(service_discover, "build_detail_update_dict", _build)
    return called


def _rows(db) -> dict[str, Article]:
    db.expire_all()
    return {a.article_no: a for a in db.query(Article).all()}


def _last_job(db, job_type: str) -> CrawlJob:
    db.expire_all()
    return (
        db.query(CrawlJob).filter(CrawlJob.job_type == job_type).order_by(CrawlJob.id.desc()).first()
    )


def _filled(row: Article, backfill: bool) -> bool:
    """이번 회차에 상세가 저장됐나 — 상세 수집은 detail_crawled, 백필은 heating_type 으로 본다."""
    return row.heating_type == "개별난방" if backfill else row.detail_crawled is True


_PATHS = [
    pytest.param(crawl_article_details, False, "article_detail", id="crawl_article_details"),
    pytest.param(backfill_article_details, True, "article_detail_backfill", id="backfill(_process_detail_batch)"),
]


@pytest.mark.parametrize("job_fn,backfill,job_type", _PATHS)
def test_one_bad_article_does_not_fail_the_run(db, monkeypatch, job_fn, backfill, job_type):
    """가운데 매물(B) 저장만 실패 → A·C 는 저장, 회차 completed, B 만 detail_fail_count +1."""
    _seed(db, ["A", "B", "C"], backfill=backfill)
    _patch(monkeypatch, bad={"B"})

    job_fn(batch_size=10)

    rows = _rows(db)
    assert _filled(rows["A"], backfill) and _filled(rows["C"], backfill)
    assert not _filled(rows["B"], backfill)
    assert [rows[n].detail_fail_count for n in "ABC"] == [0, 1, 0]
    job = _last_job(db, job_type)
    assert job.status == "completed"
    assert (job.processed_items, job.total_items) == (2, 3)
    # completed 회차에도 우리말 한 줄 — 관리자 화면(explain_stored_error ③)에 원문 그대로 보인다
    assert job.error_message == "상세 저장 실패 1건 — 그 매물만 건너뛰고 다음 매물로 넘어갔어요"
    assert explain_stored_error(job.error_message) == job.error_message


@pytest.mark.parametrize("job_fn,backfill,job_type", _PATHS)
def test_adjacent_bad_articles_counted_when_any_save_succeeds(db, monkeypatch, job_fn, backfill, job_type):
    """불량 3건(A·B·C)이 나란히 붙어도 D 가 저장되면 completed, 불량 3건 모두 +1(매 회차 세져 상한으로 빠진다)."""
    _seed(db, ["A", "B", "C", "D"], backfill=backfill)
    _patch(monkeypatch, bad={"A", "B", "C"})

    job_fn(batch_size=10)

    assert _last_job(db, job_type).status == "completed"
    rows = _rows(db)
    assert [rows[n].detail_fail_count for n in "ABCD"] == [1, 1, 1, 0]
    assert _filled(rows["D"], backfill)


@pytest.mark.parametrize("job_fn,backfill,job_type", _PATHS)
def test_zero_success_with_many_failures_fails_run_and_holds_counts(db, monkeypatch, job_fn, backfill, job_type):
    """저장 성공 0건 + 실패 20건(차단기 문턱) = 시스템성 의심 → 회차 failed, 카운트 보류."""
    nos = [f"N{i:02d}" for i in range(service_discover._ARTICLE_ERROR_SYSTEMIC_MIN)]
    _seed(db, nos, backfill=backfill)
    _patch(monkeypatch, bad=set(nos))

    job_fn(batch_size=50)

    job = _last_job(db, job_type)
    assert job.status == "failed"
    assert f"저장 실패 {len(nos)}건" in job.error_message
    rows = _rows(db)
    assert all(rows[n].detail_fail_count == 0 for n in nos)


@pytest.mark.parametrize("job_fn,backfill,job_type", _PATHS)
def test_zero_success_hold_still_counts_revived_articles(db, monkeypatch, job_fn, backfill, job_type):
    """보류 회차(성공 0 + 실패 20건)에도 03:50 정비 잡이 CAP-1 로 되살린 매물만은 +1 → CAP 이 되어
    다음 회차 선정에서 빠진다. 나머지는 지금처럼 보류(0). 매물오류 차단기 revived_hits 와 같은 예외.

    호출측 except 가 db.rollback() 하므로 finish 안의 commit 이 없으면 +1 이 사라진다
    (뮤테이션 2026-10-07: 그 commit 줄을 지우면 이 시험이 FAIL).
    """
    cap = service_discover._DETAIL_FAIL_CAP
    nos = [f"R{i:02d}" for i in range(service_discover._ARTICLE_ERROR_SYSTEMIC_MIN)]
    _seed(db, nos, backfill=backfill)
    db.query(Article).filter(Article.article_no == "R05").update({"detail_fail_count": cap - 1})
    # 경계: CAP-2 매물은 되살린 매물이 아니라 보류 그대로(문턱이 CAP-2 로 느슨해지는 변이를 잡는다)
    db.query(Article).filter(Article.article_no == "R06").update({"detail_fail_count": cap - 2})
    db.commit()
    _patch(monkeypatch, bad=set(nos))

    job_fn(batch_size=50)

    job = _last_job(db, job_type)
    assert job.status == "failed"
    assert f"저장 실패 {len(nos)}건" in job.error_message
    rows = _rows(db)
    assert rows["R05"].detail_fail_count == cap
    assert rows["R06"].detail_fail_count == cap - 2
    assert all(rows[n].detail_fail_count == 0 for n in nos if n not in ("R05", "R06"))

    called = _patch(monkeypatch, bad=set(nos))
    job_fn(batch_size=50)
    assert "R05" not in called and len(called) == len(nos) - 1


@pytest.mark.parametrize("job_fn,backfill,job_type", _PATHS)
def test_zero_success_hold_revived_bump_failure_keeps_run_reason(db, monkeypatch, job_fn, backfill, job_type):
    """보류 회차에서 되살린 매물 +1 저장이 실패해도(DB 끊김 등) 회차 사유는 '상세 저장 0건'
    RuntimeError 그대로 남는다 — +1 저장 예외가 회차 사유를 덮어쓰지 않는다(#682 후속, 2026-10-08).
    +1 은 남지 않고(되돌림) 나머지는 보류(0) 그대로."""
    cap = service_discover._DETAIL_FAIL_CAP
    nos = [f"R{i:02d}" for i in range(service_discover._ARTICLE_ERROR_SYSTEMIC_MIN)]
    _seed(db, nos, backfill=backfill)
    db.query(Article).filter(Article.article_no == "R05").update({"detail_fail_count": cap - 1})
    db.commit()
    _patch(monkeypatch, bad=set(nos))

    def _boom(db, hits):
        raise OperationalError("UPDATE articles", {}, Exception("boom"))

    monkeypatch.setattr(service_discover._DetailSaveGuard, "_bump", staticmethod(_boom))

    job_fn(batch_size=50)

    job = _last_job(db, job_type)
    assert job.status == "failed"
    assert f"저장 실패 {len(nos)}건" in job.error_message
    assert "boom" not in job.error_message
    rows = _rows(db)
    assert rows["R05"].detail_fail_count == cap - 1
    assert all(rows[n].detail_fail_count == 0 for n in nos if n != "R05")


@pytest.mark.parametrize("job_fn,backfill,job_type", _PATHS)
def test_only_bad_articles_waiting_are_counted_until_cap(db, monkeypatch, job_fn, backfill, job_type):
    """대기 매물이 불량 3건뿐(상세 대기는 평소 거의 0)이면 회차마다 completed + 카운트 +1,
    상한에 닿으면 선정에서 빠져 끝없는 반복이 멈춘다(재검사 🟠 — 옛 판정은 매 회차 failed + 카운트 0)."""
    cap = service_discover._DETAIL_FAIL_CAP
    _seed(db, ["A", "B", "C"], backfill=backfill)
    _patch(monkeypatch, bad={"A", "B", "C"})

    for run in range(1, cap + 1):
        job_fn(batch_size=10)
        job = _last_job(db, job_type)
        assert job.status == "completed", f"{run}회차"
        assert job.error_message == "상세 저장 실패 3건 — 그 매물만 건너뛰고 다음 매물로 넘어갔어요"
        rows = _rows(db)
        assert [rows[n].detail_fail_count for n in "ABC"] == [run] * 3

    called = _patch(monkeypatch, bad={"A", "B", "C"})
    job_fn(batch_size=10)
    assert called == []


@pytest.mark.parametrize("job_fn,backfill,job_type", _PATHS)
def test_db_connection_error_is_not_counted(db, monkeypatch, job_fn, backfill, job_type):
    """OperationalError(DB 연결 계열)는 그 매물만 건너뛰되 detail_fail_count 는 그대로."""
    _seed(db, ["A", "B", "C"], backfill=backfill)
    _patch(monkeypatch, db_down={"B"})

    job_fn(batch_size=10)

    assert _last_job(db, job_type).status == "completed"
    rows = _rows(db)
    assert rows["B"].detail_fail_count == 0
    assert _filled(rows["A"], backfill) and _filled(rows["C"], backfill)


@pytest.mark.parametrize("job_fn,backfill,job_type", _PATHS)
def test_db_errors_without_success_stop_the_loop_early(db, monkeypatch, job_fn, backfill, job_type):
    """DB 연결 계열 오류가 성공 없이 3건 쌓이면 바로 멈춘다 — 4번째 매물은 네이버를 부르지 않는다."""
    _seed(db, ["A", "B", "C", "D", "E"], backfill=backfill)
    called = _patch(monkeypatch, db_down={"A", "B", "C"})

    job_fn(batch_size=10)

    assert _last_job(db, job_type).status == "failed"
    assert called == ["A", "B", "C"]


@pytest.mark.parametrize("job_fn,backfill,job_type", _PATHS)
def test_db_error_run_resets_after_success(db, monkeypatch, job_fn, backfill, job_type):
    """DB 오류 → 저장 성공 → DB 오류 2건: 성공이 연속 수를 0 으로 돌려 조기 중단하지 않는다."""
    _seed(db, ["A", "B", "C", "D", "E"], backfill=backfill)
    called = _patch(monkeypatch, db_down={"A", "C", "D"})

    job_fn(batch_size=10)

    assert _last_job(db, job_type).status == "completed"
    assert called == ["A", "B", "C", "D", "E"]
    rows = _rows(db)
    assert _filled(rows["B"], backfill) and _filled(rows["E"], backfill)


def test_failed_article_update_is_rolled_back(db, monkeypatch):
    """B 의 UPDATE 가 실행된 **뒤** commit 단계에서 실패해도 B 의 변경은 저장되지 않고 카운터만 +1.

    rollback 이 없으면 B 의 UPDATE 가 다음 commit 에 실려 저장돼 버린다(이 시험이 그걸 잡는다).
    """
    _seed(db, ["A", "B", "C"], backfill=False)
    _patch(monkeypatch)
    real_factory = service_discover.SessionLocal
    state = {"fail_next_commit": False}

    def _detail(an):
        state["fail_next_commit"] = an == "B"
        return {"articleDetail": {"articleNo": an, "aptHeatMethodTypeName": "개별난방"}}

    def _factory():
        session = real_factory()
        real_commit = session.commit

        def _commit():
            if state["fail_next_commit"]:
                state["fail_next_commit"] = False
                raise ValueError("commit 단계 실패 주입")
            real_commit()

        session.commit = _commit
        return session

    monkeypatch.setattr(service_discover.NaverEstateAPI, "get_article_detail", staticmethod(_detail))
    monkeypatch.setattr(service_discover, "SessionLocal", _factory)

    crawl_article_details(batch_size=10)

    rows = _rows(db)
    assert rows["B"].detail_crawled is False
    assert rows["B"].heating_type is None
    assert rows["B"].detail_fail_count == 1
    assert rows["A"].detail_crawled is True and rows["C"].detail_crawled is True
    assert _last_job(db, "article_detail").status == "completed"


def test_failed_article_at_cap_leaves_selection(db, monkeypatch):
    """상한 직전(CAP-1) 매물이 저장 실패하면 CAP 이 되어 다음 회차 선정에서 빠진다(무한 재선정 방지)."""
    _seed(db, ["A", "B"], backfill=False)
    db.query(Article).filter(Article.article_no == "B").update(
        {"detail_fail_count": service_discover._DETAIL_FAIL_CAP - 1}
    )
    db.commit()
    _patch(monkeypatch, bad={"B"})

    crawl_article_details(batch_size=10)
    assert _rows(db)["B"].detail_fail_count == service_discover._DETAIL_FAIL_CAP

    called = _patch(monkeypatch)
    crawl_article_details(batch_size=10)
    assert "B" not in called


def test_exc_head_drops_newlines_and_sql_params():
    """로그용 예외 문구 — 개행 제거·200자 이내, SQLAlchemy 예외는 [parameters](매물 값) 없이 원 메시지만."""
    from sqlalchemy.exc import StatementError

    e = StatementError("bad value", "UPDATE articles SET x=?", {"x": "비밀값"}, ValueError("줄1\n줄2"))
    head = service_discover._exc_head(e)
    assert head == "줄1 줄2"
    assert len(service_discover._exc_head(ValueError("가" * 500))) == 200
