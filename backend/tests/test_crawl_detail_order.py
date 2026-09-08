"""상세 보강 크롤 신선도 우선 + transient 오류 분리 회귀 가드.

배경 (이 세션): crawl_article_details 후보 선택에 ORDER BY 가 없어 heap 순서(오래된 것 먼저)로
2.5개월 묵은 죽은 매물(상세 API 404)부터 픽 → 최근 10배치 100% dead(filled 0)로 헛돌았다.
라이브 실측: last_seen 최신 매물은 상세 API 100% OK, 오래된 매물은 100% NotExistInformation.

수정:
- 변경1: ORDER BY last_seen_at DESC nullslast → 신선(살아있는) 매물 먼저 픽.
- 변경2: transient 오류(401/403/429/5xx/네트워크 = error 값이 문자열)는 비활성화 안 함.
  진짜 dead(error.code == NotExistInformation)만 is_active=False. 신선도 우선으로 배치 앞이
  살아있는 매물이라, 일시 오류로 살아있는 매물을 잘못 끊는 것을 막는다.
"""
from datetime import datetime, timedelta, timezone

import pytest

from crawler import service_discover
from crawler.service_discover import (
    _ARTICLE_ERROR_SYSTEMIC_MIN,
    _DETAIL_FAIL_CAP,
    _is_article_error,
    _is_dead_detail,
    crawl_article_details,
)
from db.models import Article, CrawlJob


def _make_pending_article(
    db, article_no: str, last_seen: datetime, fail_count: int = 0
) -> None:
    """detail_crawled=False, is_active=True 인 상세 미완 매물 1건 심기.

    fail_count = 매물 단위 오류 누적 횟수(세션 395, V056). 기본 0 = 실패 이력 없음.
    """
    db.add(
        Article(
            article_no=article_no,
            complex_no="100",
            trade_type_name="매매",
            detail_crawled=False,
            is_active=True,
            last_seen_at=last_seen,
            detail_fail_count=fail_count,
        )
    )
    db.commit()


@pytest.fixture
def no_throttle(monkeypatch):
    """throttle.wait() 1.5초 대기 제거 + record_call no-op (테스트 속도/격리)."""
    monkeypatch.setattr(service_discover._throttle_details, "wait", lambda: None)
    monkeypatch.setattr(service_discover, "record_call", lambda *a, **k: None)


# ── _is_dead_detail 단위 ──

def test_is_dead_detail_true_for_not_exist():
    """NotExistInformation = 진짜 dead → True."""
    assert _is_dead_detail(
        {"error": {"code": "errorCode.NotExistInformation", "message": "없음"}}
    ) is True


def test_is_dead_detail_false_for_transient_string_error():
    """transient(문자열 error) = 일시 오류 → False (비활성화 안 함)."""
    assert _is_dead_detail({"error": "API 인증 실패 (HTTP 403)"}) is False
    assert _is_dead_detail({"error": "데이터 조회 중 오류 발생: timeout"}) is False


def test_is_dead_detail_false_for_unknown_code():
    """알 수 없는 error code = 보수적으로 transient 취급(살아있는 매물 보호) → False."""
    assert _is_dead_detail({"error": {"code": "errorCode.SomethingElse"}}) is False


def test_is_dead_detail_false_for_non_dict():
    assert _is_dead_detail(None) is False
    assert _is_dead_detail("oops") is False


# ── 검증 A: 신선도 우선 (최신 last_seen 부터 호출) ──

def test_crawl_orders_by_last_seen_desc(db, no_throttle, monkeypatch):
    """last_seen 최신 매물부터 상세 API 가 호출되는지 (호출 순서 캡처)."""
    now = datetime.now(timezone.utc)
    # 일부러 오래된 것부터 insert (heap 순서면 오래된 게 먼저 나옴)
    _make_pending_article(db, "OLD", now - timedelta(days=60))
    _make_pending_article(db, "MID", now - timedelta(days=10))
    _make_pending_article(db, "NEW", now - timedelta(minutes=5))

    called_order: list[str] = []

    def _fake_detail(article_no):
        called_order.append(article_no)
        # 전부 정상 응답 (채움)
        return {"articleDetail": {"articleNo": article_no}}

    monkeypatch.setattr(
        service_discover.NaverEstateAPI, "get_article_detail", staticmethod(_fake_detail)
    )

    crawl_article_details(batch_size=10)

    # 신선도 우선: NEW → MID → OLD 순
    assert called_order == ["NEW", "MID", "OLD"]


# ── 검증 B: transient 오류는 비활성화 안 함 ──

def test_transient_error_keeps_article_active(db, no_throttle, monkeypatch):
    """일시 오류(문자열 error) 매물은 is_active=True 유지 + detail_crawled=False (재시도)."""
    now = datetime.now(timezone.utc)
    _make_pending_article(db, "TRANSIENT", now)

    monkeypatch.setattr(
        service_discover.NaverEstateAPI,
        "get_article_detail",
        staticmethod(lambda an: {"error": "API 요청 실패: 상태 코드 502"}),
    )

    crawl_article_details(batch_size=10)

    db.expire_all()
    row = db.query(Article).filter(Article.article_no == "TRANSIENT").one()
    assert row.is_active is True          # 살아있는 매물 보호
    assert row.detail_crawled is False    # 다음 배치 재시도


# ── 검증 C: 진짜 dead 는 비활성화 ──

def test_dead_error_deactivates_article(db, no_throttle, monkeypatch):
    """NotExistInformation 매물은 is_active=False + detail_crawled=True."""
    now = datetime.now(timezone.utc)
    _make_pending_article(db, "DEAD", now)

    monkeypatch.setattr(
        service_discover.NaverEstateAPI,
        "get_article_detail",
        staticmethod(
            lambda an: {"error": {"code": "errorCode.NotExistInformation", "message": "없음"}}
        ),
    )

    crawl_article_details(batch_size=10)

    db.expire_all()
    row = db.query(Article).filter(Article.article_no == "DEAD").one()
    assert row.is_active is False
    assert row.detail_crawled is True


# ── 세션 342: 배치 commit expire 후에도 정상 처리 (lazy-load 제거 회귀) ──

def test_crawl_survives_batch_commit_expire(db, no_throttle, monkeypatch):
    """50건 배치 commit 경계를 넘어도 모든 매물이 정상 처리된다.

    배경: 루프 전 속성 선추출 전에는 50건마다 db.commit()(expire_on_commit=True)이
    art 객체를 expired 시켜 다음 순회 art.article_no 접근이 PK 재조회 lazy-load 를
    유발했다(부하 시 timeout 방아쇠, 세션 342). 선추출 후엔 commit 후에도 ORM 재접근이
    없어 51건째(commit 경계 다음)도 정상 처리되어야 한다.
    """
    now = datetime.now(timezone.utc)
    # 51건 심기 (50건 commit 경계 + 1) — 최신순 정렬이라 역순 last_seen
    for i in range(51):
        _make_pending_article(db, f"A{i:03d}", now - timedelta(minutes=i))

    processed_nos: list[str] = []

    def _fake_detail(article_no):
        processed_nos.append(article_no)
        return {"articleDetail": {"articleNo": article_no}}

    monkeypatch.setattr(
        service_discover.NaverEstateAPI, "get_article_detail", staticmethod(_fake_detail)
    )

    crawl_article_details(batch_size=51)

    # 51건 전부 상세 API 호출됨 (commit 경계 후 lazy-load 실패 없이)
    assert len(processed_nos) == 51
    # commit 경계(50) 다음 51번째도 정상 처리 — 선추출 값으로 article_no 정확 전달
    db.expire_all()
    done = db.query(Article).filter(Article.detail_crawled == True).count()
    assert done == 51


# ── 세션 393: 소배치 total_items 유실 회귀 (prod job 49181 = 0/39) ──

def test_small_batch_persists_total_items(db, no_throttle, monkeypatch):
    """50건 미만 배치도 total_items 가 DB 에 저장된다.

    배경: autoflush=False 라 job.total_items 대입이 메모리에만 남고, 50건 배치
    commit 이 안 오는 소배치에서는 _finalize_job 의 db.refresh(job) 이 그 대입을
    버려 default=0 으로 복원했다(prod job 49181 = total 0 / processed 39).

    뮤테이션 검증(세션 393): 선추출 뒤 db.commit() 을 제거하면 이 테스트가
    `assert 0 == 3` 로 실패한다(processed_items 는 3 으로 맞아 결함이 total 만 갉아먹음).
    """
    now = datetime.now(timezone.utc)
    for i in range(3):
        _make_pending_article(db, f"S{i}", now - timedelta(minutes=i))

    monkeypatch.setattr(
        service_discover.NaverEstateAPI,
        "get_article_detail",
        staticmethod(lambda an: {"articleDetail": {"articleNo": an}}),
    )

    crawl_article_details(batch_size=10)

    # 크롤 내부 세션과 별개인 db fixture 세션으로 재조회 = "DB 에 실제 저장된 값"
    db.expire_all()
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "article_detail").one()
    assert job.total_items == 3
    assert job.processed_items == 3
    assert job.status == "completed"


def test_small_batch_total_items_counts_dead_articles(db, no_throttle, monkeypatch):
    """total_items 는 '시도한 건수', processed_items 는 '채운 건수' — 두 축이 갈린다.

    dead(NotExistInformation) 1건이 섞이면 total 3 / processed 2 여야 한다.
    두 값을 일부러 다르게 둬, total 자리에 processed 를 넣는 오류도 잡는다.
    """
    now = datetime.now(timezone.utc)
    _make_pending_article(db, "OK1", now)
    _make_pending_article(db, "OK2", now - timedelta(minutes=1))
    _make_pending_article(db, "GONE", now - timedelta(minutes=2))

    def _fake_detail(article_no):
        if article_no == "GONE":
            return {"error": {"code": "errorCode.NotExistInformation", "message": "없음"}}
        return {"articleDetail": {"articleNo": article_no}}

    monkeypatch.setattr(
        service_discover.NaverEstateAPI, "get_article_detail", staticmethod(_fake_detail)
    )

    crawl_article_details(batch_size=10)

    db.expire_all()
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "article_detail").one()
    assert job.total_items == 3      # 시도 3건 (dead 포함)
    assert job.processed_items == 2  # 실제 채운 건 2건


# ── 세션 395: 매물 단위 오류 무한 재시도 상한 (V056 detail_fail_count) ──

def test_is_article_error_true_for_unknown_dict_code():
    """error 가 dict 이고 code 가 dead 집합 밖 = 매물 단위 오류 → True."""
    assert _is_article_error(
        {"error": {"code": "ERROR", "message": "알수없는 오류(시스템 오류)"}}
    ) is True


def test_is_article_error_false_for_string_and_dead_and_none():
    """문자열 오류(전체 장애)·진짜 dead·비 dict 는 카운트 대상이 아니다."""
    # 시스템성 transient — 세면 네이버 장애 시 살아있는 매물이 무더기 제외된다
    assert _is_article_error({"error": "API 요청 실패: 상태 코드 503"}) is False
    # 진짜 dead 는 별도 비활성화 경로 소관
    assert _is_article_error(
        {"error": {"code": "errorCode.NotExistInformation", "message": "없음"}}
    ) is False
    assert _is_article_error(None) is False
    assert _is_article_error({"articleDetail": {}}) is False


def test_article_error_increments_fail_count_without_touching_flags(
    db, no_throttle, monkeypatch
):
    """매물 단위 dict 오류(code 'ERROR') → detail_fail_count +1, 플래그는 불변.

    라이브 실측(2026-09-08) 매물 2643869752 재현: HTTP 200 + dict 오류라 dead 도
    아니고 문자열 transient 도 아닌 제3의 갈래. is_active 를 건드리지 않는 것이
    핵심(살아있는 매물 오비활성화 금지 원칙 유지).

    뮤테이션 검증(세션 395): 루프의 detail_fail_count +1 UPDATE 를 제거하면 이
    테스트가 `assert 0 == 1` 로 실패한다.
    """
    now = datetime.now(timezone.utc)
    _make_pending_article(db, "ARTERR", now)

    monkeypatch.setattr(
        service_discover.NaverEstateAPI,
        "get_article_detail",
        staticmethod(
            lambda an: {"error": {"code": "ERROR", "message": "알수없는 오류(시스템 오류)"}}
        ),
    )

    crawl_article_details(batch_size=10)

    db.expire_all()
    row = db.query(Article).filter(Article.article_no == "ARTERR").one()
    assert row.detail_fail_count == 1
    assert row.is_active is True         # 살아있는 매물 보호 (dead 취급 금지)
    assert row.detail_crawled is False   # 상한 전까지는 재시도 여지 유지


def test_article_error_at_cap_excluded_from_next_batch(db, no_throttle, monkeypatch):
    """상한 도달 매물은 다음 배치 선정 쿼리에서 제외돼 재시도가 멈춘다.

    CAP-1 상태로 심고 1회 실행 → CAP 도달. 2회차 실행에서는 상세 API 가 아예
    호출되지 않아야 한다(= 무한 재시도 차단의 본질).
    """
    now = datetime.now(timezone.utc)
    _make_pending_article(db, "NEARCAP", now, fail_count=_DETAIL_FAIL_CAP - 1)

    calls: list[str] = []

    def _fake_detail(article_no):
        calls.append(article_no)
        return {"error": {"code": "ERROR", "message": "알수없는 오류(시스템 오류)"}}

    monkeypatch.setattr(
        service_discover.NaverEstateAPI, "get_article_detail", staticmethod(_fake_detail)
    )

    crawl_article_details(batch_size=10)  # 1회차: 호출됨 → CAP 도달
    assert calls == ["NEARCAP"]

    db.expire_all()
    row = db.query(Article).filter(Article.article_no == "NEARCAP").one()
    assert row.detail_fail_count == _DETAIL_FAIL_CAP
    assert row.is_active is True  # 상한은 "시도 중단"이지 "매물 비활성화"가 아니다

    crawl_article_details(batch_size=10)  # 2회차: 선정에서 제외 → 추가 호출 0
    assert calls == ["NEARCAP"]


def test_string_error_does_not_increment_fail_count(db, no_throttle, monkeypatch):
    """문자열 오류(HTTP 503 등 전체 장애)는 detail_fail_count 를 올리지 않는다.

    네이버 장애 몇 시간이면 살아있는 매물 수백 개가 한꺼번에 상한에 걸려 상세
    보강 대상에서 통째로 빠지는 사고를 막는 갈래 분리의 회귀 가드.
    """
    now = datetime.now(timezone.utc)
    _make_pending_article(db, "SYSDOWN", now)

    monkeypatch.setattr(
        service_discover.NaverEstateAPI,
        "get_article_detail",
        staticmethod(lambda an: {"error": "API 요청 실패: 상태 코드 503"}),
    )

    crawl_article_details(batch_size=10)

    db.expire_all()
    row = db.query(Article).filter(Article.article_no == "SYSDOWN").one()
    assert row.detail_fail_count == 0     # 카운트 금지
    assert row.is_active is True
    assert row.detail_crawled is False


def test_dead_and_ok_paths_unchanged_by_fail_count(db, no_throttle, monkeypatch):
    """회귀: dead 는 여전히 비활성화, 정상 응답은 여전히 processed — 둘 다 카운터 불변."""
    now = datetime.now(timezone.utc)
    _make_pending_article(db, "OKROW", now)
    _make_pending_article(db, "DEADROW", now - timedelta(minutes=1))

    def _fake_detail(article_no):
        if article_no == "DEADROW":
            return {"error": {"code": "errorCode.NotExistInformation", "message": "없음"}}
        return {"articleDetail": {"articleNo": article_no}}

    monkeypatch.setattr(
        service_discover.NaverEstateAPI, "get_article_detail", staticmethod(_fake_detail)
    )

    crawl_article_details(batch_size=10)

    db.expire_all()
    ok = db.query(Article).filter(Article.article_no == "OKROW").one()
    assert ok.detail_crawled is True
    assert ok.detail_fail_count == 0

    dead = db.query(Article).filter(Article.article_no == "DEADROW").one()
    assert dead.is_active is False
    assert dead.detail_crawled is True
    assert dead.detail_fail_count == 0  # dead 는 별도 경로 — 카운트하지 않는다

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "article_detail").one()
    assert job.total_items == 2
    assert job.processed_items == 1


# ── 세션 395 (후속): 배치 전수 매물오류 = 소프트 차단 의심 → 카운트 보류 ──

def test_systemic_all_error_batch_holds_fail_count(db, no_throttle, monkeypatch):
    """판정 가능한 크기의 배치가 **전수** 매물단위 오류면 카운트를 보류한다.

    위험: 네이버가 봇 의심 세션에 모든 매물로 HTTP 200 + dict 오류를 일괄 반환하는
    앱 레벨 소프트 차단을 하면, 그걸 매물 하나하나의 문제로 세어 살아있는 매물이
    6회(≈3시간) 뒤 통째로 상한에 걸린다(24시간 차단이면 최대 800건). 문자열 오류를
    안 세는 것과 같은 결의 안전핀.

    뮤테이션 검증(세션 395): 차단기 조건(systemic_suspected)을 False 로 고정하면 이
    테스트가 `assert [1, 1, ...] == [0, 0, ...]` 로 실패한다(전 건이 +1 됨).
    """
    now = datetime.now(timezone.utc)
    total = _ARTICLE_ERROR_SYSTEMIC_MIN  # 임계 정확히 충족 (경계값)
    for i in range(total):
        _make_pending_article(db, f"SYS{i:03d}", now - timedelta(minutes=i))

    monkeypatch.setattr(
        service_discover.NaverEstateAPI,
        "get_article_detail",
        staticmethod(
            lambda an: {"error": {"code": "ERROR", "message": "알수없는 오류(시스템 오류)"}}
        ),
    )

    crawl_article_details(batch_size=total)

    db.expire_all()
    rows = db.query(Article).filter(Article.article_no.like("SYS%")).all()
    assert len(rows) == total
    # 전수 오류 = 소프트 차단 의심 → 한 건도 올리지 않는다
    assert [r.detail_fail_count for r in rows] == [0] * total
    # 플래그는 어느 경우에도 불변
    assert all(r.is_active is True and r.detail_crawled is False for r in rows)


def test_partial_error_batch_still_counts(db, no_throttle, monkeypatch):
    """전수가 아니면(1건이라도 정상) 차단기가 발동하지 않고 그대로 카운트한다.

    "같은 시각 다른 매물은 정상"이라는 대조군이 있으면 개별 매물 문제로 확정할 수
    있으므로 원래 목적(무한 재시도 차단)을 유지해야 한다.
    """
    now = datetime.now(timezone.utc)
    total = _ARTICLE_ERROR_SYSTEMIC_MIN
    for i in range(total):
        _make_pending_article(db, f"MIX{i:03d}", now - timedelta(minutes=i))

    def _fake_detail(article_no):
        if article_no == "MIX000":  # 1건만 정상 = 대조군
            return {"articleDetail": {"articleNo": article_no}}
        return {"error": {"code": "ERROR", "message": "알수없는 오류(시스템 오류)"}}

    monkeypatch.setattr(
        service_discover.NaverEstateAPI, "get_article_detail", staticmethod(_fake_detail)
    )

    crawl_article_details(batch_size=total)

    db.expire_all()
    ok = db.query(Article).filter(Article.article_no == "MIX000").one()
    assert ok.detail_crawled is True
    assert ok.detail_fail_count == 0

    errored = (
        db.query(Article)
        .filter(Article.article_no.like("MIX%"), Article.article_no != "MIX000")
        .all()
    )
    assert len(errored) == total - 1
    assert [r.detail_fail_count for r in errored] == [1] * (total - 1)
