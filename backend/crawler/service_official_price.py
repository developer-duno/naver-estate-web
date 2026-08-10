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
from datetime import date
from decimal import Decimal, InvalidOperation

from crawler.cortar_legacy import to_standard_cortar
from crawler.env_common import _complete_job, _fail_job, _record_job
from crawler.service_common import _checkpoint
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
    done_ld_codes: set[str] = set()
    recent_stopped_jobs = (
        db.query(CrawlJob)
        .filter(
            CrawlJob.job_type == "official_price",
            CrawlJob.status.in_(["failed", "cancelled"]),
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

        for idx, ld_code in enumerate(remaining):
            # 전 페이지 수집 완료 후에만 매칭 — 부분 수집 시 세대수 게이트가 통째로
            # 어긋난다(V-WORLD 가 대형 단지를 뒷페이지에 배치, 플랜 §3-2-5).
            #
            # ⚠ 조회 직전에만 표준 코드로 번역한다 — 광주·전남은 네이버가 12-프리픽스
            # (전남광주통합특별시) 코드를 주는데 V-WORLD 는 옛 체계(29/46)만 받아
            # 12 코드로는 조용히 0건이 온다(cortar_legacy.py 참조). 루프 키·체크포인트
            # (done_ld_codes)는 **원본 그대로** 둬야 재개 호환이 깨지지 않는다.
            rows = fetch_official_prices(to_standard_cortar(ld_code), year)
            if rows is None:
                # 4번째 재시도 계층 — vworld_price_api.py 내부에 이미 429 전용
                # MAX_RETRIES=3 재시도가 있지만, 그건 페이지 단위(1회 호출)의 순간적인
                # rate limit 만 흡수한다. 이건 그 위에 얹는 법정동 단위 1회 재시도다 —
                # 대형 법정동(대치동 49페이지 등)은 페이지 수가 많아 그 사이 어딘가
                # 일시적 네트워크 오류·타임아웃으로 통째 실패하는 빈도가 높은데, 몇 초
                # 후 재시도하면 살아나는 경우가 실측상 다수라 여기서 한 번 더 감아준다.
                time.sleep(2)
                rows = fetch_official_prices(to_standard_cortar(ld_code), year)
            if rows is None:
                failed_ld_codes += 1
                failed_ld_codes_list.append(ld_code)
                logger.warning("[official_price] 법정동 %s 조회 실패 — 건너뜀", ld_code)
                continue

            grouped = _group_by_aphus(rows)
            grouped_by_name: dict[str, list[tuple[str, dict]]] = {}
            for code, group in grouped.items():
                grouped_by_name.setdefault(
                    normalize_complex_name(group["name"]), []
                ).append((code, group))

            for target in by_ld_code[ld_code]:
                hit = match_complex_group(
                    target.complex_name, target.total_household_count, grouped_by_name
                )
                if hit is None:
                    continue
                aphus_code, group = hit

                areas = aggregate_area_medians(group["rows"])
                if not areas:
                    continue

                for area, median_price, ho_count in areas:
                    _do_upsert(
                        db,
                        ComplexOfficialPrice,
                        {
                            "complex_no": target.complex_no,
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
                    saved_rows += 1
                matched_complexes += 1

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

        # silent failure 가드 — 대상 단지는 있는데 한 건도 못 매칭했으면 '완료(0)'
        # 위장 대신 failed 로 알린다 (env_air.py 패턴 답습). 매칭 규칙·API 응답 구조
        # 변경이 조용히 전량 미매칭으로 나타나는 것을 잡는 유일한 그물.
        if targets and matched_complexes == 0:
            _fail_job(db, job, f"대상 단지 {len(targets)}개 전부 매칭 실패 (수집 0건)")
            logger.error(
                "[official_price] silent failure 감지: 단지 %d개 전부 매칭 실패", len(targets)
            )
            return

        _complete_job(db, job, matched_complexes, failed_ld_codes)
        _checkpoint.delete(db, job.id)
        logger.info(
            "[official_price] 완료: 단지 %d개 매칭, 공시행 %d건 저장, 법정동 실패 %d개 %s",
            matched_complexes, saved_rows, failed_ld_codes,
            failed_ld_codes_list[:20],
        )
    except Exception as exc:
        _fail_job(db, job, str(exc))
        logger.exception("[official_price] 수집 실패")
    finally:
        db.close()
