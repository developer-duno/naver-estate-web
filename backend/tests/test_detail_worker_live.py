"""온디맨드 상세 워커(routers/live/_detail_worker) 회귀 가드 — 첫 테스트.

배경 (세션 396, 백로그 §5-L): 사용자가 단지를 열 때 도는 온디맨드 상세 경로에는
상세 보강 배치(crawler/service_discover.crawl_article_details)에 있는
`detail_fail_count < DETAIL_FAIL_CAP` 필터가 없어, 배치가 이미 포기한 상한 매물을
클릭할 때마다 다시 긁고 있었다. 이 파일은 그 필터와, 필터가 만드는 부수 효과
(total/skipped 집계·실패율 판정 모집단)를 고정한다.

⚠ 네이버 실호출 금지 — `NaverEstateAPI.get_article_detail` 을 monkeypatch 하고
`DETAIL_CRAWL_DELAY` 를 0 으로 낮춰(sleep 제거) 결정론적으로 돌린다.
"""

import pytest

from db.models import Article
from routers.live import _detail_worker
from shared.constants import DETAIL_FAIL_CAP


def _make_article(
    db,
    article_no: str,
    *,
    complex_no: str = "100",
    fail_count: int = 0,
    detail_crawled: bool = False,
    is_active: bool = True,
) -> None:
    """상세 미완 매물 1건 심기.

    tests/test_crawl_detail_order.py `_make_pending_article` 패턴 답습 —
    온디맨드 워커는 last_seen_at 정렬을 쓰지 않아 그 컬럼만 생략했다.
    """
    db.add(
        Article(
            article_no=article_no,
            complex_no=complex_no,
            trade_type_name="매매",
            detail_crawled=detail_crawled,
            is_active=is_active,
            detail_fail_count=fail_count,
        )
    )
    db.commit()


@pytest.fixture
def no_delay(monkeypatch):
    """건별 0.3초 대기 + 네이버 콜 카운터 제거 (테스트 속도·격리)."""
    monkeypatch.setattr(_detail_worker, "DETAIL_CRAWL_DELAY", 0)
    monkeypatch.setattr(_detail_worker, "record_call", lambda *a, **k: None)


@pytest.fixture
def status_calls(monkeypatch):
    """_update_crawl_status 호출 인자를 순서대로 기록 (전역 _crawl_status 오염 0)."""
    calls: list[dict] = []

    def _fake(complex_no: str, **kwargs):
        calls.append({"complex_no": complex_no, **kwargs})

    monkeypatch.setattr(_detail_worker, "_update_crawl_status", _fake)
    return calls


def _patch_detail(monkeypatch, calls: list[str], failures: set[str] | None = None):
    """get_article_detail 을 가짜로 교체. failures 에 든 매물만 error 응답."""
    failures = failures or set()

    def _fake(article_no):
        calls.append(article_no)
        if article_no in failures:
            return {"error": {"code": "ERROR", "message": "알수없는 오류(시스템 오류)"}}
        return {"articleDetail": {"articleNo": article_no}}

    monkeypatch.setattr(
        _detail_worker.NaverEstateAPI, "get_article_detail", staticmethod(_fake)
    )


def test_detail_worker_excludes_capped_articles(db, no_delay, status_calls, monkeypatch):
    """상한(CAP) 도달 매물은 온디맨드 경로에서도 안 긁는다 + skipped 로 집계된다.

    ⚠ 뮤테이션 검증(2026-09-10 실측): _detail_worker 의 선정 쿼리에서
    `ArticleModel.detail_fail_count < DETAIL_FAIL_CAP,` 줄을 지우면 이 테스트가
    `assert ['NEARCAP'] == ['CAPPED', 'NEARCAP']` 류로 FAIL 한다.
    """
    _make_article(db, "CAPPED", fail_count=DETAIL_FAIL_CAP)
    _make_article(db, "NEARCAP", fail_count=DETAIL_FAIL_CAP - 1)

    calls: list[str] = []
    _patch_detail(monkeypatch, calls)

    _detail_worker._crawl_details_for_complex(db, "100")

    assert calls == ["NEARCAP"], "상한 매물이 온디맨드 경로에서 재시도됐다"
    first = status_calls[0]
    assert first["detail_total"] == 1
    # 상한 매물은 "이번에 상세를 안 긁는 매물"이라 skipped 에 합산된다 (의도된 집계)
    assert first["detail_skipped_count"] == 1

    db.expire_all()
    capped = db.query(Article).filter(Article.article_no == "CAPPED").one()
    # 온디맨드 경로는 카운터를 올리지도 내리지도 않는다 → 정비 잡(03:50)과 경합 0
    assert capped.detail_fail_count == DETAIL_FAIL_CAP
    assert capped.is_active is True


def test_detail_worker_done_partial_uses_filtered_total(
    db, no_delay, status_calls, monkeypatch
):
    """실패율 판정 모집단은 필터 **후** total 이다 (상한 매물이 분모를 부풀리지 않는다).

    상한 3건 + 정상 2건(그중 1건 실패) → total=2, 실패 1 → 0.5 는 임계(0.5) '초과'가
    아니므로 done_partial 없음. 필터가 없어 total=5 가 되면 분모가 달라져 판정 자체가
    무의미해진다(실패 1/5 = 0.2).
    """
    for i in range(3):
        _make_article(db, f"CAP{i}", fail_count=DETAIL_FAIL_CAP)
    _make_article(db, "OK1")
    _make_article(db, "BAD1")

    calls: list[str] = []
    _patch_detail(monkeypatch, calls, failures={"BAD1"})

    _detail_worker._crawl_details_for_complex(db, "100")

    assert sorted(calls) == ["BAD1", "OK1"]
    assert status_calls[0]["detail_total"] == 2
    assert status_calls[0]["detail_skipped_count"] == 3
    assert not [c for c in status_calls if c.get("status") == "done_partial"], (
        "실패율 0.5 는 임계 초과가 아닌데 done_partial 이 찍혔다"
    )


def test_detail_worker_done_partial_when_majority_fails(
    db, no_delay, status_calls, monkeypatch
):
    """반례 — 정상 3건 중 2건 실패(2/3 > 0.5)면 done_partial 이 찍힌다."""
    _make_article(db, "OK1")
    _make_article(db, "BAD1")
    _make_article(db, "BAD2")

    calls: list[str] = []
    _patch_detail(monkeypatch, calls, failures={"BAD1", "BAD2"})

    _detail_worker._crawl_details_for_complex(db, "100")

    assert len(calls) == 3
    assert [c for c in status_calls if c.get("status") == "done_partial"], (
        "실패율 2/3 인데 done_partial 이 안 찍혔다"
    )


def test_detail_worker_commits_each_update(db, no_delay, status_calls, monkeypatch):
    """순회마다 commit — 배치 commit 이 잡던 articles 행 잠금 장기 점유 차단 (A1 가드).

    옛 DETAIL_COMMIT_INTERVAL(50건) 배치 commit 은 UPDATE 가 잡은 행 잠금을 최대
    50건 × (0.3s + throttle) 동안 쥔 채 다음 fetch 를 기다려, 같은 매물을 upsert 하는
    인기 크롤·12h 배치를 8초 statement_timeout 으로 잘랐다(세션 396).
    """
    for i in range(3):
        _make_article(db, f"OK{i}")

    calls: list[str] = []
    _patch_detail(monkeypatch, calls)

    commits = {"n": 0}
    orig_commit = db.commit

    def _counting_commit():
        commits["n"] += 1
        return orig_commit()

    monkeypatch.setattr(db, "commit", _counting_commit)

    _detail_worker._crawl_details_for_complex(db, "100")

    assert len(calls) == 3
    assert commits["n"] >= 3, f"순회별 commit 이 안 일어났다 (commit {commits['n']}회)"

    db.expire_all()
    rows = db.query(Article).filter(Article.article_no.like("OK%")).all()
    assert all(r.detail_crawled is True for r in rows)


def test_detail_worker_all_capped_reports_zero_total(
    db, no_delay, status_calls, monkeypatch
):
    """전부 상한이면 네이버 콜 0 + total=0·skipped=N 으로 즉시 종료한다."""
    for i in range(2):
        _make_article(db, f"CAP{i}", fail_count=DETAIL_FAIL_CAP)

    calls: list[str] = []
    _patch_detail(monkeypatch, calls)

    _detail_worker._crawl_details_for_complex(db, "100")

    assert calls == [], "상한 매물뿐인데 네이버를 호출했다"
    assert status_calls == [
        {
            "complex_no": "100",
            "detail_total": 0,
            "detail_crawled_count": 0,
            "detail_skipped_count": 2,
        }
    ]


def test_detail_worker_rollback_called_on_update_error(
    db, no_delay, status_calls, monkeypatch
):
    """UPDATE 가 터지면 db.rollback() 을 호출하고 다음 매물을 계속 처리한다.

    세션 396 사후검증(mut-3): `db.rollback()` 예외 경로가 어떤 테스트에도 안 닿았다.
    PostgreSQL 이면 rollback 없이 다음 순회 commit 이 InFailedSqlTransaction 으로
    연쇄 실패하지만, **SQLite 는 aborted 트랜잭션 상태가 없어 그 증상이 재현되지 않는다**
    (실측: rollback 줄을 지워도 결과가 같음 — dialect 한계).

    그래서 "결과"가 아니라 **rollback 호출 자체**를 단언한다. 뮤테이션 검증:
    `_detail_worker.py` 의 `db.rollback()` 을 지우면 아래 `rollbacks` 가 0 이 되어 FAIL.
    """
    _make_article(db, "BAD1")
    _make_article(db, "OK1")

    calls: list[str] = []
    _patch_detail(monkeypatch, calls)

    rollbacks = {"n": 0}
    real_rollback = db.rollback

    def _counting_rollback():
        rollbacks["n"] += 1
        return real_rollback()

    monkeypatch.setattr(db, "rollback", _counting_rollback)

    real_update = _detail_worker.build_detail_update_dict

    def _boom(domain_article, detail_data):
        if domain_article.article_no == "BAD1":
            raise RuntimeError("simulated DB error")
        return real_update(domain_article, detail_data)

    monkeypatch.setattr(_detail_worker, "build_detail_update_dict", _boom)

    _detail_worker._crawl_details_for_complex(db, "100")

    assert rollbacks["n"] >= 1, "UPDATE 예외에서 db.rollback() 이 호출되지 않았다"
    # 실패 뒤에도 나머지 매물이 계속 처리된다 (조기 종료 없음)
    assert set(calls) == {"BAD1", "OK1"}
    db.expire_all()
    assert db.query(Article).filter(Article.article_no == "OK1").one().detail_crawled is True
    assert db.query(Article).filter(Article.article_no == "BAD1").one().detail_crawled is False
