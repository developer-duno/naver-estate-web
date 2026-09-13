"""상세 백필(backfill_article_details) 회귀 가드 — 세션 402.

배경: 세션 401(PR #503)에서 네이버 상세 API 응답 키가 바뀐 것을 발견해 파서를 고쳤다
(heatingTypeName→aptHeatMethodTypeName 등). 그런데 그 수정은 앞으로 새로 긁는 매물에만
적용된다 — 이미 detail_crawled=True 로 마킹된 기존 매물은 3컬럼(heating_type 등)이
NULL 인 채 남아 있고, crawl_article_details 는 detail_crawled=False 후보만 고르므로
이 매물들은 영원히 재선정되지 않는다. backfill_article_details 가 그 사각을 메운다.

이 파일이 검증하는 것:
1. 후보 선정 — detail_crawled=True + heating_type IS NULL + 30일 내 활성 매물만
   뽑고, 4가지 음성 케이스(detail_crawled=False·이미 채워짐·31일 전·비활성)는 제외.
2. 정상 채움 — 네이버 새 키 응답 시 3컬럼이 채워진다.
3. dead 매물 — NotExistInformation 시 is_active=False.
4. 빈 문자열 방어 — "" 응답 시 저장하지 않는다(falsy 가드, shared/domain/article.py).
5. 잡 등록 — BACKFILL_DETAIL_ENABLED 토글로 스케줄러 잡이 켜지고 꺼진다.
6. 기존 잡 불변 — crawl_article_details 후보 SELECT 는 손대지 않았다
   (test_migration_v057_detail_pending_idx.py 가 이미 가드 — 여기서는 import 만 재확인).
7. 총 층수(articleFloor 블록 이사) — articleFloor.totalFloorCount 를 읽고,
   articleDetail 옛 위치 폴백도 동작하며, '-' 같은 비정상 값은 무시한다.
8. 오피스텔 관리비(administrationCostInfo 폴백) — maintenanceCost 가 null 이면
   etcFeeDetails.etcFeeAmount 를 원→만원 단위 변환해 쓰고, unableCheckDetails 만
   있으면 None 유지하며, 아파트 기존 경로는 회귀 없다.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from crawler import scheduler as sched_mod
from crawler import service_discover
from crawler.service_discover import backfill_article_details, crawl_article_details  # noqa: F401 (불변 재확인용)
from db.models import Article, CrawlJob
from services.upsert import _extract_maintenance_from_detail, build_detail_update_dict
from shared.domain.article import RealEstateArticle


def _make_backfill_candidate(
    db,
    article_no: str,
    *,
    last_seen: datetime,
    heating_type: str | None = None,
    detail_crawled: bool = True,
    is_active: bool = True,
    fail_count: int = 0,
) -> None:
    """백필 후보/비후보 조합 매물 1건 심기."""
    db.add(
        Article(
            article_no=article_no,
            complex_no="100",
            trade_type_name="매매",
            detail_crawled=detail_crawled,
            is_active=is_active,
            last_seen_at=last_seen,
            heating_type=heating_type,
            detail_fail_count=fail_count,
        )
    )
    db.commit()


def _disable_throttle(monkeypatch):
    monkeypatch.setattr(service_discover._throttle_details, "wait", lambda: None)
    monkeypatch.setattr(service_discover, "record_call", lambda *a, **k: None)


# ── 1) 후보 선정 — 양성 1건 + 음성 4건 ──


def test_candidate_selection_picks_only_matching_rows(db, monkeypatch):
    """detail_crawled=True + heating_type NULL + 30일 내 + 활성 매물만 선정된다.

    4가지 음성 케이스(기존 crawl_article_details 소관·이미 채워짐·31일 전·비활성)는
    전부 상세 API 호출 대상에서 제외돼야 한다.
    """
    _disable_throttle(monkeypatch)
    now = datetime.now(timezone.utc)

    # 양성 — 선정 대상
    _make_backfill_candidate(db, "TARGET", last_seen=now)

    # 음성 1: detail_crawled=False — 기존 crawl_article_details 소관, 여기선 제외
    _make_backfill_candidate(db, "NOT_CRAWLED", last_seen=now, detail_crawled=False)

    # 음성 2: heating_type 이미 채워짐 — 드리프트 영향 없음, 재크롤 불필요
    _make_backfill_candidate(db, "ALREADY_FILLED", last_seen=now, heating_type="개별난방")

    # 음성 3: 31일 전 매물 — 30일 컷오프 밖
    _make_backfill_candidate(db, "TOO_OLD", last_seen=now - timedelta(days=31))

    # 음성 4: 비활성 매물 — 사장님 결정으로 백필 대상에서 제외
    _make_backfill_candidate(db, "INACTIVE", last_seen=now, is_active=False)

    called: list[str] = []

    def _fake_detail(article_no):
        called.append(article_no)
        return {
            "articleDetail": {
                "articleNo": article_no,
                "aptHeatMethodTypeName": "개별난방",
                "aptUseApproveYmd": "19911217",
                "exposureAddress": "대전시 유성구 구암동",
            }
        }

    monkeypatch.setattr(
        service_discover.NaverEstateAPI, "get_article_detail", staticmethod(_fake_detail)
    )

    backfill_article_details(batch_size=10)

    assert called == ["TARGET"], f"선정 결과가 예상과 다름: {called}"


# ── 2) 정상 채움 ──


def test_backfill_fills_new_key_response(db, monkeypatch):
    """네이버 새 키(aptHeatMethodTypeName 등) 응답 시 3컬럼이 채워진다."""
    _disable_throttle(monkeypatch)
    now = datetime.now(timezone.utc)
    _make_backfill_candidate(db, "FILLME", last_seen=now)

    monkeypatch.setattr(
        service_discover.NaverEstateAPI,
        "get_article_detail",
        staticmethod(
            lambda an: {
                "articleDetail": {
                    "articleNo": an,
                    "aptHeatMethodTypeName": "개별난방",
                    "aptUseApproveYmd": "19911217",
                    "exposureAddress": "대전시 유성구 구암동",
                }
            }
        ),
    )

    backfill_article_details(batch_size=10)

    db.expire_all()
    row = db.query(Article).filter(Article.article_no == "FILLME").one()
    assert row.heating_type == "개별난방"
    assert row.use_approve_ymd == "19911217"
    assert row.jibun_address == "대전시 유성구 구암동"
    assert row.detail_crawled is True


# ── 3) dead 매물 ──


def test_backfill_deactivates_dead_article(db, monkeypatch):
    """NotExistInformation 응답 시 is_active=False 마킹된다."""
    _disable_throttle(monkeypatch)
    now = datetime.now(timezone.utc)
    _make_backfill_candidate(db, "GONE", last_seen=now)

    monkeypatch.setattr(
        service_discover.NaverEstateAPI,
        "get_article_detail",
        staticmethod(
            lambda an: {"error": {"code": "errorCode.NotExistInformation", "message": "없음"}}
        ),
    )

    backfill_article_details(batch_size=10)

    db.expire_all()
    row = db.query(Article).filter(Article.article_no == "GONE").one()
    assert row.is_active is False
    assert row.detail_crawled is True


# ── 4) 빈 문자열 방어 ──


def test_backfill_empty_string_response_not_saved(db, monkeypatch):
    """네이버가 빈 문자열("")을 주면 heating_type 등이 저장되지 않는다(falsy 가드).

    shared/domain/article.py update_from_detail 의 `if heat:` 가드가 이미 처리한다 —
    이 테스트는 백필 경로에서도 그 가드가 그대로 적용되는지 확인한다.
    """
    _disable_throttle(monkeypatch)
    now = datetime.now(timezone.utc)
    _make_backfill_candidate(db, "EMPTYSTR", last_seen=now)

    monkeypatch.setattr(
        service_discover.NaverEstateAPI,
        "get_article_detail",
        staticmethod(
            lambda an: {
                "articleDetail": {
                    "articleNo": an,
                    "aptHeatMethodTypeName": "",
                    "aptUseApproveYmd": "",
                    "exposureAddress": "",
                }
            }
        ),
    )

    backfill_article_details(batch_size=10)

    db.expire_all()
    row = db.query(Article).filter(Article.article_no == "EMPTYSTR").one()
    assert row.heating_type is None, "빈 문자열이 heating_type 에 저장됐다"
    assert row.use_approve_ymd is None, "빈 문자열이 use_approve_ymd 에 저장됐다"
    assert row.jibun_address is None, "빈 문자열이 jibun_address 에 저장됐다"
    # detail_crawled=True 는 원래 이미 True 였고 백필 후에도 유지된다.
    assert row.detail_crawled is True


# ── 5) 잡 등록 토글 ──


_BACKFILL_JOB_IDS = ("backfill_detail_dawn", "backfill_detail_noon")


def test_backfill_job_absent_when_disabled():
    """BACKFILL_DETAIL_ENABLED=false 면 스케줄러에 두 회차 모두 등록되지 않는다."""
    with patch.object(sched_mod, "BACKFILL_DETAIL_ENABLED", False):
        scheduler = sched_mod.create_scheduler()
    ids = {job.id for job in scheduler.get_jobs()}
    for job_id in _BACKFILL_JOB_IDS:
        assert job_id not in ids


def test_backfill_job_present_when_enabled():
    """BACKFILL_DETAIL_ENABLED=true 면 새벽·정오 두 회차가 등록된다."""
    with patch.object(sched_mod, "BACKFILL_DETAIL_ENABLED", True):
        scheduler = sched_mod.create_scheduler()
    jobs = {job.id: job for job in scheduler.get_jobs()}
    for job_id in _BACKFILL_JOB_IDS:
        assert jobs.get(job_id) is not None, f"{job_id} 잡 미등록"
        assert jobs[job_id].max_instances == 1


def test_backfill_dawn_batch_fits_before_article_crawl():
    """새벽 회차가 01:00 매물 수집 시작 전에 끝나는 크기인지.

    백필은 매물 1건마다 _throttle_details(1.5초)를 기다리므로 소요 = 배치 × 1.5초다.
    00:20 에 시작해 01:00 crawl_articles 와 겹치면 같은 네이버 상세/목록 API 를 두
    잡이 동시에 두드린다(IP 차단 위험, infra.md §IP 차단 방지). 40분(2,400초) 안에
    끝나야 하므로 배치 상한은 1,600건이다.

    정오 회차는 다음 네이버 호출 잡(14:45 popular_crawl)까지 145분 여유가 있어
    더 큰 배치를 쓴다 — 두 회차의 크기가 다른 이유가 이것이다.
    """
    dawn_seconds = sched_mod._BACKFILL_DAWN_SIZE * 1.5
    assert dawn_seconds <= 40 * 60, (
        f"새벽 배치 {sched_mod._BACKFILL_DAWN_SIZE}건은 {dawn_seconds / 60:.0f}분 걸려 "
        "01:00 crawl_articles 와 겹친다 (상한 1,600건)"
    )
    noon_seconds = sched_mod._BACKFILL_NOON_SIZE * 1.5
    assert noon_seconds <= 145 * 60, (
        f"정오 배치 {sched_mod._BACKFILL_NOON_SIZE}건은 {noon_seconds / 60:.0f}분 걸려 "
        "14:45 popular_crawl 과 겹친다 (상한 5,800건)"
    )
    assert sched_mod._BACKFILL_NOON_SIZE > sched_mod._BACKFILL_DAWN_SIZE, (
        "정오가 여유가 크므로 정오 배치가 새벽보다 커야 한다"
    )


def test_backfill_jobs_have_no_jitter():
    """백필 두 회차에 jitter 가 없어야 한다.

    시각을 흔들면 위 소요 시간 계산(다음 크론과 안 겹침)이 무너진다. 특히 새벽
    회차는 01:00 과 여유가 40분뿐이라 앞뒤 흔들림을 감당하지 못한다.
    """
    with patch.object(sched_mod, "BACKFILL_DETAIL_ENABLED", True):
        scheduler = sched_mod.create_scheduler()
    jobs = {job.id: job for job in scheduler.get_jobs()}
    for job_id in _BACKFILL_JOB_IDS:
        assert getattr(jobs[job_id].trigger, "jitter", None) in (None, 0), (
            f"{job_id} 에 jitter 가 있으면 겹침 회피 계산이 무너진다"
        )


# ── 6) job_type 구분 ──


def test_backfill_job_uses_distinct_job_type(db, monkeypatch):
    """backfill_article_details 가 남기는 CrawlJob.job_type 이 기존 잡과 구분된다."""
    _disable_throttle(monkeypatch)
    now = datetime.now(timezone.utc)
    _make_backfill_candidate(db, "JOBTYPE", last_seen=now)

    monkeypatch.setattr(
        service_discover.NaverEstateAPI,
        "get_article_detail",
        staticmethod(lambda an: {"articleDetail": {"articleNo": an}}),
    )

    backfill_article_details(batch_size=10)

    db.expire_all()
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "article_detail_backfill").one()
    assert job.status == "completed"
    assert job.processed_items == 1


# ── 7) 총 층수 — articleFloor 블록 이사 (사장님 지시, 2026-09-13 라이브 실측) ──


def _make_domain():
    return RealEstateArticle(article_no="T1", trade_type_name="매매")


def test_total_floor_count_reads_from_article_floor_block():
    """articleFloor.totalFloorCount 가 실제 층수 위치 — 정상 매핑된다.

    ⚠ articleFloor 단독으로는 매핑되지 않는다 — tfc 처리는 `if ad:` 게이트 안에
    있고, 실제 네이버 응답도 articleDetail 이 항상 다른 필드(roomCount 등)와 함께
    형제로 온다(articleFloor 만 오는 응답은 실측된 바 없다). 그래서 articleDetail
    에 다른 필드를 하나 채운 현실적인 형태로 테스트한다.
    """
    art = _make_domain()
    art.update_from_detail({
        "articleDetail": {"roomCount": 3},
        "articleFloor": {"totalFloorCount": "10"},
    })
    assert art.total_floor_count == 10


def test_total_floor_count_falls_back_to_article_detail_block():
    """articleFloor 가 없고 articleDetail 에만 있으면(옛 위치) 여전히 동작한다(폴백)."""
    art = _make_domain()
    art.update_from_detail({"articleDetail": {"totalFloorCount": "7"}})
    assert art.total_floor_count == 7


def test_total_floor_count_prefers_article_floor_over_article_detail():
    """두 블록에 다 있으면 articleFloor(신규 위치)가 우선한다."""
    art = _make_domain()
    art.update_from_detail({
        "articleFloor": {"totalFloorCount": "44"},
        "articleDetail": {"totalFloorCount": "7"},
    })
    assert art.total_floor_count == 44


def test_total_floor_count_dash_value_is_ignored():
    """'-' 같은 비정상 값(undergroundFloorCount 실측 사례)은 int() 실패로 조용히 무시된다."""
    art = _make_domain()
    art.total_floor_count = None
    art.update_from_detail({
        "articleDetail": {"roomCount": 3},
        "articleFloor": {"totalFloorCount": "-"},
    })
    assert art.total_floor_count is None


def test_total_floor_count_mutation_check_article_floor_removed(monkeypatch):
    """뮤테이션 검증: af.get(...) 을 제거하고 ad.get(...) 만 쓰면 신규 위치 테스트가 FAIL 한다.

    원문 스냅샷 → 변경 → 검증 → 원문과 동일한지 대조 후 복원. git restore 금지
    (미커밋 상태에서 다른 미커밋 변경까지 날릴 위험).
    """
    import io

    path = "shared/domain/article.py"
    original = io.open(path, encoding="utf-8", newline="").read()
    mutated = original.replace(
        'tfc = af.get("totalFloorCount") or ad.get("totalFloorCount")',
        'tfc = ad.get("totalFloorCount")',
    )
    assert mutated != original, "뮤테이션 대상 라인을 찾지 못함 — 소스가 바뀌었는지 확인"

    try:
        with io.open(path, "w", encoding="utf-8", newline="") as f:
            f.write(mutated)

        # 모듈 재로딩 없이는 이미 import 된 shared.domain.article 이 그대로라 파일 수정만으론
        # 반영되지 않는다 — importlib.reload 로 강제 재적용.
        import importlib

        import shared.domain.article as article_mod

        importlib.reload(article_mod)

        art = article_mod.RealEstateArticle(article_no="T1", trade_type_name="매매")
        art.update_from_detail({
            "articleDetail": {"roomCount": 3},
            "articleFloor": {"totalFloorCount": "44"},
        })
        assert art.total_floor_count is None, (
            "뮤테이션(articleFloor 제거) 후에도 44 가 읽힌다 — 이 가드가 결함을 못 본다"
        )
    finally:
        with io.open(path, "w", encoding="utf-8", newline="") as f:
            f.write(original)
        # 원문 복원 검증 — 파일이 정확히 되돌아왔는지 재확인
        restored = io.open(path, encoding="utf-8", newline="").read()
        assert restored == original, "원문 복원 실패 — 수동 확인 필요"
        # 모듈 상태도 원복(다음 테스트가 정상 버전을 쓰도록)
        import importlib

        import shared.domain.article as article_mod

        importlib.reload(article_mod)


# ── 8) 오피스텔 관리비 — administrationCostInfo 폴백 (사장님 지시) ──


def test_officetel_maintenance_cost_uses_etc_fee_amount_with_unit_conversion():
    """오피스텔: maintenanceCost=null + etcFeeAmount=90000(원) → 만원 단위로 변환 저장.

    단위 확인이 핵심 — 아파트 dict 케이스(averageTotalPrice, 원→만원 /10000)와
    정확히 같은 변환을 거쳐야 화면에 "90000만원" 같은 사고가 안 난다.
    """
    detail_data = {
        "articleDetail": {"maintenanceCost": None},
        "administrationCostInfo": {
            "chargeCodeType": "02",
            "chargeCriteriaCode": "02",
            "etcFeeDetails": {
                "detailCodeType": "01",
                "etcFeeAmount": 90000,
                "includeCodeTypes": ["01", "99"],
            },
        },
    }
    result = _extract_maintenance_from_detail(detail_data)
    assert result == "9", f"90000원은 9(만원)로 저장돼야 하는데 {result!r}"


def test_officetel_maintenance_cost_matches_apartment_unit_convention():
    """오피스텔 폴백과 아파트 dict 경로가 같은 단위 변환 공식을 쓰는지 나란히 비교.

    숫자를 하드코딩하지 않고 두 경로를 같은 원 단위 입력(90000)으로 돌려 비교한다.
    """
    apt_result = _extract_maintenance_from_detail({
        "articleDetail": {"maintenanceCost": {"averageTotalPrice": "90000"}},
    })
    officetel_result = _extract_maintenance_from_detail({
        "articleDetail": {"maintenanceCost": None},
        "administrationCostInfo": {"etcFeeDetails": {"etcFeeAmount": 90000}},
    })
    assert apt_result == officetel_result == "9"


def test_officetel_maintenance_cost_unable_check_stays_none():
    """unableCheckDetails 만 있고 etcFeeDetails 가 없으면(관리비 확인 불가) None 유지."""
    detail_data = {
        "articleDetail": {"maintenanceCost": None},
        "administrationCostInfo": {
            "chargeCodeType": "03",
            "chargeCriteriaCode": "02",
            "unableCheckDetails": {"detailCodeType": "03"},
        },
    }
    assert _extract_maintenance_from_detail(detail_data) is None


def test_apartment_maintenance_cost_path_unaffected_by_officetel_fallback():
    """아파트 기존 경로(costsByDate 미지원 상태 포함)는 오피스텔 폴백 추가로 회귀하지 않는다.

    ⚠ administrationCostInfo 가 응답에 아예 없는 아파트 케이스 — 폴백이 발동하지
    않고 기존 동작(dict 형식 averageTotalPrice 처리)이 그대로 유지되는지 확인.
    """
    # 단순 문자열 값(기존 최우선 분기) — administrationCostInfo 유무와 무관하게 그대로.
    simple = _extract_maintenance_from_detail({
        "articleDetail": {"maintenanceCost": "15"},
        "administrationCostInfo": {"etcFeeDetails": {"etcFeeAmount": 90000}},
    })
    assert simple == "15", "articleDetail.maintenanceCost 가 있으면 폴백을 타면 안 된다"

    # dict 형식(averageTotalPrice) — 기존 로직 그대로 /10000 변환.
    dict_form = _extract_maintenance_from_detail({
        "articleDetail": {"maintenanceCost": {"averageTotalPrice": "297616"}},
    })
    assert dict_form == "30"  # round(297616/10000) = 30


def test_officetel_maintenance_cost_carries_to_build_detail_update_dict():
    """도메인 객체 update_from_detail → build_detail_update_dict 까지 오피스텔 관리비가 전달된다.

    articleDetail.maintenanceCost 가 None 이라 domain_article.maintenance_cost 는 채워지지
    않고(falsy), build_detail_update_dict 의 `maint is None and detail_data` 폴백 경로가
    _extract_maintenance_from_detail 을 호출해 오피스텔 값을 실어야 한다.
    """
    detail_data = {
        "articleDetail": {"maintenanceCost": None},
        "administrationCostInfo": {"etcFeeDetails": {"etcFeeAmount": 90000}},
    }
    art = _make_domain()
    art.update_from_detail(detail_data)
    assert art.maintenance_cost is None  # 도메인 레벨에서는 아직 안 채워짐(정상)

    update = build_detail_update_dict(art, detail_data)
    assert update["maintenance_cost"] == "9"
