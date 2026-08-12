"""관리자 데이터 신선도 엔드포인트 테스트

실행: python -m pytest tests/test_admin_freshness.py -v
"""
from datetime import date, datetime, timedelta, timezone

import jwt

from db.mb_models import Infra, MBTrade, OfficetelPresaleSchedule, RentalScheduleOfficial
from db.models import Article, Complex, ComplexOfficialPrice, CrawlJob, UserProfile
from routers.admin.freshness import invalidate_freshness_cache

JWT_SECRET = "test-secret-key-for-testing-only"


def _token(sub):
    return jwt.encode({"sub": sub, "aud": "authenticated", "email": f"{sub}@test.com"}, JWT_SECRET, algorithm="HS256")


def _make_admin(db, uid="a1"):
    db.add(UserProfile(user_id=uid, email=f"{uid}@test.com", role="admin", status="approved"))
    db.commit()


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _get_item(items, key):
    return next(i for i in items if i["key"] == key)


# ── 인증 ──

def test_freshness_no_auth_401(client):
    """인증 없이 → 401"""
    assert client.get("/api/admin/data-freshness").status_code == 401


# ── 빈 DB ──

def test_freshness_empty_db_unknown(client, db):
    """빈 테이블 → count=0, last_updated=None, status='unknown'"""
    _make_admin(db)
    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    assert res.status_code == 200
    body = res.json()
    assert len(body["items"]) == 16  # 세션 359: 신규 8종(오피스텔·민간임대·공시가격·응급의료·매물상세·단지가치지표·단지상세APT·단지상세OPST) 편입
    for item in body["items"]:
        assert item["count"] == 0
        assert item["last_updated"] is None
        assert item["status"] == "unknown"


# ── 신호등 분기 ──

def test_freshness_status_thresholds(client, db):
    """green / yellow / red 분기 — 단지(주1회=604800초) 기준 시각 주입.

    green: now - 1일 (1.0×, ≤1.5x)
    yellow: now - 9일 (1.29x, ≤1.5x → green) ❌ → 9일은 1.286x 라 green.
            10.5일=1.5x 경계, 12일=1.71x → yellow 진입
    red: now - 22일 (3.14x → red)
    """
    _make_admin(db)
    now = datetime.now(timezone.utc)

    # 단지 1: green 후보 (1일 전)
    db.add(Complex(complex_no="C_GREEN", complex_name="green", last_crawled_at=now - timedelta(days=1)))
    # crime_stats infra 행: yellow 후보 (95일 전 = 1.06x of 90일 → green 실제로). 200일 전 = red
    db.add(Infra(apartment_id="A_RED", crime_score=10, crime_updated_at=now - timedelta(days=300)))
    db.commit()

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    assert res.status_code == 200
    items = res.json()["items"]

    complexes = _get_item(items, "complexes")
    assert complexes["count"] == 1
    assert complexes["status"] == "green", f"1일 전이면 green: {complexes}"

    crime = _get_item(items, "crime_stats")
    assert crime["count"] == 1
    # 분기 작업(90일 주기)에서 300일 전 = 3.33x → red
    assert crime["status"] == "red", f"300일 전이면 red: {crime}"


def test_freshness_status_yellow_boundary(client, db):
    """노랑 경계: 단지 주기 7일 → 1.5x=10.5일 ~ 3x=21일 사이 = yellow"""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    db.add(Complex(complex_no="C_Y", complex_name="y", last_crawled_at=now - timedelta(days=15)))
    db.commit()

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    item = _get_item(res.json()["items"], "complexes")
    # 15일 / 7일 = 2.14x → yellow (1.5x ~ 3x)
    assert item["status"] == "yellow", item


# ── public_trades = mibunyang 외부 월간 테이블 (거짓경보 회귀 가드, 세션 343) ──
#
# trades 는 mibunyang 이 매월 6일 단독 write 하는 외부 소유 테이블이고 naver-estate 는
# read-only 다. 예전엔 이 종목이 7일 주기 + collect_public_trades 잡으로 잘못 붙어, 매월
# 하순 trades age 가 21일(7일×3)을 넘겨 red → 텔레그램 가짜 경보를 냈다. 30일 주기로
# 바꿔 red 임계를 90일로 올려 진짜 3개월+ 장기 단절만 잡히게 한다. MBTrade.recorded_at
# 은 Date 타입이라 주입값은 date(datetime 아님) — freshness._to_utc 가 자정 UTC 로 승격.

def test_public_trades_25days_green(client, db):
    """trades 최신이 25일 전이면 green — 매월 하순 거짓경보 안 남 (25/30=0.83×, ≤1.5×)."""
    _make_admin(db)
    db.add(MBTrade(region="서울", recorded_at=date.today() - timedelta(days=25)))
    db.commit()

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    item = _get_item(res.json()["items"], "public_trades")
    assert item["status"] == "green", f"25일 전이면 green(0.83×): {item}"


def test_public_trades_100days_red(client, db):
    """trades 최신이 100일 전이면 red — 진짜 장기단절(3개월+)은 여전히 잡힘 (3.33×)."""
    _make_admin(db)
    db.add(MBTrade(region="서울", recorded_at=date.today() - timedelta(days=100)))
    db.commit()

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    item = _get_item(res.json()["items"], "public_trades")
    assert item["status"] == "red", f"100일 전이면 red(3.33×): {item}"


def test_public_trades_meta_is_external(client, db):
    """public_trades 는 외부 월간 테이블 동형 메타 — 주기 30일 + 정기작업 없음(unsold 동형).

    이 단언이 깨지면 누군가 7일/collect_public_trades 로 되돌려 거짓경보를 재도입한 것.
    """
    _make_admin(db)
    db.add(MBTrade(region="서울", recorded_at=date.today() - timedelta(days=10)))
    db.commit()

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    item = _get_item(res.json()["items"], "public_trades")
    assert item["expected_interval_seconds"] == 86400 * 30, item
    assert item["last_job"] is None, f"외부 테이블이라 정기작업 메타 없어야: {item}"


# ── 신규 3종(오피스텔·민간임대·공시가격) "조용한 실패" 감시 (세션 359) ──
#
# 배경: 세 수집기는 API 가 예외 없이 빈 응답을 줘도 job.status="completed"/
# total_items=0 으로 정상 기록된다(설계 의도 — 스케줄러를 안 죽임). monitor.py 의
# "작업 실패"(status=failed) 감지는 status 가 completed 라 이 상황을 못 잡는다.
# 이 신선도 카드가 "데이터 미축적"(테이블의 실제 최신 시각) 축으로 그 사각지대를
# 메운다 — 아래 테스트가 실제로 red 로 격상되는지 직접 재현해 회귀를 막는다.

def test_officetel_presale_fresh_green(client, db):
    """오피스텔 청약 최신 fetched_at 이 1일 전이면 green(주간 7일 주기, 0.14×)."""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    db.add(OfficetelPresaleSchedule(
        house_manage_no="H1", house_nm="테스트오피스텔", fetched_at=now - timedelta(days=1),
    ))
    db.commit()

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    item = _get_item(res.json()["items"], "officetel_presale")
    assert item["count"] == 1
    assert item["status"] == "green", f"1일 전이면 green: {item}"


def test_officetel_presale_stale_goes_red(client, db):
    """핵심 회귀 가드: 오피스텔 청약이 3주(21일=3×) 넘게 안 갱신되면 red —
    수집이 '조용히 실패'(0건인데 completed)해도 이 신호로 잡힌다는 증거."""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    db.add(OfficetelPresaleSchedule(
        house_manage_no="H1", house_nm="테스트오피스텔", fetched_at=now - timedelta(days=25),
    ))
    db.commit()

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    item = _get_item(res.json()["items"], "officetel_presale")
    assert item["status"] == "red", f"25일 전(3.57×)이면 red: {item}"


def test_rental_presale_fresh_green(client, db):
    """민간임대 청약도 오피스텔과 동일 주간(7일) 주기 — 1일 전이면 green."""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    db.add(RentalScheduleOfficial(
        house_manage_no="R1", house_nm="테스트임대", fetched_at=now - timedelta(days=1),
    ))
    db.commit()

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    item = _get_item(res.json()["items"], "rental_presale")
    assert item["count"] == 1
    assert item["status"] == "green", f"1일 전이면 green: {item}"


def test_official_price_monthly_meta(client, db):
    """공시가격은 월간(30일) 주기 — 45일 전(1.5×)이면 아직 green 유지, 100일 전(3.33×)이면 red."""
    _make_admin(db)
    db.add(ComplexOfficialPrice(
        complex_no="1", stdr_year="2026", prvuse_ar="84.00",
        price_median=500000000, ho_count=10,
        collected_at=datetime.now(timezone.utc) - timedelta(days=100),
    ))
    db.commit()

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    item = _get_item(res.json()["items"], "official_price")
    assert item["count"] == 1
    assert item["expected_interval_seconds"] == 86400 * 30, item
    assert item["status"] == "red", f"100일 전(3.33×)이면 red: {item}"


# ── 전수조사로 발견된 사각지대 2종: 매물 상세 보강·응급의료기관 (세션 359) ──
#
# 배경: crawl_details(매물 상세 보강)와 collect_emergency(응급의료기관) 는 몇 시간이고
# 매번 0건만 처리해도 status="completed"로 정상 종료돼 monitor.py 의 "작업 실패"·
# "작업 마비" 축 어디도 못 잡는 사각지대였다(17개 스케줄러 잡 전수조사로 발견).
# air_quality/childcare/crime_stats 는 이미 있는데 emergency 만 등록 누락이었고,
# crawl_details 는 애초에 전용 카드가 없었다 — CrawlJob.completed_at 경유(childcare 패턴).

def test_article_detail_fresh_green(client, db):
    """매물 상세 보강 최신 완료가 30분 전이면 green(90분 주기, 0.33×)."""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    db.add(CrawlJob(
        job_type="article_detail", scheduler_job_id="crawl_details", status="completed",
        started_at=now - timedelta(minutes=31), completed_at=now - timedelta(minutes=30),
        processed_items=100, total_items=100,
    ))
    db.commit()

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    item = _get_item(res.json()["items"], "article_detail")
    assert item["status"] == "green", f"30분 전이면 green: {item}"


def test_article_detail_completed_zero_items_still_stale_goes_red(client, db):
    """핵심 회귀 가드: '완료(completed)로 기록되지만 매번 0건만 처리'하며 5시간
    넘게 안 갱신되면 red — 사장님이 지적한 '조용히 뻗어도 아무도 모른다' 시나리오를
    직접 재현. status가 completed 인데도(작업실패 축은 못 잡음) 이 축이 잡는다."""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    db.add(CrawlJob(
        job_type="article_detail", scheduler_job_id="crawl_details", status="completed",
        started_at=now - timedelta(hours=5, minutes=1), completed_at=now - timedelta(hours=5),
        processed_items=0, total_items=0,  # 0건 처리 — "완료"지만 사실상 무동작
    ))
    db.commit()

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    item = _get_item(res.json()["items"], "article_detail")
    assert item["status"] == "red", f"5시간 전(90분×3.33)이면 red: {item}"


def test_emergency_fresh_green(client, db):
    """응급의료기관 최신 완료가 1일 전이면 green(월간 30일 주기, 0.033×)."""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    db.add(CrawlJob(
        job_type="emergency", scheduler_job_id="collect_emergency", status="completed",
        started_at=now - timedelta(days=1, minutes=1), completed_at=now - timedelta(days=1),
        processed_items=500, total_items=500,
    ))
    db.commit()

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    item = _get_item(res.json()["items"], "emergency")
    assert item["status"] == "green", f"1일 전이면 green: {item}"


def test_emergency_stale_goes_red(client, db):
    """응급의료기관이 100일(3.33×) 넘게 안 갱신되면 red — air_quality/childcare/
    crime_stats 는 이미 카드가 있는데 emergency 만 누락됐던 사각지대 회귀 가드."""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    db.add(CrawlJob(
        job_type="emergency", scheduler_job_id="collect_emergency", status="completed",
        started_at=now - timedelta(days=100, minutes=1), completed_at=now - timedelta(days=100),
        processed_items=500, total_items=500,
    ))
    db.commit()

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    item = _get_item(res.json()["items"], "emergency")
    assert item["status"] == "red", f"100일 전(3.33×)이면 red: {item}"


def test_complex_metric_fresh_green(client, db):
    """단지 가치지표 최신 완료가 1시간 전이면 green(36시간 주기, 0.028×)."""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    db.add(CrawlJob(
        job_type="complex_metric", scheduler_job_id="collect_metrics", status="completed",
        started_at=now - timedelta(hours=1, minutes=1), completed_at=now - timedelta(hours=1),
        processed_items=200, total_items=200,
    ))
    db.commit()

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    item = _get_item(res.json()["items"], "complex_metric")
    assert item["status"] == "green", f"1시간 전이면 green: {item}"


def test_complex_metric_completed_zero_items_still_stale_goes_red(client, db):
    """'완료로 기록되지만 시세이력 없는 단지가 소진돼 매번 0건만 처리'하며
    6일(144시간, 36시간×4) 넘게 안 갱신되면 red — 전수조사에서 '시급하지
    않다'고 미뤘던 사각지대를 마저 메운 회귀 가드 (사장님 지시: 전체 적용).
    red 임계는 주기의 3배(108시간=4.5일) — 여유를 두고 6일로 확실히 넘긴다."""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    db.add(CrawlJob(
        job_type="complex_metric", scheduler_job_id="collect_metrics", status="completed",
        started_at=now - timedelta(days=6, minutes=1), completed_at=now - timedelta(days=6),
        processed_items=0, total_items=0,
    ))
    db.commit()

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    item = _get_item(res.json()["items"], "complex_metric")
    assert item["status"] == "red", f"6일 전(144h/36h=4×, red임계 3×초과)이면 red: {item}"


# ── 단지 상세 보강 APT·OPST (세션 359, CI 커버리지 검사가 발견) ──
#
# 배경: test_scheduler_monitoring_coverage.py 가 complex_detail_APT/OPST(4시간
# interval, 대량 단지 4.6만/1.5만개)가 신선도 카드에도 예외 목록에도 없는
# 사각지대임을 실제로 찾아냈다 — article_detail·complex_metric과 동일 유형.

def test_complex_detail_apt_fresh_green(client, db):
    """단지 상세 보강(APT) 최신 완료가 1시간 전이면 green(12시간 주기, 0.083×)."""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    db.add(CrawlJob(
        job_type="complex_detail_APT", scheduler_job_id="complex_detail_APT", status="completed",
        started_at=now - timedelta(hours=1, minutes=1), completed_at=now - timedelta(hours=1),
        processed_items=500, total_items=1000,
    ))
    db.commit()

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    item = _get_item(res.json()["items"], "complex_detail_apt")
    assert item["status"] == "green", f"1시간 전이면 green: {item}"


def test_complex_detail_apt_completed_zero_items_still_stale_goes_red(client, db):
    """'완료로 기록되지만 detail_crawled_at IS NULL 후보가 소진돼 매번 0건만
    처리'하며 2일(48시간, 12시간×4) 넘게 안 갱신되면 red — 4.6만 단지 규모라
    사장님이 지적한 '조용히 죽어도 아무도 모른다' 시나리오가 여기서도 재현
    가능함을 회귀 가드로 고정."""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    db.add(CrawlJob(
        job_type="complex_detail_APT", scheduler_job_id="complex_detail_APT", status="completed",
        started_at=now - timedelta(days=2, minutes=1), completed_at=now - timedelta(days=2),
        processed_items=0, total_items=0,
    ))
    db.commit()

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    item = _get_item(res.json()["items"], "complex_detail_apt")
    assert item["status"] == "red", f"2일 전(48h/12h=4×, red임계 3×초과)이면 red: {item}"


def test_complex_detail_opst_fresh_green(client, db):
    """단지 상세 보강(OPST)도 APT와 동일 주기(12시간) — 1시간 전이면 green."""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    db.add(CrawlJob(
        job_type="complex_detail_OPST", scheduler_job_id="complex_detail_OPST", status="completed",
        started_at=now - timedelta(hours=1, minutes=1), completed_at=now - timedelta(hours=1),
        processed_items=200, total_items=500,
    ))
    db.commit()

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    item = _get_item(res.json()["items"], "complex_detail_opst")
    assert item["status"] == "green", f"1시간 전이면 green: {item}"


def test_complex_detail_opst_stale_goes_red(client, db):
    """단지 상세 보강(OPST)이 2일 넘게 안 갱신되면 red — APT와 완전히 독립된
    잡(별도 job_type)이라 서로 다른 상태가 정확히 구분되는지 확인."""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    db.add(CrawlJob(
        job_type="complex_detail_OPST", scheduler_job_id="complex_detail_OPST", status="completed",
        started_at=now - timedelta(days=2, minutes=1), completed_at=now - timedelta(days=2),
        processed_items=500, total_items=500,
    ))
    db.commit()

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    item = _get_item(res.json()["items"], "complex_detail_opst")
    assert item["status"] == "red", f"2일 전(48h/12h=4×, red임계 3×초과)이면 red: {item}"


# ── 응답 스키마 ──

def test_freshness_response_schema(client, db):
    """응답에 generated_at + 16 items 필수 필드 모두 포함 (세션 359: 신규 8종 편입)"""
    _make_admin(db)
    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    assert res.status_code == 200
    body = res.json()
    assert "generated_at" in body
    keys = {item["key"] for item in body["items"]}
    expected_keys = {
        "complexes", "articles", "complex_price_history", "unsold",
        "air_quality", "childcare", "crime_stats", "public_trades",
        "officetel_presale", "rental_presale", "official_price",
        "emergency", "article_detail", "complex_metric",
        "complex_detail_apt", "complex_detail_opst",
    }
    assert keys == expected_keys
    for item in body["items"]:
        for field in (
            "key", "label", "count", "last_updated", "expected_interval_seconds",
            "status", "spinning", "last_job", "new_rows",
        ):
            assert field in item, f"{field} missing in {item}"
        assert item["status"] in {"green", "yellow", "red", "unknown"}


# ── 헛바퀴 감지 (작업 메타 + new_rows) ──

def _make_completed_job(db, sched_id: str, *, started_at, completed_at, processed: int, total: int):
    db.add(CrawlJob(
        job_type="test",
        scheduler_job_id=sched_id,
        status="completed",
        started_at=started_at,
        completed_at=completed_at,
        processed_items=processed,
        total_items=total,
    ))
    db.commit()


def test_freshness_spinning_zero_processed(client, db):
    """processed=0, total>0 → 헛바퀴 빨강 격상"""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    # 어린이집 수집기가 막 끝났는데 0/100 처리
    _make_completed_job(
        db, "collect_childcare",
        started_at=now - timedelta(minutes=10), completed_at=now - timedelta(minutes=8),
        processed=0, total=100,
    )

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    items = res.json()["items"]
    childcare = _get_item(items, "childcare")
    assert childcare["spinning"] is True
    assert childcare["status"] == "red"
    assert childcare["last_job"]["processed_items"] == 0
    assert childcare["last_job"]["total_items"] == 100


def test_freshness_articles_new_rows_counted(client, db):
    """매물 크롤 작업 후 articles.created_at>=job_start 신규 행 수 카운트"""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    job_start = now - timedelta(minutes=30)
    job_end = now - timedelta(minutes=10)
    _make_completed_job(
        db, "crawl_articles",
        started_at=job_start, completed_at=job_end,
        processed=50, total=50,
    )
    # 작업 시작 전 기존 매물 1건
    db.add(Article(article_no="OLD1", complex_no="C1", created_at=now - timedelta(hours=2), updated_at=now - timedelta(hours=2)))
    # 작업 시작 후 신규 2건
    db.add(Article(article_no="NEW1", complex_no="C1", created_at=job_start + timedelta(minutes=5), updated_at=job_start + timedelta(minutes=5)))
    db.add(Article(article_no="NEW2", complex_no="C1", created_at=job_start + timedelta(minutes=10), updated_at=job_start + timedelta(minutes=10)))
    db.commit()

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    arts = _get_item(res.json()["items"], "articles")
    assert arts["new_rows"] == 2
    assert arts["spinning"] is False
    assert arts["last_job"]["processed_items"] == 50


def test_freshness_articles_spinning_no_new_rows(client, db):
    """매물 크롤 작업 돌았는데 new_rows=0 → 헛바퀴 빨강"""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    job_start = now - timedelta(minutes=30)
    _make_completed_job(
        db, "crawl_articles",
        started_at=job_start, completed_at=now - timedelta(minutes=10),
        processed=10, total=10,
    )
    # 작업 시작 전 매물만 존재 → 신규 0건
    db.add(Article(article_no="OLD", complex_no="C1", created_at=now - timedelta(hours=2), updated_at=now - timedelta(hours=2)))
    db.commit()

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    arts = _get_item(res.json()["items"], "articles")
    assert arts["new_rows"] == 0
    assert arts["spinning"] is True
    assert arts["status"] == "red"


def test_freshness_no_job_meta_fields_null(client, db):
    """정기 job 없는 종목(미분양) → last_job=None, new_rows=None, spinning=False"""
    _make_admin(db)
    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    unsold = _get_item(res.json()["items"], "unsold")
    assert unsold["last_job"] is None
    assert unsold["new_rows"] is None
    assert unsold["spinning"] is False


# ── batch 합산 (세션 219 false alarm 회귀 가드) ──
# 한 batch = 같은 scheduler_job_id 가 마지막 60분 윈도우 안에 연속 실행된 잡들의 묶음.
# crawl_articles_batch 가 50단지를 한 번에 도는 동안 단지별로 CrawlJob row N 개가 생기는데,
# 마지막 1건만 보면 dead 단지(proc=0/total=0)가 우연히 마지막이면 화면이 "처리 0/0" 으로
# 보여 사용자가 "헛바퀴" 로 오해. 세션 219 텔레그램 false alarm 7건의 root cause.


def test_freshness_batch_aggregates_processed_and_total(client, db):
    """같은 batch (마지막 60분) 의 잡들은 processed/total 을 합산해 노출."""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    batch_start = now - timedelta(minutes=30)
    # 3개 잡 = 정상(20/20) + 정상(15/15) + dead 단지(0/0) — 마지막이 0/0
    _make_completed_job(
        db, "crawl_articles",
        started_at=batch_start, completed_at=batch_start + timedelta(seconds=5),
        processed=20, total=20,
    )
    _make_completed_job(
        db, "crawl_articles",
        started_at=batch_start + timedelta(seconds=10),
        completed_at=batch_start + timedelta(seconds=15),
        processed=15, total=15,
    )
    _make_completed_job(
        db, "crawl_articles",
        started_at=batch_start + timedelta(seconds=20),
        completed_at=batch_start + timedelta(seconds=21),
        processed=0, total=0,
    )

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    arts = _get_item(res.json()["items"], "articles")
    assert arts["last_job"]["processed_items"] == 35, arts["last_job"]
    assert arts["last_job"]["total_items"] == 35, arts["last_job"]


def test_freshness_batch_zero_total_only_not_spinning(client, db):
    """batch 안에 0/0 잡만 있어도 헛바퀴 판정 X — 단지에 매물 0건은 정상.

    세션 219 false alarm 의 root cause. 50단지 중 모두 매물 0건 케이스에
    sum_total=0 → spinning 조건 (sum_total>0 AND sum_processed==0) 미충족.
    """
    _make_admin(db)
    now = datetime.now(timezone.utc)
    batch_start = now - timedelta(minutes=20)
    for i in range(3):
        _make_completed_job(
            db, "crawl_articles",
            started_at=batch_start + timedelta(seconds=i * 2),
            completed_at=batch_start + timedelta(seconds=i * 2 + 1),
            processed=0, total=0,
        )

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    arts = _get_item(res.json()["items"], "articles")
    assert arts["last_job"]["processed_items"] == 0
    assert arts["last_job"]["total_items"] == 0
    # 매물 1건 추가 (batch 시작 후) → new_rows=1 → spinning=False
    db.add(Article(
        article_no="N1", complex_no="C1",
        created_at=batch_start + timedelta(minutes=1),
        updated_at=batch_start + timedelta(minutes=1),
    ))
    db.commit()
    # data-freshness 5분 캐시(세션 260) — 실운영은 수집 후 invalidate 되므로 즉시 반영.
    # 테스트도 DB 변경 후 무효화해 둘째 GET 이 fresh compute 하도록.
    invalidate_freshness_cache()
    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    arts = _get_item(res.json()["items"], "articles")
    assert arts["new_rows"] == 1
    assert arts["spinning"] is False


def test_freshness_batch_new_rows_uses_batch_start(client, db):
    """new_rows 카운트는 batch 첫 잡의 started_at 기준 (마지막 잡 X)."""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    batch_start = now - timedelta(minutes=40)
    last_job_start = now - timedelta(minutes=10)
    # 첫 잡 (batch 시작)
    _make_completed_job(
        db, "crawl_articles",
        started_at=batch_start, completed_at=batch_start + timedelta(seconds=5),
        processed=10, total=10,
    )
    # 마지막 잡 (batch 끝)
    _make_completed_job(
        db, "crawl_articles",
        started_at=last_job_start, completed_at=last_job_start + timedelta(seconds=5),
        processed=5, total=5,
    )
    # batch 시작 후, 마지막 잡 시작 전에 들어온 매물 1건 — batch 기준이면 카운트됨
    db.add(Article(
        article_no="MID", complex_no="C1",
        created_at=batch_start + timedelta(minutes=5),
        updated_at=batch_start + timedelta(minutes=5),
    ))
    db.commit()

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    arts = _get_item(res.json()["items"], "articles")
    # 마지막 잡만 기준이면 0, batch 첫 잡 기준이면 1
    assert arts["new_rows"] == 1, f"batch_start 기준이어야 함: {arts}"


def test_freshness_batch_window_separates_old_batch(client, db):
    """60분 윈도우 밖 잡은 다른 batch 로 취급 — 합산 안 됨."""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    # 오래된 batch (3시간 전, 윈도우 밖)
    _make_completed_job(
        db, "crawl_articles",
        started_at=now - timedelta(hours=3),
        completed_at=now - timedelta(hours=3) + timedelta(seconds=5),
        processed=999, total=999,
    )
    # 최근 batch (20분 전, 윈도우 안)
    _make_completed_job(
        db, "crawl_articles",
        started_at=now - timedelta(minutes=20),
        completed_at=now - timedelta(minutes=20) + timedelta(seconds=5),
        processed=5, total=5,
    )

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    arts = _get_item(res.json()["items"], "articles")
    # 999 가 합산되면 버그. 최근 batch (5) 만 합산
    assert arts["last_job"]["processed_items"] == 5, arts["last_job"]
    assert arts["last_job"]["total_items"] == 5, arts["last_job"]
