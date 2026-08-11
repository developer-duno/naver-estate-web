"""수집기 감시 커버리지 CI 강제화 (세션 359)

crawler/scheduler.py 에 새 스케줄러 잡을 추가하면서 신선도 감시 등록
(routers/admin/freshness_meta.py FRESHNESS_ITEMS) 을 깜빡하는 실수를 CI 가
구조적으로 막는다. mibunyang 프로젝트의 audit-monitor-coverage.mjs
RECORD_ALLOWLIST 패턴을 naver-estate(Python + APScheduler)에 맞게 이식.

핵심 불변식: extract_scheduler_job_ids() 가 뽑은 모든 잡 id 는
  FRESHNESS_ITEMS 의 scheduler_job_id 값들 ∪ MONITORING_EXEMPT 의 키들
안에 있어야 한다. 하나라도 빠지면 "새 잡을 만들고 감시도 예외 등록도
깜빡했다"는 뜻 — 그 잡 이름을 테스트 실패 메시지가 직접 알려준다.

실행: python -m pytest tests/test_scheduler_monitoring_coverage.py -v
"""

from crawler.scheduler import _ADD_JOB_CALL_PATTERN, extract_scheduler_job_ids
from routers.admin.freshness_meta import FRESHNESS_ITEMS, MONITORING_EXEMPT

with open("crawler/scheduler.py", encoding="utf-8") as f:
    _SCHEDULER_SOURCE = f.read()


def _covered_job_ids() -> set[str]:
    """FRESHNESS_ITEMS(scheduler_job_id) ∪ MONITORING_EXEMPT(키) 합집합."""
    from_freshness = {
        item["scheduler_job_id"] for item in FRESHNESS_ITEMS if item.get("scheduler_job_id")
    }
    from_exempt = set(MONITORING_EXEMPT.keys())
    return from_freshness | from_exempt


# ── 테스트 A: extract_scheduler_job_ids() 자체가 실제 파일을 정확히 파싱하는가 ──


def test_extract_scheduler_job_ids_finds_static_literals():
    """crawler/scheduler.py 실 소스에서 정적 id="..." 리터럴을 전부 뽑는다.

    ⚠ 범위 = "정적 문자열 리터럴"만. create_scheduler() 안에는 for 루프로
    id 를 동적 생성하는 add_job 호출이 2곳 있다 — 그 안에서 실제로 등록되는
    popular_1030/1430/1900, complex_detail_JGC/ABYG/OBYG 6개는 소스 텍스트
    정규식 파싱만으로는 안전하게 전개할 수 없어(루프 변수 실행 필요) 이
    함수의 검증 범위 밖이다(scheduler.py extract_scheduler_job_ids docstring
    답습). 아래 기대값은 세션 359 시점 실제 파일을 Read 로 직접 세어 확정.
    """
    ids = extract_scheduler_job_ids(_SCHEDULER_SOURCE)

    # 정적 리터럴은 정확히 19개 — 중복 없이.
    assert len(ids) == len(set(ids)), f"id 중복 발견: {ids}"
    assert len(ids) == 19, (
        f"정적 add_job id 리터럴 개수가 19가 아님 (실제 {len(ids)}개): {ids}. "
        "scheduler.py 에 잡이 추가/삭제됐으면 이 테스트의 기대값도 함께 갱신할 것."
    )

    expected = {
        "discover_regions", "crawl_articles", "crawl_details", "collect_prices",
        "backfill_price", "complex_detail_APT", "complex_detail_OPST",
        "collect_public_trades", "collect_officetel_presale", "collect_rental_presale",
        "official_price", "collect_air_quality", "collect_emergency", "collect_childcare",
        "collect_crime_stats", "crawler_monitor", "collect_metrics", "billing_charge",
        "vacuum_maintenance",
    }
    assert set(ids) == expected, (
        f"추출된 id 집합이 기대와 다름. 누락={expected - set(ids)}, 초과={set(ids) - expected}"
    )


def test_extract_scheduler_job_ids_ignores_non_id_keyword_strings():
    """add_job( 호출 밖의 다른 id="..." 유사 문자열(주석·docstring 예시)에 오염되지 않는다.

    구현 중 실측 발견: 파일 전체를 무차별로 id="..." 패턴 스캔하면, 설명
    주석·docstring 안에 예시로 적힌 id="..." 문구까지 오탐으로 잡힌다 —
    이 문제로 extract_scheduler_job_ids() 를 "각 add_job( 호출부터 다음
    add_job( 까지" 블록 단위 파싱으로 재구현했다(scheduler.py 상단 주석
    답습). 이 테스트는 그 오탐이 실제로 차단됐는지 확인하는 회귀 가드.
    """
    fake_source = '''
def create_scheduler():
    # 이 주석은 예시로 id="fake_example" 같은 문구를 언급하지만 이건 add_job
    # 호출이 아니다 — 실제로는 아래 add_job 만 잡혀야 한다.
    scheduler.add_job(
        real_job_func,
        "cron",
        hour=3,
        id="real_job",
        name="진짜 잡",
    )
'''
    ids = extract_scheduler_job_ids(fake_source)
    assert "fake_example" not in ids, "주석 안 id=\"...\" 문구가 오탐으로 잡힘"
    assert ids == ["real_job"]


# ── 테스트 B (핵심): 추출된 모든 잡 id 가 감시 또는 예외 목록에 있어야 한다 ──


def test_all_scheduler_jobs_are_monitored_or_exempt():
    """새 스케줄러 잡을 추가하면서 감시 등록을 깜빡하면 이 테스트가 실패한다.

    extract_scheduler_job_ids() 가 뽑은 정적 id 전부가
    (FRESHNESS_ITEMS 의 scheduler_job_id) ∪ (MONITORING_EXEMPT 의 키)
    안에 있어야 한다.
    """
    job_ids = set(extract_scheduler_job_ids(_SCHEDULER_SOURCE))
    covered = _covered_job_ids()

    missing = job_ids - covered
    assert not missing, (
        f"신선도 감시(FRESHNESS_ITEMS)에도 예외 목록(MONITORING_EXEMPT)에도 "
        f"없는 스케줄러 잡 발견: {sorted(missing)}. "
        "routers/admin/freshness_meta.py 의 FRESHNESS_ITEMS 에 신선도 카드를 "
        "추가하거나, 정당한 예외라면 MONITORING_EXEMPT 에 이유와 함께 등록할 것."
    )


# ── 테스트 C (부수 검증): MONITORING_EXEMPT·FRESHNESS_ITEMS 쪽 오타 방지 ──


def test_monitoring_exempt_keys_exist_in_scheduler():
    """MONITORING_EXEMPT 의 키가 실제로 scheduler.py 에 존재하는 id 인지 확인.

    오타로 예외 목록에 존재하지 않는 잡 이름을 넣으면(예: "discover_region"
    처럼 s 빠뜨림) 그 오타 잡은 실제로는 누락 상태인데 테스트 B 가 통과해버려
    본래 목적(누락 방지)이 무력화된다 — 이를 막는 정합성 가드.
    """
    job_ids = set(extract_scheduler_job_ids(_SCHEDULER_SOURCE))
    bogus = set(MONITORING_EXEMPT.keys()) - job_ids
    assert not bogus, (
        f"MONITORING_EXEMPT 에 scheduler.py 에 실존하지 않는 id 발견(오타 의심): "
        f"{sorted(bogus)}"
    )


def test_freshness_items_scheduler_job_ids_exist_in_scheduler():
    """FRESHNESS_ITEMS 의 scheduler_job_id(None 제외)도 마찬가지로 실존 확인."""
    job_ids = set(extract_scheduler_job_ids(_SCHEDULER_SOURCE))
    referenced = {
        item["scheduler_job_id"] for item in FRESHNESS_ITEMS if item.get("scheduler_job_id")
    }
    bogus = referenced - job_ids
    assert not bogus, (
        f"FRESHNESS_ITEMS 의 scheduler_job_id 중 scheduler.py 에 실존하지 않는 "
        f"id 발견(오타 의심): {sorted(bogus)}"
    )


# ── 테스트 D (핵심 회귀 가드): 새 잡을 고의로 빠뜨리면 실제로 잡히는가 ──


def test_extract_scheduler_job_ids_finds_new_fake_job():
    """가짜 스케줄러 소스에 새 잡을 심으면 extract_scheduler_job_ids() 가 뽑는다."""
    fake_source = '''
def create_scheduler():
    scheduler.add_job(
        discover_all_regions,
        "cron",
        day_of_week="sun",
        hour=3,
        id="discover_regions",
        name="전국 단지 발견",
    )
    scheduler.add_job(
        some_new_collector,
        "interval",
        minutes=15,
        id="fake_new_job_no_monitoring",
        name="새로 추가된 미등록 수집기",
    )
'''
    ids = extract_scheduler_job_ids(fake_source)
    assert "fake_new_job_no_monitoring" in ids
    assert "discover_regions" in ids
    assert len(ids) == 2


def test_missing_monitoring_coverage_is_detected_for_new_job():
    """새 잡이 FRESHNESS_ITEMS·MONITORING_EXEMPT 어디에도 없으면 커버리지
    계산이 실제로 "누락 있음"을 보고하는지 직접 시뮬레이션.

    test_all_scheduler_jobs_are_monitored_or_exempt() 와 동일한 로직을
    가짜 잡 id 집합에 적용 — 실제 pytest 서브프로세스 실행 없이, 커버리지
    판정 로직 자체가 새 잡 누락을 놓치지 않는지 단위 검증한다.
    """
    fake_job_ids = {"discover_regions", "fake_new_job_no_monitoring"}
    covered = _covered_job_ids()

    missing = fake_job_ids - covered
    assert missing == {"fake_new_job_no_monitoring"}, (
        f"고의로 심은 미등록 잡이 커버리지 계산에서 감지되지 않음: missing={missing}"
    )


def test_missing_monitoring_coverage_passes_when_job_added_to_exempt():
    """MONITORING_EXEMPT 에 이유와 함께 등록하면 같은 잡이 더 이상 누락으로
    안 잡히는지 확인 — "예외 등록이 실제로 통과 경로로 동작한다"는 대조군.
    """
    fake_job_ids = {"discover_regions", "fake_new_job_no_monitoring"}
    covered = _covered_job_ids() | {"fake_new_job_no_monitoring"}

    missing = fake_job_ids - covered
    assert not missing


# ── 테스트 E: 정적→동적 id 전환으로 커버리지가 "몰래" 새는 것을 막는다 ──
#
# 세션 359 적대검증에서 발견: extract_scheduler_job_ids() 는 동적 id 블록을
# 오탐 없이 건너뛰도록(의도적) 설계됐는데, 이 설계의 부작용으로 "지금 정적
# id 로 감시되는 잡을 누군가 반복문(동적 id)으로 리팩토링하면 그 잡이
# 감시 대상에서 조용히 사라지는데도 테스트 B 는 계속 통과"하는 반대 방향
# 사각지대가 생긴다 — 오탐(false RED) 걱정과 정반대인 무탐(false GREEN) 위험.
# .add_job( 호출 총수 vs 정적 id 추출 개수의 차이(=동적 블록 수)가 지금
# 알려진 값(2, docstring 에 명시된 popular_*/complex_detail_{JGC,ABYG,OBYG})
# 을 넘어서면 실패시켜, 새로 생긴 동적 전환을 사람이 놓치지 않게 한다.
_KNOWN_DYNAMIC_ID_BLOCKS = 2  # scheduler.py 82~102줄 docstring 에 명시된 개수


def test_dynamic_id_blocks_do_not_silently_increase():
    """정적 id 로 등록됐던 잡이 동적 id(f-string/루프 변수)로 바뀌면
    add_job 호출 총수는 그대로인데 정적 id 추출 개수만 줄어든다 — 그 차이가
    현재 알려진 동적 블록 수(2)를 넘으면 "새로 동적화된 잡"이 생긴 것.
    """
    total_calls = len(_ADD_JOB_CALL_PATTERN.findall(_SCHEDULER_SOURCE))
    static_ids = extract_scheduler_job_ids(_SCHEDULER_SOURCE)
    dynamic_blocks = total_calls - len(static_ids)

    assert dynamic_blocks == _KNOWN_DYNAMIC_ID_BLOCKS, (
        f".add_job( 호출 {total_calls}개 중 정적 id 는 {len(static_ids)}개, "
        f"동적(id 미검출) 블록은 {dynamic_blocks}개 — 기대값 {_KNOWN_DYNAMIC_ID_BLOCKS}개와 "
        "다릅니다. 정적 id 잡을 동적 id 로 리팩토링했다면, extract_scheduler_job_ids() "
        "가 그 잡을 더 이상 감시 대상으로 못 뽑아 테스트 B(누락 감지)가 무력화됩니다. "
        "새 동적 블록을 routers/admin/scheduler.py SCHEDULER_JOB_META 와 이 테스트의 "
        "_KNOWN_DYNAMIC_ID_BLOCKS 값에 함께 반영하고, 가능하면 freshness_meta.py 쪽 "
        "감시(또는 MONITORING_EXEMPT 이유 등록)도 갖추세요."
    )
