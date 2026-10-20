"""동네 공식 통계 받기 — 한국부동산원 R-ONE 월간 통계를 region_stats 표에 넣는다 (세션 473, PR 4).

설계 = 메모리 design/s473_pr4-public-stats-plan.html 6절. 잡 = scheduler `collect_region_stats`(매월 16일 05:45 —
부동산원이 15일 전후 전월 자료를 공표한 다음 날), job_type `region_stats`. 수동 = scripts/run_region_stats.py.

흐름: CrawlJob 행 생성 → 표마다 rone_api.fetch_table(최근 months_back 개월 ~ 이번 달) → 행마다 지역 짝짓기
(crawler/region_match.rone_path_to_region_code) → region_stats upsert(같은 키면 값·출처·받은 시각을 덮어씀).
호출 수 = 표 3개 × 1쪽 = 월 3콜(3~4달치는 표마다 1,000행 안쪽 — 넘으면 쪽이 늘 뿐).

판정 (error-propagation 룰 5 — "자료 없음"으로 끝내지 않는다)
  * 열쇠 없음·API 오류·표 하나라도 0행 → failed + 우리말 사유(plain_words.explain_error 가 원문 그대로 싣는 꼴).
  * 받았는데 저장 0건(짝이 하나도 안 맞음) → failed "받은 행은 N개인데 지역 짝이 하나도 안 맞아요".
  * 짝 안 된 경로(권역 "서울>강북지역" 등)는 실패가 아니다 — 종류별로 세어 로그 INFO 와 결과 dict `unmatched` 에.
total_items = 받은 행 수, processed_items = 저장한 행 수.
"""

from __future__ import annotations

import logging
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

from crawler import rone_api
from crawler.plain_words import explain_error
from crawler.region_match import (
    SIDO_CODES,
    SINGLE_SIGUNGU_SIDO,
    region_codes,
    rone_path_level,
    rone_path_to_region_code,
)
from crawler.service_common import fail_job_safely
from db.models import CrawlJob, RegionStats
from utils import utcnow

logger = logging.getLogger(__name__)

JOB_TYPE = "region_stats"
STAT_JEONSE_RATIO = "reb_apt_jeonse_ratio_median"
STAT_RENT_CONVERSION = "reb_rent_conversion_rate"
STAT_APT_SALE_MEDIAN = "reb_apt_sale_price_median"
# (R-ONE 표 ID, 우리 통계 항목, 출처 문구) — 출처 문구는 화면 각주에 그대로 쓴다(단위 %는 화면 값에 붙는다).
# 중위 매매가격(A_2024_00062)은 시군구 표 · 월간 · 원자료 단위 천원 → 앱 가격 단위 만원으로 저장.
REGION_STAT_TABLES: list[tuple[str, str, str]] = [
    ("A_2024_00073", STAT_JEONSE_RATIO,
     "한국부동산원 전국주택가격동향조사 — 아파트 중위 매매가격 대비 전세가격"),
    ("A_2024_00155", STAT_RENT_CONVERSION, "한국부동산원 전월세전환율 — 종합주택"),
    ("A_2024_00062", STAT_APT_SALE_MEDIAN, "한국부동산원 전국주택가격동향조사 — 아파트 중위 매매가격"),
]
# 통계 항목별 값 나누기 배율 — 여기 없는 항목은 R-ONE 값을 그대로 저장한다. 단위를 바꾸는 자리는 이 표 하나뿐.
VALUE_DIVISOR: dict[str, Decimal] = {STAT_APT_SALE_MEDIAN: Decimal(10)}   # 천원 → 만원
# R-ONE 이 행마다 실어 주는 단위(UI_NM) 기대값 — 다르면 그 표는 저장하지 않는다(단위가 바뀐 값을 옛 단위로 읽지 않게).
EXPECTED_UNIT: dict[str, str] = {STAT_JEONSE_RATIO: "%", STAT_RENT_CONVERSION: "%", STAT_APT_SALE_MEDIAN: "천원"}
SOURCE_OF: dict[str, str] = {stat: src for _, stat, src in REGION_STAT_TABLES}
TABLE_WORDS: dict[str, str] = {
    STAT_JEONSE_RATIO: "아파트 전세가율", STAT_RENT_CONVERSION: "전월세전환율",
    STAT_APT_SALE_MEDIAN: "아파트 중위 매매가격",
}
_GAP_NAME_SAMPLE = 5
_KST = timezone(timedelta(hours=9))
_UNMATCHED_LOG_TOP = 30
# 시군구 표(전세가율)에서 시군구 단위 경로 중 짝 맞은 비율이 이보다 낮으면 failed — 전국·시도 몇 줄만 맞고
# 시군구가 통째로 빠진 회차를 completed 로 끝내지 않는다(검사관 C-2, 세션 473).
MIN_SIGUNGU_MATCH_RATIO = 0.5
SIGUNGU_TABLE_STAT = STAT_JEONSE_RATIO
_UNKNOWN_PREFIX_SAMPLE = 5


def month_range(months_back: int, today: date | None = None) -> tuple[str, str]:
    """오늘(한국 날짜) 기준 months_back 개월 전 달 ~ 이번 달 → (YYYYMM, YYYYMM)."""
    if months_back < 0:
        raise ValueError("months_back 은 0 이상")
    today = today or datetime.now(_KST).date()
    y, m = today.year, today.month - months_back
    while m <= 0:
        y, m = y - 1, m + 12
    return f"{y:04d}{m:02d}", f"{today.year:04d}{today.month:02d}"


def _to_decimal(raw) -> Decimal | None:
    if raw is None or raw == "":
        return None
    try:
        return Decimal(str(raw))
    except (InvalidOperation, ValueError):
        return None


def build_rows(raw_rows: list[dict], stat_code: str, source: str) -> tuple[dict[tuple, dict], Counter, int]:
    """R-ONE 행 → 넣을 행(키 = (region_code, period, stat_code), 같은 키는 뒤의 것) · 짝 안 된 경로 수 · 값 없는 행 수."""
    out: dict[tuple, dict] = {}
    unmatched: Counter = Counter()
    no_value = 0
    for r in raw_rows:
        path = str(r.get("CLS_FULLNM") or "").strip()
        period = str(r.get("WRTTIME_IDTFR_ID") or "").strip()
        code = rone_path_to_region_code(path)
        if code is None:
            unmatched[path or "(경로 없음)"] += 1
            continue
        if len(period) != 6 or not period.isdigit():
            unmatched[f"{path} (기준 달 모양 이상: {period})"] += 1
            continue
        value = _to_decimal(r.get("DTA_VAL"))
        if value is None:
            no_value += 1
            continue
        value = value / VALUE_DIVISOR.get(stat_code, Decimal(1))
        out[(code, period, stat_code)] = {
            "region_code": code, "period": period, "stat_code": stat_code,
            "value": value, "source": source,
        }
    return out, unmatched, no_value


def upsert_region_rows(db, rows: list[dict]) -> int:
    """INSERT … ON CONFLICT (region_code, period, stat_code) DO UPDATE — PostgreSQL·SQLite 둘 다(load_sgis_stats 답습)."""
    if not rows:
        return 0
    if db.get_bind().dialect.name == "sqlite":
        from sqlalchemy.dialects.sqlite import insert as db_insert
    else:
        from sqlalchemy.dialects.postgresql import insert as db_insert
    now = utcnow()
    values = [{**r, "loaded_at": now} for r in rows]
    stmt = db_insert(RegionStats).values(values)
    stmt = stmt.on_conflict_do_update(
        index_elements=["region_code", "period", "stat_code"],
        set_={
            "value": stmt.excluded.value,
            "source": stmt.excluded.source,
            "loaded_at": stmt.excluded.loaded_at,
        },
    )
    db.execute(stmt)
    return len(values)


def _fetch_all(start: str, end: str, fetch) -> tuple[dict[str, dict], str | None]:
    """표마다 받아 짝짓기까지. (표별 결과, 첫 실패 사유 원문 또는 None)."""
    per: dict[str, dict] = {}
    error: str | None = None
    key_missing = False
    for statbl_id, stat_code, source in REGION_STAT_TABLES:
        info = {"statbl_id": statbl_id, "received": 0, "rows": {}, "unmatched": Counter(), "no_value": 0,
                "sigungu_paths": 0, "sigungu_matched": 0, "unit_problem": None}
        per[stat_code] = info
        if key_missing:
            continue   # 열쇠가 없으면 다음 표도 똑같이 못 받는다
        try:
            raw = fetch(statbl_id, start, end)
        except rone_api.RoneKeyMissing as e:
            key_missing = True
            error = error or str(e)
            continue
        except rone_api.RoneApiError as e:
            logger.warning("동네 공식 통계: %s 받기 실패 — %s (서버 원문 %s)", statbl_id, e,
                           getattr(e, "server_message", None))
            error = error or str(e)
            continue
        info["received"] = len(raw)
        if not raw:
            error = error or f"부동산원 {TABLE_WORDS[stat_code]} 표가 {start}~{end} 자료를 하나도 주지 않았어요"
            continue
        units = {str(r.get("UI_NM") or "").strip() for r in raw}
        if units != {EXPECTED_UNIT[stat_code]}:
            shown = ", ".join(sorted(u or "(없음)" for u in units))
            info["unit_problem"] = (
                f"부동산원 {TABLE_WORDS[stat_code]} 표의 단위가 바뀌어(기대 '{EXPECTED_UNIT[stat_code]}' · 받은 '{shown}') 저장하지 않았어요"
            )
            logger.warning("동네 공식 통계: %s 단위 이상 — 기대 '%s' · 받은 %s", statbl_id, EXPECTED_UNIT[stat_code], units)
            error = error or info["unit_problem"]
            continue   # 이 표만 저장하지 않는다 — 다른 표는 그대로
        info["rows"], info["unmatched"], info["no_value"] = build_rows(raw, stat_code, source)
        paths = {str(r.get("CLS_FULLNM") or "").strip() for r in raw}
        sigungu = {p for p in paths if rone_path_level(p) == "sigungu"}
        info["sigungu_paths"] = len(sigungu)
        info["sigungu_matched"] = sum(1 for p in sigungu if rone_path_to_region_code(p) is not None)
    return per, error


def sigungu_match_problem(per: dict[str, dict]) -> str | None:
    """시군구 표에서 시군구 경로 짝 비율이 문턱 미만이면 우리말 사유, 아니면 None(그 표를 못 받았으면 None — 실패는 따로)."""
    info = per.get(SIGUNGU_TABLE_STAT)
    if not info or not info["received"]:
        return None
    total, matched = info["sigungu_paths"], info["sigungu_matched"]
    if total == 0:
        return "부동산원 시군구 표에 시군구 단위 지역이 하나도 없어요 — 지역 표를 봐 주세요"
    if matched / total < MIN_SIGUNGU_MATCH_RATIO:
        return f"부동산원 지역 이름 {total}개 중 {matched}개만 우리 지역과 맞았어요 — 지역 표를 봐 주세요"
    return None


def empty_table_problem(per: dict[str, dict]) -> str | None:
    """표마다 — 받은 행이 있는데 저장 0 인 표가 하나라도 있으면 우리말 사유(검사관 A-4: 한 표만 살아 completed 금지)."""
    for stat, info in per.items():
        if info["received"] and not info["rows"]:
            return f"부동산원 {TABLE_WORDS[stat]} 표는 {info['received']}행을 받았는데 지역 짝이 하나도 안 맞아요"
    return None


def gap_words(result: dict) -> str | None:
    """완료 회차라도 빈칸이 있으면 관리자 화면에 보일 한 줄(실패 아님 — 알림 없음, B25 관례).

    예: "부동산원 값이 없어 빈칸인 우리 지역 3곳 — 인천 검단구, 경기 화성시 동탄구 외 1곳 · 부동산원 지역 이름 2종은 못 맞춤"
    """
    ours = region_codes()
    gaps = result["uncovered_regions"].get(STAT_JEONSE_RATIO, {}).get("codes", [])
    names = [f"{ours[c]['sido']} {ours[c]['sigungu']}".strip() for c in gaps if c in ours]
    parts = []
    if names:
        shown = ", ".join(names[:_GAP_NAME_SAMPLE])
        rest = len(names) - _GAP_NAME_SAMPLE
        parts.append(f"부동산원 값이 없어 빈칸인 우리 지역 {len(names)}곳 — {shown}" + (f" 외 {rest}곳" if rest > 0 else ""))
    unmatched = len(result["unmatched"])
    if unmatched:
        parts.append(f"부동산원 지역 이름 {unmatched}종은 못 맞춤")
    if not parts:
        return None
    text = " · ".join(parts)
    return text if text.startswith("부동산원") else f"부동산원 자료 — {text}"


def unknown_prefixes(db) -> dict:
    """운영 단지 코드 앞 5자리 중 region_codes.json 에 없는 것 — 새 구가 생겼다는 신호(F5)."""
    from sqlalchemy import text

    rows = db.execute(text(
        "SELECT DISTINCT substr(cortar_no, 1, 5) FROM complexes WHERE cortar_no IS NOT NULL"
    )).fetchall()
    ours = region_codes()
    missing = sorted(
        p for (p,) in rows if p and len(p) == 5 and p.isdigit() and p not in ours
    )
    return {"count": len(missing), "sample": missing[:_UNKNOWN_PREFIX_SAMPLE]}


def uncovered_regions(per: dict[str, dict]) -> dict[str, dict]:
    """우리 단지 지역 중 이번 회차에 값을 못 받은 곳 — 통계마다 {"count": N, "codes": [...]}.

    전세가율 = 시군구 단위(우리 단지 코드 앞 5자리 전부 · 세종은 시도 행으로 대신), 전환율 = 시도 단위.
    받은 표가 없으면(그 표 실패) 그 통계는 넣지 않는다 — 실패는 error 로 따로 알린다.
    """
    ours = region_codes()
    out: dict[str, dict] = {}
    for stat, info in per.items():
        if not info["received"] or info["unit_problem"]:
            continue
        got = {key[0] for key in info["rows"]}
        if stat == STAT_RENT_CONVERSION:
            wanted = {SIDO_CODES[v["sido"]] for v in ours.values() if v.get("sido") in SIDO_CODES}
            missing = sorted(wanted - got)
        else:
            missing = sorted(
                code for code, v in ours.items()
                if code not in got
                and not (v.get("sido") in SINGLE_SIGUNGU_SIDO and SIDO_CODES.get(v["sido"]) in got)
            )
        out[stat] = {"count": len(missing), "codes": missing}
    return out


def _summary(per: dict[str, dict], start: str, end: str, saved: dict[str, int]) -> dict:
    unmatched: Counter = Counter()
    for info in per.values():
        unmatched.update(info["unmatched"])
    return {
        "start": start, "end": end,
        "received": sum(i["received"] for i in per.values()),
        "saved": sum(saved.values()),
        "unmatched": dict(unmatched),
        "uncovered_regions": uncovered_regions(per),
        "tables": {
            stat: {
                "statbl_id": i["statbl_id"], "received": i["received"], "to_save": len(i["rows"]),
                "saved": saved.get(stat, 0), "unmatched": dict(i["unmatched"]), "no_value": i["no_value"],
                "sigungu_paths": i["sigungu_paths"], "sigungu_matched": i["sigungu_matched"],
            }
            for stat, i in per.items()
        },
    }


def collect_region_stats(
    months_back: int = 3,
    scheduler_job_id: str | None = "collect_region_stats",
    *,
    dry_run: bool = False,
    today: date | None = None,
    fetch=None,
) -> dict:
    """최근 months_back 개월 ~ 이번 달 부동산원 통계를 받아 region_stats 에 넣는다. 결과 dict 를 돌려준다.

    scheduler_job_id 기본값 = 예약 잡 id — 관리자 버튼·수동 스크립트로 돌린 회차도 같은 잡의 "마지막 실행"으로 보인다.
    dry_run = 호출·짝짓기까지 하고 DB 에는 아무것도 쓰지 않는다(잡 행도 안 만든다 — 호출 수는 같다).
    fetch = rone_api.fetch_table 대체(시험용). today = 기준 날짜(시험용, 기본 한국 오늘).
    """
    fetch = fetch or rone_api.fetch_table
    start, end = month_range(months_back, today)

    from db.database import SessionLocal

    if dry_run:
        per, error = _fetch_all(start, end, fetch)
        result = _summary(per, start, end, {})
        with SessionLocal() as rdb:   # 읽기만(SELECT 1회)
            result["unknown_prefixes"] = unknown_prefixes(rdb)
        result.update(status="dry_run", error=error or empty_table_problem(per) or sigungu_match_problem(per))
        return result

    db = SessionLocal()
    job = CrawlJob(job_type="region_stats", scheduler_job_id=scheduler_job_id, status="running", started_at=utcnow())
    db.add(job)
    db.flush()
    job_id = job.id
    db.commit()   # 외부 호출 동안 트랜잭션을 열어 두지 않는다
    try:
        per, error = _fetch_all(start, end, fetch)
        saved: dict[str, int] = {}
        for stat, info in per.items():
            if info["rows"]:
                saved[stat] = upsert_region_rows(db, list(info["rows"].values()))
        result = _summary(per, start, end, saved)
        if result["unmatched"]:
            top = sorted(result["unmatched"].items(), key=lambda kv: -kv[1])[:_UNMATCHED_LOG_TOP]
            logger.info("동네 공식 통계: 지역 짝 안 된 경로 %d종 — %s", len(result["unmatched"]), top)
        for stat, u in result["uncovered_regions"].items():
            if u["count"]:
                logger.info("동네 공식 통계: %s 값을 못 받은 우리 지역 %d곳 — %s", stat, u["count"], u["codes"][:30])
        problem = empty_table_problem(per) or sigungu_match_problem(per)
        if error is not None:
            status, message = "failed", explain_error(error)
        elif result["saved"] == 0:
            status = "failed"
            message = explain_error(f"받은 행은 {result['received']}개인데 지역 짝이 하나도 안 맞아요")
        elif problem is not None:
            status, message = "failed", explain_error(problem)
        else:
            status, message = "completed", gap_words(result)
        job.status = status
        job.total_items = result["received"]
        job.processed_items = result["saved"]
        job.error_message = message
        job.completed_at = utcnow()
        db.commit()
        result.update(status=status, error=message)
        # 단지 코드 확인(F5)은 저장 커밋 뒤에 — 이 조회가 시간 초과로 실패해도 받은 행·잡 결과는 그대로다.
        try:
            result["unknown_prefixes"] = unknown_prefixes(db)
            if result["unknown_prefixes"]["count"]:
                logger.info(
                    "동네 공식 통계: 지역 표(data/region_codes.json)에 없는 단지 코드 %d종 — %s · "
                    "새 구가 생겼으면 scripts/build_region_codes.py 를 다시 돌려 커밋하세요",
                    result["unknown_prefixes"]["count"], result["unknown_prefixes"]["sample"],
                )
        except Exception:
            logger.warning("동네 공식 통계: 단지 코드 확인 조회 실패 — 저장 결과는 그대로", exc_info=True)
            result["unknown_prefixes"] = None
            try:
                db.rollback()
            except Exception:   # 이미 커밋된 잡을 바깥 except 가 failed 로 덮어쓰지 않게
                logger.warning("동네 공식 통계: 조회 실패 뒤 정리(rollback)도 실패 — 무시", exc_info=True)
        logger.info("동네 공식 통계 받기 끝: %s 받음 %d · 저장 %d", status, result["received"], result["saved"])
        return result
    except Exception:
        logger.exception("동네 공식 통계 받기 중 예외")
        words = "동네 공식 통계를 저장하다 문제가 생겨 멈췄어요(자세한 내용은 서버 기록에 남아 있어요)."
        try:
            db.rollback()
            job.status = "failed"
            job.error_message = words
            job.completed_at = utcnow()
            db.commit()
        except Exception:
            fail_job_safely(job_id, words)
        raise
    finally:
        db.close()
