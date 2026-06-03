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
from crawler.service_discover import _is_dead_detail, crawl_article_details
from db.models import Article


def _make_pending_article(db, article_no: str, last_seen: datetime) -> None:
    """detail_crawled=False, is_active=True 인 상세 미완 매물 1건 심기."""
    db.add(
        Article(
            article_no=article_no,
            complex_no="100",
            trade_type_name="매매",
            detail_crawled=False,
            is_active=True,
            last_seen_at=last_seen,
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
