"""공동주택 공시가격 수집 — V-WORLD getApartHousingPriceAttr → complex_official_prices.

법정동(cortar_no 10자리) 단위로 공시가격 전량을 받아 우리 단지(APT·JGC)에 매칭하고,
(단지 × 기준연도 × 전용면적) 중위 공시가격을 저장한다. 보유세 계산기 자동입력과
단지 상세 표시의 원천 데이터.

매칭은 **보수적으로** 한다 — 세금 계산에 쓰이는 값이라 "틀린 값 < 값 없음" 이다
(플랜 §3-2-5, 부평동 오매칭 52건 실측 근거). 세대수 ±5% 게이트를 통과한 후보가
2개 이상이면 임의로 고르지 않고 그 단지는 아예 저장하지 않는다.

네이버 API 를 전혀 쓰지 않으므로 IP 차단·data.go.kr 공유 쿼터와 무관하다.
"""

import logging
import os
import re
import statistics
import time
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from crawler.cortar_legacy import to_vworld_cortar
from crawler.env_common import _complete_job, _fail_job, _record_job
from crawler.service_common import RESUME_MAX_AGE_HOURS, _checkpoint
from db.database import SessionLocal
from db.models import Complex, ComplexOfficialPrice, CrawlJob
from services.upsert import _do_upsert
from utils import utcnow

logger = logging.getLogger(__name__)

# 공시가격 대상 매물유형 — 아파트·재건축만. 오피스텔(OPST)·분양권(ABYG/OBYG/PRE)은
# 공동주택가격 공시 대상 체계가 달라 제외 (플랜 §2 실측: APT 47,054 + JGC 1,011).
TARGET_TYPE_CODES = ("APT", "JGC")

# 세대수 게이트 허용 오차 — 정상 매칭의 (공시 호수 / 우리 세대수) 비율 중앙값이 1.000
# 이라 ±5% 로 충분하다. ±20% 로 넓히면 오매칭만 늘어난다 (플랜 §3-2-5 실측).
HOUSEHOLD_TOLERANCE = 0.05

# 공시 기준월 방어 필터 — 실측상 전 지역이 '01' 뿐이나, 반기 공시가 생기면
# 같은 호가 2번 잡혀 중위값이 왜곡되므로 '01' 만 채택한다.
TARGET_STDR_MT = "01"

# 재수집 패스 상한 — V-WORLD 전면 장애로 전량 소실 판정이 나도 재조회가 폭주하지 않게
# 법정동 수를 캡한다. 정상 실행의 소실은 한 자릿수라(세션 370 실측 5단지) 충분하다.
_REPASS_MAX_DONGS = 20

# 붕괴 조기 이탈 임계 — 소실이 이 수를 넘으면 페이지 드리프트가 아니라 시스템 이상
# (매칭 규칙 붕괴·API 응답 구조 변경 등)으로 본다. 드리프트 소실은 실측 한 자릿수라
# 200 이면 충분한 여유이며, 이 경우 재수집은 구제가 아니라 무의미한 폭주가 된다.
_REPASS_COLLAPSE_THRESHOLD = 200

# 재수집 벽시계 캡 — 현실 소실은 한 자릿수라 재수집이 수 분에 끝나지만, 이론 최악
# (대형 동 20개 전부 재조회)은 ~1.8h 가 된다. 1h 로 끊어 "본 루프 최악 7h + 재수집 1h
# = 8h < 16h(monitor stale 예외)" 여유를 보장한다. 이로써 재수집 상한이
# 규모(_REPASS_MAX_DONGS)·이상(_REPASS_COLLAPSE_THRESHOLD)·시간 3중 방어가 된다.
_REPASS_MAX_SECONDS = 3600

_PAREN = re.compile(r"\([^)]*\)")
# 꼬리 동목록 — "대치우성아파트1동 2동 3동 5동 6동 7동" 처럼 공시측 단지명 끝에
# 동 번호가 나열되는 실제 패턴(라이브 실측)을 제거한다.
_TAIL_DONG_LIST = re.compile(r"(\d+\s*동[\s,]*)+$")
# 차수 표기 통일 — "래미안2차" / "래미안 2 차" / "래미안II" 류의 표기 흔들림 흡수.
_CHASU = re.compile(r"(\d+)\s*차")
_NON_ALNUM_KO = re.compile(r"[^0-9A-Za-z가-힣]")


def normalize_complex_name(name: str | None) -> str:
    """단지명 정규화 — 우리 DB 이름과 공시 단지명을 같은 축으로 맞춘다.

    순서가 중요하다: 괄호 제거 → 꼬리 동목록 제거 → "아파트" 제거 → 차수 통일 →
    나머지 특수문자·공백 제거. 꼬리 동목록을 "아파트" 제거보다 먼저 지워야
    "대치우성아파트1동 2동" 이 "대치우성" 으로 수렴한다.
    """
    if not name:
        return ""
    s = _PAREN.sub("", str(name)).strip()
    s = _TAIL_DONG_LIST.sub("", s).strip()
    s = s.replace("아파트", "")
    s = _CHASU.sub(r"\1차", s)  # "2 차" → "2차"
    s = _NON_ALNUM_KO.sub("", s)
    return s.upper()


def _to_area(raw) -> Decimal | None:
    """전용면적 문자열 → Decimal (소수 2자리).

    ⚠ float 를 경유하면 안 된다 — PG NUMERIC(8,2) 반올림과 어긋나면 같은 평형이
    별개 행으로 쌓인다(복합 충돌키의 한 축). 문자열에서 곧바로 Decimal 로 간다.
    """
    if raw is None:
        return None
    try:
        return Decimal(str(raw).strip()).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError, ArithmeticError):
        return None


def _to_price(raw) -> int | None:
    """공시가격 문자열(원 단위) → int. 0·음수·파싱 실패는 None."""
    if raw is None:
        return None
    try:
        value = int(str(raw).strip())
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def _group_by_aphus(rows: list[dict]) -> dict[str, dict]:
    """공시 행들을 단지(aphusCode) 단위로 묶는다.

    반환: {aphusCode: {"name": 대표 단지명, "ho_keys": {(dongNm,hoNm)}, "rows": [...]}}
    stdrMt 방어 필터(=TARGET_STDR_MT)를 여기서 적용한다.
    """
    grouped: dict[str, dict] = {}
    for row in rows:
        if (row.get("stdrMt") or "").strip() != TARGET_STDR_MT:
            continue
        code = (row.get("aphusCode") or "").strip()
        if not code:
            continue
        group = grouped.get(code)
        if group is None:
            group = {"name": (row.get("aphusNm") or "").strip(), "ho_keys": set(), "rows": []}
            grouped[code] = group
        group["ho_keys"].add((row.get("dongNm"), row.get("hoNm")))
        group["rows"].append(row)
    return grouped


def _household_gate_ok(ho_count: int, household_count: int | None) -> bool:
    """공시측 유니크 호수 vs 우리 세대수 ±5% 게이트.

    세대수(total_household_count)가 없으면 대조 기준이 없어 통과시키지 않는다 —
    APT/JGC 실측 NULL 0건이라 이 분기는 사실상 방어용이다.
    """
    if not household_count or household_count <= 0:
        return False
    ratio = ho_count / household_count
    return (1 - HOUSEHOLD_TOLERANCE) <= ratio <= (1 + HOUSEHOLD_TOLERANCE)


def match_complex_group(
    complex_name: str,
    household_count: int | None,
    grouped_by_name: dict[str, list[tuple[str, dict]]],
) -> tuple[str, dict] | None:
    """단지 하나에 대응하는 공시 단지 그룹을 찾는다. 못 찾거나 모호하면 None.

    Args:
        complex_name: 우리 DB 단지명
        household_count: 우리 DB 세대수
        grouped_by_name: {정규화이름: [(aphusCode, group), ...]}

    규칙(플랜 §3-2-5):
      1) 정규화 이름 완전일치 후보만 본다.
      2) 세대수 ±5% 게이트를 통과한 후보만 남긴다.
      3) 남은 후보가 정확히 1개일 때만 채택 — 2개 이상이면 폐기(임의 선택 금지).
    """
    key = normalize_complex_name(complex_name)
    if not key:
        return None
    candidates = grouped_by_name.get(key) or []
    passed = [
        (code, group)
        for code, group in candidates
        if _household_gate_ok(len(group["ho_keys"]), household_count)
    ]
    if len(passed) != 1:
        return None
    return passed[0]


def aggregate_area_medians(rows: list[dict]) -> list[tuple[Decimal, int, int]]:
    """공시 행들을 전용면적별 중위 공시가격으로 집계.

    Returns: [(prvuse_ar, price_median, ho_count), ...] — 면적 오름차순.
    같은 면적의 여러 호(dongNm/hoNm)를 중위값으로 묶고 표본 수를 남긴다.
    """
    buckets: dict[Decimal, list[int]] = {}
    for row in rows:
        area = _to_area(row.get("prvuseAr"))
        price = _to_price(row.get("pblntfPc"))
        if area is None or price is None:
            continue
        buckets.setdefault(area, []).append(price)

    result = []
    for area in sorted(buckets):
        prices = buckets[area]
        result.append((area, int(statistics.median(prices)), len(prices)))
    return result


def _alert_official_price(message: str) -> None:
    """운영 텔레그램 알림 — 실패해도 수집을 죽이지 않는다(best-effort, lazy import).

    job_error_listener._send_alert 패턴 답습. TELEGRAM_ENABLED 토글을 공유하며,
    테스트에서는 conftest 가 그 토글을 false 로 강제해 실발송이 0 이다(세션 325 사고 답습).
    """
    try:
        from services.telegram import send_telegram

        send_telegram(message)
    except Exception:
        logger.warning("[official_price] 텔레그램 알림 발송 실패", exc_info=True)


def _save_matched_areas(db, complex_no: str, year: str, aphus_code: str, group: dict) -> int:
    """매칭된 공시 그룹을 평형별 중위가로 저장. 반환: 저장한 행 수(0 이면 미저장).

    본 루프와 재수집 패스가 같은 저장 규칙을 쓰도록 한 곳에 모은 것뿐이다.
    """
    areas = aggregate_area_medians(group["rows"])
    for area, median_price, ho_count in areas:
        _do_upsert(
            db,
            ComplexOfficialPrice,
            {
                "complex_no": complex_no,
                "stdr_year": year,
                "prvuse_ar": area,
                "price_median": median_price,
                "ho_count": ho_count,
                "aphus_code": aphus_code,
                "aphus_nm": group["name"],
                "collected_at": utcnow(),
            },
            ["complex_no", "stdr_year", "prvuse_ar"],
        )
    return len(areas)


def _index_groups_by_name(rows: list[dict]) -> dict[str, list[tuple[str, dict]]]:
    """공시 행 → {정규화 단지명: [(aphusCode, group), ...]} 매칭용 색인."""
    grouped_by_name: dict[str, list[tuple[str, dict]]] = {}
    for code, group in _group_by_aphus(rows).items():
        grouped_by_name.setdefault(normalize_complex_name(group["name"]), []).append(
            (code, group)
        )
    return grouped_by_name


def _find_regressed_targets(
    db, targets: list, matched_complex_nos: set[str], processed_ld_codes: set[str], year: str
):
    """이번 실행에서 매칭이 '소실'된 단지 목록 — 올해 값이 있었는데 이번엔 못 붙은 것.

    V-WORLD 페이지네이션이 불안정해 같은 법정동을 연속 조회해도 총행수는 같은데 행
    구성이 다르다(중복+누락). 대형 단지가 뒷페이지에 몰려 유니크 호수가 실행마다
    흔들리고, 세대수 ±5% 게이트에서 비결정적으로 탈락한다(세션 370 라이브 실증:
    은마 유니크 호수 1차 3,947(탈락) vs 2차 4,320(통과)). 기존 행수 정합성 가드는
    총량이 맞아떨어져 못 잡는다.

    소실 판정 3조건 (AND) — 셋 다 있어야 오탐이 안 난다:
      1) 이번 실행에서 미매칭
      2) **이번 실행이 실제로 조회한 법정동**(processed_ld_codes)에 속함 — 체크포인트로
         스킵된 동(재개 실행의 관할 밖)과 조회 실패한 동(원인이 API 다운이지 매칭
         문제가 아님)을 동시에 배제한다. 이게 빠지면 재개 실행에서 수천~만 단지가
         한꺼번에 소실로 오판돼 진짜 드리프트 소실이 거짓 경보에 묻힌다.
      3) **올해(stdr_year=year) 행 보유** — 연도 무필터면 작년 행만 있는 단지가 연초
         (공시 미발표) 실행마다 소실로 잡혀 오탐이 폭발하고, 영구 미매칭 단지가 매달
         재판정돼 경보 피로를 만든다.

    판정은 "올해 행이 있었나" **존재 여부만** 본다 — 수집 시각의 크기 비교는 하지 않는다
    (관할 범위는 위 2)의 processed_ld_codes 가 이미 가른다). collected_at 이 NULL 인
    행만 가진 단지는 제외 = 신규 취급 — 수집 시각을 모르면 '과거에 있었다'를 주장할 수 없다.
    """
    if not processed_ld_codes:
        return []

    candidates = [
        t
        for t in targets
        if t.complex_no not in matched_complex_nos and t.cortar_no in processed_ld_codes
    ]
    if not candidates:
        return []

    # 전체 단지를 IN 절에 넣지 않는다(수만 개) — 올해 행 보유 단지를 통째로 뽑아 Python 에서 교집합.
    prior_seen = {
        row[0]
        for row in db.query(ComplexOfficialPrice.complex_no)
        .filter(
            ComplexOfficialPrice.stdr_year == year,
            ComplexOfficialPrice.collected_at.isnot(None),
        )
        .distinct()
        .all()
    }

    return [t for t in candidates if t.complex_no in prior_seen]


def collect_official_prices(
    stdr_year: str | None = None,
    scheduler_job_id: str | None = None,
):
    """공동주택 공시가격 수집 — 법정동 루프 → 단지 매칭 → 평형별 중위가 저장.

    Args:
        stdr_year: 기준연도 4자리 문자열. 미지정 시 현재 연도.
        scheduler_job_id: 스케줄러 잡 ID (관리자 화면 last_run 표시용)

    토글: OFFICIAL_PRICE_ENABLED (기본 false). 꺼져 있으면 cancelled 로 기록만 남긴다.
    """
    if os.getenv("OFFICIAL_PRICE_ENABLED", "false").strip().lower() != "true":
        logger.info("[official_price] OFFICIAL_PRICE_ENABLED 미설정 — 공시가격 수집 건너뜀")
        if scheduler_job_id:
            db = SessionLocal()
            try:
                job = _record_job(db, "official_price", scheduler_job_id)
                job.status = "cancelled"
                job.error_message = "OFFICIAL_PRICE_ENABLED 미설정"
                job.completed_at = utcnow()
                db.commit()
            finally:
                db.close()
        return

    year = (stdr_year or str(date.today().year)).strip()

    # lazy import — import chain 실패 방지 (service_public.py 답습)
    from crawler.vworld_price_api import fetch_official_prices

    db = SessionLocal()

    # 재개(resume) — 직전 중단분의 체크포인트를 이어받는다. 최근 N건을 최신순으로 훑어
    # 체크포인트가 실제로 있는 첫 job 을 찾는다(연속 2회 실패 시 2번째 job 이 자기
    # 체크포인트를 저장하기 전에 죽으면 진행분이 유실되던 세션 346 사고 답습).
    #
    # ⚠ 건수 상한(10)만으론 부족하다(세션 370 발견) — 실패 잡의 체크포인트는 영구 잔존하고
    # 이 잡은 월 1회라 신규 실패가 쌓여 밀려나지도 않는다. 9/15 실행이 중간 실패하고 아무도
    # 재트리거 안 하면 10/15 정기 실행이 지난달 "완료 목록"을 이어받아 그 절반을 스킵하고,
    # 연도가 넘어가면 작년 완료 마커로 올해 수집을 스킵한다(체크포인트에 연도 정보 없음).
    # 재개는 "중단 직후 곧 재실행" 의도이므로 신선도(RESUME_MAX_AGE_HOURS)로 함께 막는다.
    done_ld_codes: set[str] = set()
    resume_cutoff = utcnow() - timedelta(hours=RESUME_MAX_AGE_HOURS)
    recent_stopped_jobs = (
        db.query(CrawlJob)
        .filter(
            CrawlJob.job_type == "official_price",
            CrawlJob.status.in_(["failed", "cancelled"]),
            CrawlJob.started_at >= resume_cutoff,
        )
        .order_by(CrawlJob.id.desc())
        .limit(10)
        .all()
    )
    for prev_job in recent_stopped_jobs:
        prev_state = _checkpoint.load(db, prev_job.id)
        if prev_state and prev_state.get("done_ld_codes"):
            done_ld_codes = set(prev_state["done_ld_codes"])
            logger.info(
                "[official_price] 재개: 이전 job %d 에서 법정동 %d개 완료분 이어받음",
                prev_job.id, len(done_ld_codes),
            )
            break

    job = _record_job(db, "official_price", scheduler_job_id or "collect_official_prices")

    try:
        # cortar_no 가 없는 대상은 조회 자체가 불가 — 건수만 남긴다(플랜 §2).
        missing_cortar = (
            db.query(Complex.complex_no)
            .filter(
                Complex.real_estate_type_code.in_(TARGET_TYPE_CODES),
                Complex.cortar_no.is_(None),
            )
            .count()
        )
        if missing_cortar:
            logger.info("[official_price] cortar_no 없는 대상 %d개 제외", missing_cortar)

        targets = (
            db.query(
                Complex.complex_no,
                Complex.complex_name,
                Complex.cortar_no,
                Complex.total_household_count,
            )
            .filter(
                Complex.real_estate_type_code.in_(TARGET_TYPE_CODES),
                Complex.cortar_no.isnot(None),
            )
            .all()
        )

        # 법정동별로 우리 단지를 묶는다 — API 호출 단위가 법정동이므로.
        by_ld_code: dict[str, list] = {}
        for row in targets:
            by_ld_code.setdefault(row.cortar_no, []).append(row)

        all_ld_codes = sorted(by_ld_code)
        remaining = [c for c in all_ld_codes if c not in done_ld_codes]
        logger.info(
            "[official_price] %s년 수집 시작: 단지 %d개 / 법정동 %d개 중 %d개 남음",
            year, len(targets), len(all_ld_codes), len(remaining),
        )

        matched_complexes = 0
        saved_rows = 0
        failed_ld_codes = 0
        failed_ld_codes_list: list[str] = []
        # 이번 실행에서 실제로 매칭된 단지 — 재수집 패스의 '소실' 판정 기준.
        matched_complex_nos: set[str] = set()
        # 이번 실행이 **조회에 성공한** 법정동 — 소실 판정의 관할 범위.
        # 체크포인트로 스킵된 동·조회 실패한 동은 여기 안 들어가 자연 배제된다.
        processed_ld_codes: set[str] = set()

        for idx, ld_code in enumerate(remaining):
            # 전 페이지 수집 완료 후에만 매칭 — 부분 수집 시 세대수 게이트가 통째로
            # 어긋난다(V-WORLD 가 대형 단지를 뒷페이지에 배치, 플랜 §3-2-5).
            #
            # ⚠ 조회 직전에만 V-WORLD 용 코드로 번역한다(cortar_legacy.py 참조).
            # 두 가지가 걸린다 — ① 광주·전남 12-프리픽스(V-WORLD 는 옛 29/46 만 받음)
            # ② 2026 개편 신코드(V-WORLD 는 아직 개편 전 옛 코드에만 데이터 보유).
            # ②는 **공시가격 전용**이라 to_standard_cortar 가 아니라 to_vworld_cortar 를
            # 쓴다 — 국토부 실거래가는 정반대로 신 코드를 받기 때문이다.
            # 루프 키·체크포인트(done_ld_codes)는 **원본 그대로** 둬야 재개 호환이
            # 깨지지 않는다.
            rows = fetch_official_prices(to_vworld_cortar(ld_code), year)
            if rows is None:
                # 4번째 재시도 계층 — vworld_price_api.py 내부에 이미 429 전용
                # MAX_RETRIES=3 재시도가 있지만, 그건 페이지 단위(1회 호출)의 순간적인
                # rate limit 만 흡수한다. 이건 그 위에 얹는 법정동 단위 1회 재시도다 —
                # 대형 법정동(대치동 49페이지 등)은 페이지 수가 많아 그 사이 어딘가
                # 일시적 네트워크 오류·타임아웃으로 통째 실패하는 빈도가 높은데, 몇 초
                # 후 재시도하면 살아나는 경우가 실측상 다수라 여기서 한 번 더 감아준다.
                time.sleep(2)
                rows = fetch_official_prices(to_vworld_cortar(ld_code), year)
            if rows is None:
                failed_ld_codes += 1
                failed_ld_codes_list.append(ld_code)
                logger.warning("[official_price] 법정동 %s 조회 실패 — 건너뜀", ld_code)
                continue

            # 조회 성공 — 빈 리스트(공시 0건인 동)도 성공이다. 소실 판정 관할에 넣는다.
            processed_ld_codes.add(ld_code)
            grouped_by_name = _index_groups_by_name(rows)

            for target in by_ld_code[ld_code]:
                hit = match_complex_group(
                    target.complex_name, target.total_household_count, grouped_by_name
                )
                if hit is None:
                    continue
                aphus_code, group = hit

                n_saved = _save_matched_areas(db, target.complex_no, year, aphus_code, group)
                if not n_saved:
                    continue
                saved_rows += n_saved
                matched_complexes += 1
                matched_complex_nos.add(target.complex_no)

            done_ld_codes.add(ld_code)

            # 체크포인트 — 완료된 법정동 코드 집합 저장 (재개 시 이 집합을 건너뜀).
            if _checkpoint.should_save(idx + 1):
                db.commit()
                _checkpoint.save(
                    db, job.id,
                    {"done_ld_codes": sorted(done_ld_codes), "total": len(all_ld_codes)},
                )
                logger.info(
                    "[official_price] 중간 저장: 법정동 %d/%d 완료, 단지 %d개 매칭",
                    len(done_ld_codes), len(all_ld_codes), matched_complexes,
                )

        db.commit()

        # 체크포인트는 **본 루프 완주 시점**에 지운다 — 이후 단계(재수집)에서 죽어도
        # 다음 주기가 낡은 완료 마커를 이어받아 "거의 다 했다"고 착각하며 아무것도
        # 안 하는 사태를 막는다.
        #
        # 대가로 삭제~완료 사이에 강제종료되면 재실행이 전량 재수집이 되는 창이 생긴다.
        # 그래도 수용한다 — 월 1회 잡의 최대 ~1시간짜리 창이고(_REPASS_MAX_SECONDS 캡으로 바운드) 이미
        # 커밋된 데이터는 무손실이라 손해가 재크롤 시간뿐이다. 진짜 재개를 하려면 이번
        # 실행의 매칭 단지 ~2.5만 개를 체크포인트 blob 에 영속해야 해서 그 비용·신규
        # 실패 모드가 기대이익을 넘는다(세션 371 설계노트).
        _checkpoint.delete(db, job.id)

        # ── 매칭 소실 재수집 패스 ──
        # V-WORLD 는 같은 법정동을 연속 조회해도 총행수만 같고 행 구성이 달라진다
        # (중복+누락). 그래서 대형 단지가 한 번은 게이트를 통과하고 한 번은 탈락한다.
        # 두 번째 표본을 떠서 구제하는 것이 이 패스의 전부다 — 매칭 규칙 자체는 그대로.
        #
        # 전체를 try 로 감싼다 — 구제는 best-effort 라, 재수집 중 예외가 본 수집 성공을
        # 실패로 뒤집으면 안 된다(그 경우 outer except 로 빠져 job 이 failed 가 된다).
        rescued = 0
        repass_fetch_failed = 0
        try:
            regressed = _find_regressed_targets(
                db, targets, matched_complex_nos, processed_ld_codes, year
            )

            if len(regressed) > _REPASS_COLLAPSE_THRESHOLD:
                # 드리프트가 아니라 시스템 이상 — 재수집은 구제가 아니라 폭주가 된다.
                logger.error(
                    "[official_price] 매칭 소실 %d단지로 임계 %d 초과 — 페이지 드리프트가"
                    " 아니라 시스템 이상 의심, 재수집 생략",
                    len(regressed), _REPASS_COLLAPSE_THRESHOLD,
                )
                job.error_message = (
                    f"매칭 소실 {len(regressed)}단지로 임계 {_REPASS_COLLAPSE_THRESHOLD} 초과"
                    " — 시스템 이상 의심, 재수집 생략"
                )[:500]
                db.commit()
                _alert_official_price(
                    f"[내부즉시] 공동주택 공시가격 — 매칭 소실 {len(regressed)}단지로 임계"
                    f" {_REPASS_COLLAPSE_THRESHOLD} 초과. 페이지 드리프트가 아니라 시스템 이상"
                    " 의심(매칭 규칙·API 응답 구조 변경 등)이라 재수집을 생략했습니다."
                )
                regressed = []

            if regressed:
                by_dong: dict[str, list] = {}
                for target in regressed:
                    by_dong.setdefault(target.cortar_no, []).append(target)

                # 소실 단지가 많은 동부터 — 상시 초과 상황에서 특정 지역이 매달 뒤로
                # 밀려 영구히 구제받지 못하는 기아를 막는다(오름차순 절단의 함정).
                repass_dongs = sorted(by_dong, key=lambda c: (-len(by_dong[c]), c))
                if len(repass_dongs) > _REPASS_MAX_DONGS:
                    logger.warning(
                        "[official_price] 재수집 대상 법정동 %d개가 상한 %d개 초과 — 소실"
                        " 많은 순 %d개만 재조회 (초과 %d개는 잔여로 남김)",
                        len(repass_dongs), _REPASS_MAX_DONGS, _REPASS_MAX_DONGS,
                        len(repass_dongs) - _REPASS_MAX_DONGS,
                    )
                    repass_dongs = repass_dongs[:_REPASS_MAX_DONGS]

                logger.info(
                    "[official_price] 매칭 소실 %d단지 감지 — 법정동 %d개 재수집 시작",
                    len(regressed), len(repass_dongs),
                )
                repass_start = time.monotonic()
                for repass_idx, ld_code in enumerate(repass_dongs):
                    # 시간 캡은 **동 경계**에서만 본다 — 페이지 단위로 쪼개면 중간에 끊긴
                    # 부분 수집이 세대수 게이트를 통째로 어긋나게 한다. 초과분은 대형 동
                    # 1개(수 분)로 바운드되므로 단순한 이 방식으로 충분하다.
                    if time.monotonic() - repass_start > _REPASS_MAX_SECONDS:
                        logger.warning(
                            "[official_price] 재수집 벽시계 캡 %d초 초과 — 남은 법정동"
                            " %d개 중단 (미구제 단지는 잔여 보고에 합류)",
                            _REPASS_MAX_SECONDS, len(repass_dongs) - repass_idx,
                        )
                        break

                    rows = fetch_official_prices(to_vworld_cortar(ld_code), year)
                    if rows is None:
                        # ⚠ failed_ld_codes/리스트에 넣지 않는다 — 재수집 대상 동은 정의상
                        # 본 루프에서 조회 **성공**한 동이라, 여기 합산하면 "조회 실패 동
                        # 목록"이 오염되고 total_items(=collected+failed)도 부풀려진다.
                        # 재수집 실패는 별도로만 세어 완료 로그에 구분 출력한다.
                        repass_fetch_failed += 1
                        logger.warning("[official_price] 재수집 법정동 %s 조회 실패", ld_code)
                        continue

                    grouped_by_name = _index_groups_by_name(rows)
                    for target in by_dong[ld_code]:
                        hit = match_complex_group(
                            target.complex_name, target.total_household_count, grouped_by_name
                        )
                        if hit is None:
                            continue
                        aphus_code, group = hit

                        n_saved = _save_matched_areas(
                            db, target.complex_no, year, aphus_code, group
                        )
                        if not n_saved:
                            continue
                        saved_rows += n_saved
                        matched_complexes += 1
                        matched_complex_nos.add(target.complex_no)
                        rescued += 1
                db.commit()

                remaining_lost = [
                    t for t in regressed if t.complex_no not in matched_complex_nos
                ]
                if remaining_lost:
                    summary = ", ".join(
                        f"{t.complex_no}({t.complex_name})" for t in remaining_lost[:10]
                    )
                    logger.warning(
                        "[official_price] 재수집 후에도 미매칭 잔여 %d단지: %s",
                        len(remaining_lost), summary,
                    )
                    # status 는 completed 유지 — 전량 실패가 아니라 일부 소실이라 실패로
                    # 끊으면 정상 수집분까지 실패로 보인다. 잔여 사실만 남겨 추적 가능하게 한다.
                    job.error_message = (
                        f"재수집 후 미매칭 잔여 {len(remaining_lost)}단지: {summary}"
                    )[:500]
                    db.commit()
                    # completed 잡의 error_message 는 admin 화면에서 행을 펼쳐야만 보이고
                    # monitor 텔레그램은 failed 만 감시한다 — 월 1회 잡이라 이대로면 다음
                    # 달까지 아무도 모른다. 관찰 가능하게 텔레그램으로 승격(best-effort).
                    _alert_official_price(
                        f"[내부즉시] 공동주택 공시가격 — 재수집 후에도 미매칭 잔여"
                        f" {len(remaining_lost)}단지: {summary}"
                    )
        except Exception:
            # 구제 실패는 본 수집 결과를 되돌리지 않는다 — 로그만 남기고 완료 경로 계속.
            logger.exception("[official_price] 재수집 패스 실패 — 본 수집 결과는 유지")
            db.rollback()

        # silent failure 가드 — 대상 단지는 있는데 한 건도 못 매칭했으면 '완료(0)'
        # 위장 대신 failed 로 알린다 (env_air.py 패턴 답습). 매칭 규칙·API 응답 구조
        # 변경이 조용히 전량 미매칭으로 나타나는 것을 잡는 유일한 그물.
        #
        # ⚠ 재수집 패스 **뒤에** 둔다 — 앞에 두면 드리프트로 전량 소실된 실행에서
        # 구제 기회 자체가 사라진다(가드가 return 으로 끊으므로). 매칭이 진짜로 깨졌다면
        # 재수집도 0건이라 여기서 똑같이 걸리므로 그물은 그대로 유효하다.
        #
        # ⚠ remaining 조건도 함께 본다 — 조회할 법정동이 0개인 실행(전량-done 체크포인트
        # 재개)은 "시도 0회"라 매칭 0 이 정상이다. 이걸 "전량 실패"와 구분하지 않으면
        # 정상 재개가 failed 로 오판된다(세션 370 리뷰어 2차 함정의 뿌리 — 지금은 그
        # 경로가 실질 불가능하지만, 재개 설계를 손댈 때 되살아나므로 선제 차단).
        if targets and remaining and matched_complexes == 0:
            # 문구는 remaining(이번 실행에서 실제 시도한 수) 기준 — targets(전체 로스터)를
            # 쓰면 체크포인트 부분 재개 시 "10,000개 전부 실패"처럼 과장된다(세션 371 백로그).
            _fail_job(db, job, f"대상 단지 {len(remaining)}개 전부 매칭 실패 (수집 0건)")
            logger.error(
                "[official_price] silent failure 감지: 단지 %d개 전부 매칭 실패", len(remaining)
            )
            return

        _complete_job(db, job, matched_complexes, failed_ld_codes)
        logger.info(
            "[official_price] 완료: 단지 %d개 매칭(재수집 구제 %d개), 공시행 %d건 저장,"
            " 법정동 실패 %d개 %s, 재수집 조회실패 %d개",
            matched_complexes, rescued, saved_rows, failed_ld_codes,
            failed_ld_codes_list[:20], repass_fetch_failed,
        )
    except Exception as exc:
        _fail_job(db, job, str(exc))
        logger.exception("[official_price] 수집 실패")
    finally:
        db.close()
