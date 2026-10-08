"""SGIS 동네 통계 보조 수집 — 생활업종 요약 3종 + 홍수·산사태 영향 (PR ②, 세션 456).

설계서 = docs/superpowers/specs/2026-10-08-sgis-neighborhood-card-design.md §2·§5-3·§8.
읍면동 통계 본체(인구·가구·주택·사업체)는 파일 적재(scripts/load_sgis_stats.py)가 넣고, 이 모듈은
파일에 없는 것만 API 로 받아 같은 표 `sgis_area_stats`(year 2024)에 upsert 한다.

대상 동
    2024 `to_in_001`(총인구) 행이 있는 8글자 동 전부(adm_cd 순). `--limit` 은 이 목록의 앞 N개.

요약 3종 (동마다 1콜씩, `startupbiz/*.json?adm_cd=<8글자>`)
    응답 `result` 는 [그 동, 시군구, 시도] 3행이라 adm_cd 가 같은 행만 쓴다.
    * housesummary·pplsummary → 그 행의 칸마다 `api_<원문 칸 이름>`(adm_cd·adm_nm 제외)
      예) officetel_cnt → api_officetel_cnt · apart_per → api_apart_per · thirty_cnt → api_thirty_cnt
    * corpdistsummary → theme_list 의 업종마다 `api_corp_<theme_cd>_per` = dist_per
      예) 1006 부동산중개업 → api_corp_1006_per
    값은 문자열·숫자가 섞여 온다 → numeric, "N/A" → NULL(load_sgis_stats.parse_value 와 같은 규칙).

홍수·산사태 (시도 17곳 × 2종)
    `ndsm/floodRiskAdmCdList`·`lndsldWarnAdmCdList`(adm_cd=시도 2글자) 로 영향 동 목록을 받고, **목록에 든
    대상 동만** `…DataBoard`(adm_cd=8글자)를 부른다 — 목록 밖 동을 넣으면 HTTP 500 이 온다(실측).
    * 목록 호출이 성공한 시도: 목록 밖 대상 동에 `ndsm_<종>_affected` = 0. 결과 없음(-100)도 "영향 동 0곳"으로 본다.
    * **목록 호출이 실패한 시도는 아무것도 안 쓴다** — '위험 없음'으로 잘못 남기지 않게.
    * 상세 성공 동: affected 1 · affc_pop/adm_pop(인구 총합의 영향구역/행정구역) · affc_hh(가구) ·
      affc_house(주택) · affc_basement(지하건물) · year(인구 항목의 crtr_yr).

실패 집계
    HTTP 429·5xx·네트워크·다시 물어도 오류코드·응답 모양 이상 → 실패. 실패한 동·시도는 "자료 없음"으로 쓰지
    않는다(error-propagation 룰 5). 실패가 **연속 20회**면 회차를 failed 로 끝낸다. 정상·결과 없음이 끼면 풀린다.

기록·커밋
    `CrawlJob(job_type="sgis_area")`. 받은 값은 메모리에 모았다가 **동 100개마다** 한 번에 넣고 커밋한다 —
    외부 호출 동안 트랜잭션을 열어 두지 않는다. 호출 상한(`call_cap`, 기본 45,000 — 하루 5만 콜 공용 키)에
    닿으면 거기서 멈춘다. 다시 돌리면 처음부터 다시 받는다(upsert 라 같은 결과).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from decimal import Decimal

from sqlalchemy import text

from crawler.service_common import fail_job_safely
from crawler.sgis_client import Reply, SgisClient
from db.models import CrawlJob
from utils import utcnow

logger = logging.getLogger(__name__)

_JOB_TYPE = "sgis_area"
YEAR = 2024                     # 파일 적재(load_sgis_stats.DEFAULT_YEAR)와 같은 기준연도
DEFAULT_CALL_CAP = 45_000
MAX_CONSECUTIVE_FAILURES = 20
FLUSH_EVERY = 100               # 동 N개마다 넣고 커밋

SUMMARY_PATHS = {
    "house": "startupbiz/housesummary.json",
    "ppl": "startupbiz/pplsummary.json",
    "corp": "startupbiz/corpdistsummary.json",
}
DISASTER_PATHS = {   # 종 → (목록, 상세)
    "flood": ("ndsm/floodRiskAdmCdList.json", "ndsm/floodRiskDataBoard.json"),
    "lndsld": ("ndsm/lndsldWarnAdmCdList.json", "ndsm/lndsldWarnDataBoard.json"),
}
KINDS = (*SUMMARY_PATHS, *DISASTER_PATHS)
_SKIP_SUMMARY_KEYS = {"adm_cd", "adm_nm"}
# 상세 항목 이름(iem_nm) → 저장할 칸. 값은 각 항목 data_list 의 div_nm '총합' 행
_BOARD_FIELDS = (
    ("인구", "affc_zone", "affc_pop"),
    ("인구", "administ_zone", "adm_pop"),
    ("가구", "affc_zone", "affc_hh"),
    ("주택", "affc_zone", "affc_house"),
    ("지하건물", "affc_zone", "affc_basement"),
)


def _to_value(raw) -> tuple[Decimal | None, str | None]:
    """API 값(문자열·숫자·None) → (value, value_text). "N/A"·빈 값 → NULL."""
    from scripts.load_sgis_stats import parse_value

    if raw is None or isinstance(raw, bool):
        return None, None
    if isinstance(raw, (int, float)):
        return parse_value(str(raw))[:2]
    if isinstance(raw, str):
        if not raw.strip():
            return None, None
        return parse_value(raw)[:2]
    return None, None


def _row(adm_cd: str, item_code: str, raw) -> dict:
    value, value_text = _to_value(raw)
    return {"adm_cd": adm_cd, "year": YEAR, "item_code": item_code, "value": value, "value_text": value_text}


def _own_row(result, adm_cd: str) -> dict | None:
    """요약 응답 [동, 시군구, 시도] 에서 그 동의 행."""
    if not isinstance(result, list):
        return None
    return next((r for r in result if isinstance(r, dict) and str(r.get("adm_cd")) == adm_cd), None)


def parse_summary(kind: str, result, adm_cd: str) -> list[dict] | None:
    """요약 응답 → 저장할 행들. 그 동의 행이 없으면 None(응답 모양 이상 = 실패)."""
    own = _own_row(result, adm_cd)
    if own is None:
        return None
    if kind == "corp":
        themes = own.get("theme_list")
        if not isinstance(themes, list):
            return None
        return [
            _row(adm_cd, f"api_corp_{t['theme_cd']}_per", t.get("dist_per"))
            for t in themes
            if isinstance(t, dict) and t.get("theme_cd")
        ]
    return [_row(adm_cd, f"api_{k}", v) for k, v in own.items() if k not in _SKIP_SUMMARY_KEYS]


def parse_board(kind: str, result, adm_cd: str) -> list[dict] | None:
    """재해 상세 응답 → 저장할 행들. '인구' 항목이 없으면 None(응답 모양 이상 = 실패)."""
    if not isinstance(result, list):
        return None
    items = {it.get("iem_nm"): it for it in result if isinstance(it, dict)}
    if "인구" not in items:
        return None

    def total(name: str, col: str):
        rows = (items.get(name) or {}).get("data_list") or []
        hit = next((r for r in rows if isinstance(r, dict) and r.get("div_nm") == "총합"), None)
        return hit.get(col) if hit else None

    prefix = f"ndsm_{kind}"
    out = [_row(adm_cd, f"{prefix}_affected", 1)]
    out += [_row(adm_cd, f"{prefix}_{name}", total(iem, col)) for iem, col, name in _BOARD_FIELDS]
    out.append(_row(adm_cd, f"{prefix}_year", items["인구"].get("crtr_yr")))
    return out


@dataclass
class Stats:
    dongs: int = 0          # 대상 동 수
    done: int = 0           # 요약을 물어본 동 수(실패 포함 · 요약을 안 받는 실행이면 0)
    saved: int = 0          # 넣은(고친) 행 수
    failed: int = 0         # 실패한 호출·응답 수
    no_result: int = 0
    stop_reason: str = "done"   # done | consecutive_failures | daily_cap
    failed_sidos: list[str] = field(default_factory=list)


class _Run:
    def __init__(self, db, client: SgisClient, job: CrawlJob, call_cap: int):
        self.db = db
        self.client = client
        self.job = job
        self.call_cap = call_cap
        self.st = Stats()
        self.buf: list[dict] = []
        self.consecutive = 0

    @property
    def stopped(self) -> bool:
        return self.st.stop_reason != "done"

    def ask(self, path: str, **params) -> Reply | None:
        """호출 1번. 상한·연속 실패로 멈췄으면 None."""
        if self.stopped:
            return None
        if self.client.calls >= self.call_cap:
            self.st.stop_reason = "daily_cap"
            return None
        reply = self.client.get(path, **params)
        if reply.kind == "fail":
            self.fail(f"{path} {params.get('adm_cd')}: {reply.detail}")
        else:
            self.consecutive = 0
            if reply.kind == "no_result":
                self.st.no_result += 1
        return reply

    def fail(self, detail: str) -> None:
        self.st.failed += 1
        self.consecutive += 1
        logger.warning("동네 통계 실패 — %s (연속 %d회)", detail, self.consecutive)
        if self.consecutive >= MAX_CONSECUTIVE_FAILURES:
            self.st.stop_reason = "consecutive_failures"

    def flush(self) -> None:
        from scripts.load_sgis_stats import upsert_rows

        if self.buf:
            self.st.saved += upsert_rows(self.db, self.buf)   # 묶음마다 커밋
            self.buf = []
        self.job.processed_items = self.st.done
        self.db.commit()


def select_target_dongs(db, limit: int | None = None) -> list[str]:
    sql = (
        "SELECT adm_cd FROM sgis_area_stats WHERE year = :y AND item_code = 'to_in_001'"
        " AND length(adm_cd) = 8 ORDER BY adm_cd"
    )
    params: dict = {"y": YEAR}
    if limit is not None:
        sql += " LIMIT :n"
        params["n"] = limit
    rows = db.execute(text(sql), params).fetchall()
    db.commit()  # 읽기 트랜잭션을 외부 호출 동안 열어 두지 않는다
    return [str(r[0]) for r in rows]


def _collect_summaries(run: _Run, targets: list[str], kinds: list[str]) -> None:
    for i, adm_cd in enumerate(targets):
        for kind in kinds:
            reply = run.ask(SUMMARY_PATHS[kind], adm_cd=adm_cd)
            if reply is None:
                break
            if reply.kind == "ok":
                rows = parse_summary(kind, reply.result, adm_cd)
                if rows is None:
                    run.fail(f"{kind} {adm_cd}: 응답 모양 이상(그 동의 행 없음)")
                else:
                    run.buf.extend(rows)
        if run.stopped:
            break
        run.st.done = i + 1
        if run.st.done % FLUSH_EVERY == 0:
            run.flush()
            logger.info("동네 통계 요약 진행 %d/%d", run.st.done, len(targets))
    run.flush()


def _collect_disaster(run: _Run, targets: list[str], kind: str) -> None:
    list_path, board_path = DISASTER_PATHS[kind]
    by_sido: dict[str, list[str]] = {}
    for adm_cd in targets:
        by_sido.setdefault(adm_cd[:2], []).append(adm_cd)
    for sido, dongs in sorted(by_sido.items()):
        reply = run.ask(list_path, adm_cd=sido)
        if reply is None:
            break
        if reply.kind == "fail":
            run.st.failed_sidos.append(f"{kind}:{sido}")
            continue
        if reply.kind == "ok" and not isinstance(reply.result, list):
            run.fail(f"{kind} 목록 {sido}: 응답 모양 이상")
            run.st.failed_sidos.append(f"{kind}:{sido}")
            continue
        listed = {
            str(r.get("adm_cd")) for r in (reply.result or []) if isinstance(r, dict)
        } if reply.kind == "ok" else set()
        boards = 0
        for adm_cd in dongs:
            if adm_cd not in listed:
                run.buf.append(_row(adm_cd, f"ndsm_{kind}_affected", 0))
                continue
            board = run.ask(board_path, adm_cd=adm_cd)
            if board is None:
                break
            if board.kind == "ok":
                rows = parse_board(kind, board.result, adm_cd)
                if rows is None:
                    run.fail(f"{kind} 상세 {adm_cd}: 응답 모양 이상('인구' 항목 없음)")
                else:
                    run.buf.extend(rows)
            elif board.kind == "no_result":
                logger.info("동네 통계 %s 상세 결과 없음 — %s(목록에는 있음)", kind, adm_cd)
            boards += 1
            if boards % FLUSH_EVERY == 0:
                run.flush()
        run.flush()
        if run.stopped:
            break


def _stop_message(st: Stats, cap: int) -> str:
    if st.stop_reason == "consecutive_failures":
        return (
            f"동네 통계 창구(통계청 SGIS)에서 실패가 {MAX_CONSECUTIVE_FAILURES}번 이어져 멈췄어요."
            f" 창구가 고장 났거나 오늘 쓸 수 있는 횟수를 넘었을 수 있어요."
            f" 동 {st.dongs:,}곳 중 요약은 {st.done:,}곳까지 물어봤어요."
        )
    if st.stop_reason == "daily_cap":
        return (
            f"하루 호출 상한({cap:,}번)에 닿아 멈췄어요. 동 {st.dongs:,}곳 중 요약은 {st.done:,}곳까지 물어봤어요."
            " 다시 돌리면 처음부터 다시 받아요."
        )
    if st.failed_sidos:
        return f"홍수·산사태 목록을 못 받은 시도가 {len(st.failed_sidos)}곳 있어 그곳은 비워 뒀어요."
    return ""


def refresh_sgis_area(
    db,
    client: SgisClient,
    *,
    limit: int | None = None,
    only: str | None = None,
    call_cap: int = DEFAULT_CALL_CAP,
    scheduler_job_id: str | None = None,
) -> Stats:
    """요약 3종 → 홍수 → 산사태 순으로 받는다. only 가 있으면 그 하나만."""
    if only is not None and only not in KINDS:
        raise ValueError(f"only 는 {KINDS} 중 하나: {only}")
    kinds = [only] if only else list(KINDS)
    targets = select_target_dongs(db, limit)

    job = CrawlJob(
        job_type=_JOB_TYPE, scheduler_job_id=scheduler_job_id,
        status="running", started_at=utcnow(), total_items=len(targets),
    )
    db.add(job)
    db.commit()
    job_id = job.id
    run = _Run(db, client, job, call_cap)
    run.st.dongs = len(targets)
    try:
        summary_kinds = [k for k in kinds if k in SUMMARY_PATHS]
        if summary_kinds:
            _collect_summaries(run, targets, summary_kinds)
        for kind in (k for k in kinds if k in DISASTER_PATHS):
            if run.stopped:
                break
            _collect_disaster(run, targets, kind)
        run.flush()
        job.status = "failed" if run.st.stop_reason == "consecutive_failures" else "completed"
        job.error_message = _stop_message(run.st, call_cap) or None
        job.completed_at = utcnow()
        db.commit()
    except Exception:
        logger.exception("동네 통계 받기 중 예외")
        try:
            db.rollback()
            job.status = "failed"
            job.error_message = "동네 통계를 저장하다 문제가 생겨 멈췄어요. 서버 기록을 확인해야 해요."
            job.completed_at = utcnow()
            db.commit()
        except Exception:
            fail_job_safely(job_id, "동네 통계를 저장하다 문제가 생겨 멈췄어요. 서버 기록을 확인해야 해요.")
        raise
    return run.st
