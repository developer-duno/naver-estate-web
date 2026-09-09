"""인기 크롤 부모 잡이 자식(단지별) 실패를 집계하는지 회귀 가드 (세션 396).

배경(2026-09-09 사건): crawl_complex_articles 는 예외를 자체 흡수하고 아무것도 반환하지
않았다(return 문 0개). 부모 crawl_popular_complexes 는 그 호출을 try/except 로 감싸고
성공 시 processed += 1 을 했는데, 자식이 예외를 던지지 않으니 except 는 도달 불가 —
자식 잡 13건이 failed 인데 부모 잡은 50/50 completed·error_message None 으로 보고했다.
부모의 "failed>0 이면 error_message 를 남기는" 분기는 죽은 코드였다.

수정: crawl_complex_articles 가 성공 True / 실패 False 를 반환하고, 부모가 그 값으로
processed·failed 를 가른다.
"""

from unittest.mock import patch

from crawler import service_discover
from db.models import CrawlJob
from services.upsert import upsert_complex_from_search
from utils import utcnow


def _make_complex_data(complex_no, name="테스트단지"):
    return {
        "complexNo": complex_no,
        "complexName": f"{name}{complex_no}",
        "cortarNo": "1168010100",
        "realEstateTypeCode": "APT",
    }


def _make_articles_response(article_no="a-1"):
    return {
        "articleList": [
            {"articleNo": article_no, "tradeTypeName": "매매", "dealOrWarrantPrc": "100,000"},
        ],
        "isMoreData": False,
    }


@patch("services.enricher.NaverEstateAPI")
@patch("crawler.service_discover.NaverEstateAPI")
def test_parent_job_counts_child_failure(mock_api, _mock_detail_api, db, monkeypatch):
    """자식 1건이 실패하면 부모 잡이 processed 1 / total 2 + error_message 를 남긴다.

    뮤테이션(세션 396 확인): 부모가 반환값을 무시하고 무조건 processed += 1 하도록
    되돌리면 processed_items 가 2 가 되고 error_message 가 None 이라 FAIL 한다.
    """
    for no in ("p1", "p2"):
        upsert_complex_from_search(db, _make_complex_data(no))
    # 인기 단지 선정 조건 = last_crawled_at IS NOT NULL
    from db.models import Complex as ComplexModel
    db.query(ComplexModel).filter(ComplexModel.complex_no.in_(["p1", "p2"])).update(
        {"last_crawled_at": utcnow()}, synchronize_session=False
    )
    db.commit()

    def _fake_articles(complex_no, page=1):
        if complex_no == "p2":
            raise RuntimeError("네이버 매물 목록 실패")
        return _make_articles_response(f"a-{complex_no}")

    mock_api.get_complex_articles.side_effect = _fake_articles
    monkeypatch.setattr(service_discover._throttle_articles, "wait", lambda *a, **k: None)
    monkeypatch.setattr(service_discover, "record_call", lambda *a, **k: None)

    service_discover.crawl_popular_complexes(batch_size=10)

    db.expire_all()
    parent = db.query(CrawlJob).filter(CrawlJob.job_type == "popular_crawl").one()
    assert parent.status == "completed"          # 일부 성공이므로 completed 유지
    assert parent.total_items == 2
    assert parent.processed_items == 1           # 실패 1건이 성공으로 집계되지 않는다
    assert parent.error_message is not None
    assert "1/2개 단지 실패" in parent.error_message
    assert "p2" in parent.error_message

    children = db.query(CrawlJob).filter(CrawlJob.job_type == "complex_articles").all()
    statuses = sorted(c.status for c in children)
    assert statuses == ["completed", "failed"]


@patch("services.enricher.NaverEstateAPI")
@patch("crawler.service_discover.NaverEstateAPI")
def test_crawl_complex_articles_returns_true_on_success(mock_api, _mock_detail_api, db, monkeypatch):
    """성공 경로는 True, 예외 흡수 경로는 False 를 반환한다(예외는 여전히 안 던진다)."""
    upsert_complex_from_search(db, _make_complex_data("ok1"))
    db.commit()
    mock_api.get_complex_articles.return_value = _make_articles_response()
    monkeypatch.setattr(service_discover._throttle_articles, "wait", lambda *a, **k: None)
    monkeypatch.setattr(service_discover, "record_call", lambda *a, **k: None)

    assert service_discover.crawl_complex_articles("ok1") is True

    mock_api.get_complex_articles.side_effect = RuntimeError("boom")
    upsert_complex_from_search(db, _make_complex_data("ng1"))
    db.commit()
    # 예외를 밖으로 던지지 않고 False 로만 알린다
    assert service_discover.crawl_complex_articles("ng1") is False
