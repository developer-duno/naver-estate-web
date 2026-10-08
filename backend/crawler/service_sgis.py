"""SGIS 동네 통계 보조 수집 — 생활업종 요약 + 홍수·산사태 영향 (PR ②, 세션 456).

설계서 = docs/superpowers/specs/2026-10-08-sgis-neighborhood-card-design.md §2·§5-3·§8.
읍면동 통계 본체(인구·가구·주택·사업체)는 파일 적재(scripts/load_sgis_stats.py)가 넣고, 이 모듈은
파일에 없는 것만 API 로 받아 같은 표 `sgis_area_stats`(year 2024)에 upsert 한다.

대상 동
    2024 `to_in_001`(총인구) 행이 있는 8글자 동 전부(adm_cd 순). `--limit` 은 이 목록의 앞 N개.

요약 (동마다 1콜씩, `startupbiz/*.json?adm_cd=<8글자>`) — 기본은 house·corp 두 종류
    응답 `result` 는 [그 동, 시군구, 시도] 3행이라 adm_cd 가 같은 행만 쓴다.
    * housesummary → 그 행의 칸마다 `api_<원문 칸 이름>`(adm_cd·adm_nm 제외)
      예) officetel_cnt → api_officetel_cnt · apart_per → api_apart_per
    * corpdistsummary → theme_list 중 **1006 부동산중개업만** `api_corp_1006_per` = dist_per(72개 업종 전부는 안 넣는다)
    * pplsummary(연령 7구간) → 화면이 안 써서 기본 종류에서 뺐다. `only="ppl"` 로만 돈다(api_thirty_cnt 꼴).
    값은 문자열·숫자가 섞여 온다 → numeric. "1,234" → 1234 · "N/A"·빈 값 → NULL. 숫자로 못 읽는 값(dict 등)은
    그 칸만 NULL 로 두고 "값 모양 이상"으로 세어 회차 끝에 로그 한 줄.

홍수·산사태 (시도 17곳 × 2종)
    `ndsm/floodRiskAdmCdList`·`lndsldWarnAdmCdList`(adm_cd=시도 2글자) 로 영향 동 목록을 받고, **목록에 든
    대상 동만** `…DataBoard`(adm_cd=8글자)를 부른다 — 목록 밖 동을 넣으면 HTTP 500 이 온다(실측).
    * 목록 호출이 성공한 시도: 목록 밖 대상 동에 `ndsm_<종>_affected` = 0. 결과 없음(-100)도 "영향 동 0곳"으로 본다.
    * **목록 호출이 실패한 시도는 아무것도 안 쓴다** — '위험 없음'으로 잘못 남기지 않게.
    * 목록(2025 경계)에 대상(2024 통계 코드)에 없는 8글자 코드가 하나라도 있으면 그 시도는 동 번호가 바뀐 곳이
      있는 것이라 **목록 밖 동에 0 을 쓰지 않는다**(상세는 그대로). 시도별 목록 행 수는 로그 한 줄로 남긴다.
    * 상세 성공 동: affected 1 · affc_pop/adm_pop(인구 총합의 영향구역/행정구역) · affc_hh(가구) ·
      affc_house(주택) · affc_basement(지하건물) · year(인구 항목의 crtr_yr).
    * 상세 호출이 실패한 동은 그 종류의 지난 회차 `ndsm_<종>_*` 행을 지운다(옛 '영향 없음'이 거짓으로 남지 않게).

실패 집계
    HTTP 429·5xx·네트워크·다시 물어도 오류코드·응답 모양 이상 → 실패. 실패한 동·시도는 "자료 없음"으로 쓰지
    않는다(error-propagation 룰 5). 연속 실패 수는 **응답을 해석해 값을 실제로 얻었을 때만** 0 으로 되돌린다 —
    정상 응답이라도 모양이 바뀌어 해석이 안 되면 실패가 쌓인다. 연속 20회면 회차를 failed 로 끝낸다.
    errCd -200(코드 오류)은 그 동에 늘 나는 오류라 따로 센다(연속 실패에 안 넣음). 단 -200 이 연속 200회면
    (전부 코드 오류 = 우리 쪽 고장) failed. 끝까지 돌았어도 실패한 동이 대상의 10% 이상이면 failed,
    그보다 적어도 실패한 동이 있으면 회차 사유에 우리말 한 줄을 남긴다.

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
MAX_CONSECUTIVE_CODE_ERRORS = 200
FLUSH_EVERY = 100               # 동 N개마다 넣고 커밋
CORP_THEMES = ("1006",)         # 부동산중개업 — 화면(broker_pct)·미분양(§8)이 쓰는 것만

SUMMARY_PATHS = {
    "house": "startupbiz/housesummary.json",
    "ppl": "startupbiz/pplsummary.json",
    "corp": "startupbiz/corpdistsummary.json",
}
DISASTER_PATHS = {   # 종 → (목록, 상세)
    "flood": ("ndsm/floodRiskAdmCdList.json", "ndsm/floodRiskDataBoard.json"),
    "lndsld": ("ndsm/lndsldWarnAdmCdList.json", "ndsm/lndsldWarnDataBoard.json"),
}
_DISASTER_WORDS = {"flood": "홍수", "lndsld": "산사태"}
KINDS = (*SUMMARY_PATHS, *DISASTER_PATHS)          # only 로 고를 수 있는 것
DEFAULT_KINDS = ("house", "corp", "flood", "lndsld")   # 기본 실행 — ppl 은 화면이 안 써서 뺐다
_SKIP_SUMMARY_KEYS = {"adm_cd", "adm_nm"}
# 상세 항목 이름(iem_nm) → 저장할 칸. 값은 각 항목 data_list 의 div_nm '총합' 행
_BOARD_FIELDS = (
    ("인구", "affc_zone", "affc_pop"),
    ("인구", "administ_zone", "adm_pop"),
    ("가구", "affc_zone", "affc_hh"),
    ("주택", "affc_zone", "affc_house"),
    ("지하건물", "affc_zone", "affc_basement"),
)


def too_many_failures(failed_dongs: int, total: int) -> bool:
    """실패한 동이 대상의 10% 이상인가."""
    return total > 0 and failed_dongs * 10 >= total


def _to_value(raw) -> tuple[Decimal | None, str | None, bool]:
    """API 값 → (value, value_text, 모양 이상인가). "1,234" → 1234 · "N/A"·빈 값·None → NULL(이상 아님)."""
    from scripts.load_sgis_stats import parse_value

    if raw is None:
        return None, None, False
    if isinstance(raw, bool) or not isinstance(raw, (int, float, str)):
        return None, None, True
    s = str(raw).strip().replace(",", "")
    if not s:
        return None, None, False
    value, value_text, kind = parse_value(s)
    if kind == "bad":
        return None, str(raw), True
    return value, value_text, False


def _row(adm_cd: str, item_code: str, raw, bad: list | None = None) -> dict:
    value, value_text, is_bad = _to_value(raw)
    if is_bad and bad is not None:
        bad.append(f"{adm_cd}:{item_code}")
    return {"adm_cd": adm_cd, "year": YEAR, "item_code": item_code, "value": value, "value_text": value_text}


def _own_row(result, adm_cd: str) -> dict | None:
    """요약 응답 [동, 시군구, 시도] 에서 그 동의 행."""
    if not isinstance(result, list):
        return None
    return next((r for r in result if isinstance(r, dict) and str(r.get("adm_cd")) == adm_cd), None)


def parse_summary(kind: str, result, adm_cd: str, bad: list | None = None) -> list[dict] | None:
    """요약 응답 → 저장할 행들. 그 동의 행이 없으면 None(응답 모양 이상 = 실패)."""
    own = _own_row(result, adm_cd)
    if own is None:
        return None
    if kind == "corp":
        themes = own.get("theme_list")
        if not isinstance(themes, list):
            return None
        return [
            _row(adm_cd, f"api_corp_{t['theme_cd']}_per", t.get("dist_per"), bad)
            for t in themes
            if isinstance(t, dict) and str(t.get("theme_cd")) in CORP_THEMES
        ]
    return [_row(adm_cd, f"api_{k}", v, bad) for k, v in own.items() if k not in _SKIP_SUMMARY_KEYS]


def parse_board(kind: str, result, adm_cd: str, bad: list | None = None) -> list[dict] | None:
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
    out += [_row(adm_cd, f"{prefix}_{name}", total(iem, col), bad) for iem, col, name in _BOARD_FIELDS]
    out.append(_row(adm_cd, f"{prefix}_year", items["인구"].get("crtr_yr"), bad))
    return out


@dataclass
class Stats:
    dongs: int = 0          # 대상 동 수
    done: int = 0           # 요약을 물어본 동 수(실패 포함 · 요약을 안 받는 실행이면 0)
    saved: int = 0          # 넣은(고친) 행 수
    failed: int = 0         # 실패한 호출·응답 수
    no_result: int = 0
    code_error: int = 0     # errCd -200(그 동의 코드 오류) 수
    bad_values: int = 0     # 숫자로 못 읽어 NULL 로 둔 칸 수
    stop_reason: str = "done"   # done | consecutive_failures | consecutive_code_errors | daily_cap
    failed_dongs: set[str] = field(default_factory=set)
    code_error_dongs: set[str] = field(default_factory=set)
    failed_sidos: list[str] = field(default_factory=list)
    mismatch_sidos: list[str] = field(default_factory=list)   # 동 번호가 바뀐 곳이 있어 0 을 안 쓴 시도(문장)


class _Run:
    def __init__(self, db, client: SgisClient, job: CrawlJob, call_cap: int):
        self.db = db
        self.client = client
        self.job = job
        self.call_cap = call_cap
        self.st = Stats()
        self.buf: list[dict] = []
        self.deletes: list[tuple[str, str]] = []   # (동, 재해 종류) — 지난 회차 행을 지울 것
        self.bad: list[str] = []
        self.consecutive = 0
        self.consecutive_code = 0

    @property
    def stopped(self) -> bool:
        return self.st.stop_reason != "done"

    def ask(self, path: str, **params) -> Reply | None:
        """호출 1번. 상한·연속 실패로 멈췄으면 None. 연속 수 되돌리기는 해석에 성공한 쪽(ok())이 한다."""
        if self.stopped:
            return None
        if self.client.calls >= self.call_cap:
            self.st.stop_reason = "daily_cap"
            return None
        reply = self.client.get(path, **params)
        adm_cd = str(params.get("adm_cd"))
        dong = adm_cd if len(adm_cd) == 8 else None
        if reply.kind == "fail":
            self.fail(f"{path} {adm_cd}: {reply.detail}", dong)
        elif reply.kind == "code_error":
            self.code_error(f"{path} {adm_cd}: {reply.detail}", dong)
        elif reply.kind == "no_result":
            self.st.no_result += 1
        return reply

    def ok(self) -> None:
        """응답을 해석해 값을 실제로 얻었다 — 연속 수를 되돌린다."""
        self.consecutive = 0
        self.consecutive_code = 0

    def fail(self, detail: str, dong: str | None = None) -> None:
        self.st.failed += 1
        if dong:
            self.st.failed_dongs.add(dong)
        self.consecutive += 1
        logger.warning("동네 통계 실패 — %s (연속 %d회)", detail, self.consecutive)
        if self.consecutive >= MAX_CONSECUTIVE_FAILURES:
            self.st.stop_reason = "consecutive_failures"

    def code_error(self, detail: str, dong: str | None) -> None:
        self.st.code_error += 1
        if dong:
            self.st.code_error_dongs.add(dong)
        self.consecutive_code += 1
        logger.info("동네 통계 코드 오류 — %s (연속 %d회)", detail, self.consecutive_code)
        if self.consecutive_code >= MAX_CONSECUTIVE_CODE_ERRORS:
            self.st.stop_reason = "consecutive_code_errors"

    def flush(self) -> None:
        from scripts.load_sgis_stats import upsert_rows

        for adm_cd, kind in self.deletes:   # 아래 upsert(또는 끝 커밋)와 같은 커밋에 묶인다
            self.db.execute(
                text(
                    "DELETE FROM sgis_area_stats WHERE adm_cd = :cd AND year = :y"
                    " AND item_code LIKE :p ESCAPE '!'"
                ),
                {"cd": adm_cd, "y": YEAR, "p": f"ndsm!_{kind}!_%"},
            )
        self.deletes = []
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
                rows = parse_summary(kind, reply.result, adm_cd, run.bad)
                if rows is None:
                    run.fail(f"{kind} {adm_cd}: 응답 모양 이상(그 동의 행 없음)", adm_cd)
                else:
                    run.ok()
                    run.buf.extend(rows)
        if run.stopped:
            break
        run.st.done = i + 1
        if run.st.done % FLUSH_EVERY == 0:
            run.flush()
            logger.info("동네 통계 요약 진행 %d/%d", run.st.done, len(targets))
    run.flush()


def _collect_disaster(run: _Run, targets: list[str], all_targets: set[str], kind: str) -> None:
    list_path, board_path = DISASTER_PATHS[kind]
    by_sido: dict[str, list[str]] = {}
    for adm_cd in targets:
        by_sido.setdefault(adm_cd[:2], []).append(adm_cd)
    for sido, dongs in sorted(by_sido.items()):
        reply = run.ask(list_path, adm_cd=sido)
        if reply is None:
            break
        if reply.kind in ("fail", "code_error"):
            run.st.failed_sidos.append(f"{kind}:{sido}")
            continue
        if reply.kind == "ok" and not isinstance(reply.result, list):
            run.fail(f"{kind} 목록 {sido}: 응답 모양 이상")
            run.st.failed_sidos.append(f"{kind}:{sido}")
            continue
        listing = [r for r in (reply.result or []) if isinstance(r, dict)] if reply.kind == "ok" else []
        if reply.kind == "ok":
            run.ok()
        listed = {str(r.get("adm_cd")) for r in listing}
        sido_nm = next((str(r["sido_nm"]) for r in listing if r.get("sido_nm")), sido)
        unknown = sorted(c for c in listed if len(c) == 8 and c not in all_targets)
        logger.info(
            "재해 목록 %s %s(%s): %d행 · 대상 동 %d · 대상에 없는 코드 %d",
            kind, sido, sido_nm, len(listing), len(dongs), len(unknown),
        )
        write_zero = not unknown
        if unknown:
            run.st.mismatch_sidos.append(
                f"{sido_nm} {_DISASTER_WORDS[kind]} 목록은 동 번호가 바뀐 곳 {len(unknown)}개가 있어"
                " '영향 없음'을 쓰지 않았어요."
            )
            logger.warning("재해 목록 %s %s: 대상에 없는 코드 %s", kind, sido, unknown[:10])
        boards = 0
        for adm_cd in dongs:
            if adm_cd not in listed:
                if write_zero:
                    run.buf.append(_row(adm_cd, f"ndsm_{kind}_affected", 0))
                continue
            board = run.ask(board_path, adm_cd=adm_cd)
            if board is None:
                break
            if board.kind == "ok":
                rows = parse_board(kind, board.result, adm_cd, run.bad)
                if rows is None:
                    run.fail(f"{kind} 상세 {adm_cd}: 응답 모양 이상('인구' 항목 없음)", adm_cd)
                    run.deletes.append((adm_cd, kind))
                else:
                    run.ok()
                    run.buf.extend(rows)
            elif board.kind in ("fail", "code_error"):
                run.deletes.append((adm_cd, kind))
            else:
                logger.info("동네 통계 %s 상세 결과 없음 — %s(목록에는 있음)", kind, adm_cd)
            boards += 1
            if boards % FLUSH_EVERY == 0:
                run.flush()
        run.flush()
        if run.stopped:
            break


def _job_message(st: Stats, cap: int) -> str:
    parts = []
    if st.stop_reason == "consecutive_failures":
        parts.append(
            f"동네 통계 창구(국가데이터처 통계지리정보)에서 실패가 {MAX_CONSECUTIVE_FAILURES}번 이어져 멈췄어요."
            " 창구가 고장 났거나 오늘 쓸 수 있는 횟수를 넘었을 수 있어요."
            f" 동 {st.dongs:,}곳 중 요약은 {st.done:,}곳까지 물어봤어요."
        )
    elif st.stop_reason == "consecutive_code_errors":
        parts.append(
            f"창구가 동 번호를 모른다는 답이 {MAX_CONSECUTIVE_CODE_ERRORS}번 이어져 멈췄어요."
            " 우리 쪽 동 번호 목록이 잘못됐을 수 있어요."
        )
    elif st.stop_reason == "daily_cap":
        parts.append(
            f"하루 호출 상한({cap:,}번)에 닿아 멈췄어요. 동 {st.dongs:,}곳 중 요약은 {st.done:,}곳까지 물어봤어요."
            " 다시 돌리면 처음부터 다시 받아요."
        )
    if st.failed_dongs:
        line = f"동 {len(st.failed_dongs):,}곳은 자료를 못 받아 비워 뒀어요(다시 돌리면 채워집니다)."
        if too_many_failures(len(st.failed_dongs), st.dongs):
            line += " 대상의 10%가 넘어 실패로 끝냈어요."
        parts.append(line)
    if st.code_error_dongs:
        parts.append(f"창구가 동 번호를 모른다고 한 {len(st.code_error_dongs):,}곳은 비워 뒀어요.")
    if st.failed_sidos:
        parts.append(f"홍수·산사태 목록을 못 받은 시도가 {len(st.failed_sidos)}곳 있어 그곳은 비워 뒀어요.")
    parts += st.mismatch_sidos
    return " ".join(parts)


def refresh_sgis_area(
    db,
    client: SgisClient,
    *,
    limit: int | None = None,
    only: str | None = None,
    call_cap: int = DEFAULT_CALL_CAP,
    scheduler_job_id: str | None = None,
) -> Stats:
    """요약(house·corp) → 홍수 → 산사태 순으로 받는다. only 가 있으면 그 하나만(ppl 은 only 로만)."""
    if only is not None and only not in KINDS:
        raise ValueError(f"only 는 {KINDS} 중 하나: {only}")
    kinds = [only] if only else list(DEFAULT_KINDS)
    all_targets = select_target_dongs(db)
    targets = all_targets if limit is None else all_targets[:limit]

    job = CrawlJob(
        job_type=_JOB_TYPE, scheduler_job_id=scheduler_job_id,
        status="running", started_at=utcnow(), total_items=len(targets),
    )
    db.add(job)
    db.flush()
    job_id = job.id
    db.commit()   # id 를 커밋 전에 읽어 둔다 — 커밋 뒤 읽으면 다시 SELECT 가 나가 트랜잭션이 열린 채 외부 호출을 한다
    run = _Run(db, client, job, call_cap)
    run.st.dongs = len(targets)
    try:
        summary_kinds = [k for k in kinds if k in SUMMARY_PATHS]
        if summary_kinds:
            _collect_summaries(run, targets, summary_kinds)
        target_set = set(all_targets)
        for kind in (k for k in kinds if k in DISASTER_PATHS):
            if run.stopped:
                break
            _collect_disaster(run, targets, target_set, kind)
        run.flush()
        run.st.bad_values = len(run.bad)
        if run.bad:
            logger.warning("동네 통계 값 모양 이상 %d칸(NULL 로 둠) — 예: %s", len(run.bad), run.bad[:5])
        st = run.st
        hard_stop = st.stop_reason in ("consecutive_failures", "consecutive_code_errors")
        job.status = "failed" if hard_stop or too_many_failures(len(st.failed_dongs), st.dongs) else "completed"
        job.error_message = _job_message(st, call_cap) or None
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
