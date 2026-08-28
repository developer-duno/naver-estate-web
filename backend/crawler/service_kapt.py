"""K-apt 관리비 수집 — 단지 매칭(월 1회) + 월별 관리비 수집(매일).

잡 2개:
  match_kapt_complexes()  전국 K-apt 목록 ↔ 우리 단지 매칭 → kapt_complex_map
  collect_kapt_costs()    매칭된 단지의 월별 관리비 수집 → kapt_management_costs

매칭 3중 게이트 (보수 원칙 — 오매칭은 "남의 단지 관리비"를 보여주는 치명적 결함):
  ① 법정동 일치   kapt bjdCode(10자리) == complexes.cortar_no
  ② 이름 유사도   정규화 후 difflib ratio >= 0.6, 같은 법정동 최고점 1개만,
                  최고점 동률이 둘 이상이면 탈락(어느 쪽인지 알 수 없으므로)
  ③ 세대수 근사   양쪽 세대수 보유 시 |차이|/max <= 0.15,
                  한쪽이라도 없으면 ②의 임계를 0.75 로 강화해 보완
                  ⚠ 실제 발동 지점은 pick_best_match 가 아니라 **basis(getAphusBassInfoV5)
                  수신 직후**다 — 목록 API(getTotalAptList4)는 kaptdaCnt 를 안 주므로
                  후보 선별 단계에선 늘 "대조 불가"(=0.75 강화만 적용)이고, 세대수를
                  실제로 아는 건 확정분에 basis 를 부른 뒤뿐이다(라이브 실측:
                  목록 응답 키 = kaptCode/kaptName/bjdCode/as1~as4).

세 게이트 모두 "애매하면 버린다"는 방향으로 설계했다 — 놓친 단지는 관리비가
안 보일 뿐이지만, 잘못 붙인 단지는 틀린 금액을 사실처럼 보여준다.
"""

import logging
import re
from datetime import date, datetime, timezone
from difflib import SequenceMatcher

from crawler.env_common import _complete_job, _fail_job, _record_job
from crawler.kapt_api import (
    fetch_apt_basis_info,
    fetch_apt_list_page,
    fetch_common_cost,
    fetch_individual_cost,
)
from db.database import SessionLocal
from db.models import Complex, KaptComplexMap, KaptManagementCost
from services.upsert import _do_upsert
from utils import utcnow

logger = logging.getLogger(__name__)

# ── 매칭 게이트 임계 ──
_NAME_RATIO_MIN = 0.6
# 세대수를 대조할 수 없을 때(한쪽이 NULL) 쓰는 강화 임계 — 이름만으로 판단해야
# 하므로 더 엄격하게 본다.
_NAME_RATIO_MIN_NO_HOUSEHOLD = 0.75
_HOUSEHOLD_TOLERANCE = 0.15

_LIST_PAGE_SIZE = 1000
# 페이지네이션 폭주 방지 상한. 전국 22,288단지 / 1000 = 23페이지라 넉넉하다
# (API 가 totalCount 를 잘못 주거나 items 가 끝없이 반복될 때의 안전핀).
_MAX_LIST_PAGES = 100

# 관리비 공개까지의 지연(개월). 2026-08-27 라이브 실측 = 202605 가 최신
# (당월-3). 스펙 초안의 "2개월"보다 한 달 더 늦어, 여유를 둬 3개월 전부터
# 거꾸로 훑는다.
_COST_LAG_MONTHS = 3
# 최신 공개월을 못 찾을 때 거슬러 올라가며 시도할 개월 수.
_COST_MONTH_TRIES = 3

_MATCH_JOB_TYPE = "kapt_match"
_COST_JOB_TYPE = "kapt_costs"

# 이름 정규화에서 제거할 것들 — 괄호 기호, 공백, 흔한 접미사.
# ⚠ 괄호 "안의 내용"을 통째로 지우면 안 된다 — K-apt 가 "경희궁의아침(4단지)" 처럼
# 차수를 괄호 안에 넣어 표기해서, 내용을 지우면 1단지·4단지가 같은 정규형이 되어
# 형제 단지 오매칭이 난다(구현 중 테스트로 발견). 괄호 기호만 떼고 안의 글자는 남긴다.
_PAREN_RE = re.compile(r"[()（）\[\]]")
_NON_NAME_RE = re.compile(r"[\s\-·,.]")
_APT_SUFFIX_RE = re.compile(r"(아파트|APT)$", re.IGNORECASE)


def normalize_complex_name(name: str | None) -> str:
    """단지명 비교용 정규형 — 괄호 기호·공백·구분자·'아파트' 접미사 제거(괄호 안 내용은 보존).

    K-apt 와 네이버가 같은 단지를 "경희궁의아침4단지" / "경희궁의아침(4단지)"
    처럼 다르게 표기하므로, 표기 차이를 걷어낸 뒤 유사도를 잰다.
    차수 숫자(4단지의 4)는 **남긴다** — 형제 단지를 가르는 결정적 신호라
    지우면 1단지와 4단지가 100% 일치해버린다. 그래서 괄호는 기호만 떼고
    안의 내용은 보존한다(차수가 괄호 안에 들어가는 표기가 흔하다).
    """
    if not name:
        return ""
    text = _PAREN_RE.sub("", name)
    text = _NON_NAME_RE.sub("", text)
    text = _APT_SUFFIX_RE.sub("", text)
    return text.strip().lower()


def name_similarity(a: str | None, b: str | None) -> float:
    """정규화 후 difflib 유사도 0~1. 한쪽이 비면 0."""
    na, nb = normalize_complex_name(a), normalize_complex_name(b)
    if not na or not nb:
        return 0.0
    return SequenceMatcher(None, na, nb).ratio()


def household_within_tolerance(ours: int | None, theirs: int | None) -> bool | None:
    """세대수 게이트. 통과 True / 탈락 False / 대조 불가(한쪽 없음) None.

    None 을 별도로 돌려주는 이유: 호출부가 "대조 불가"일 때 이름 임계를
    강화하는 보완 규칙을 적용해야 하는데, False 와 뭉뚱그리면 그 분기를
    만들 수 없다.
    """
    if not ours or not theirs or ours <= 0 or theirs <= 0:
        return None
    return abs(ours - theirs) / max(ours, theirs) <= _HOUSEHOLD_TOLERANCE


def pick_best_match(cpx, candidates: list[dict]) -> tuple[dict, float] | None:
    """같은 법정동 후보들 중 최적 1건. 게이트 미통과·동률이면 None.

    candidates 는 {"kaptCode","kaptName","kaptdaCnt"(선택)} 형태의 dict 목록.
    kaptdaCnt 는 목록 API 에 없으므로 보통 None 이며, 그때는 이름 임계가
    0.75 로 강화된다(세대수 대조 불가 보완).
    """
    scored: list[tuple[float, dict]] = []
    for cand in candidates:
        ratio = name_similarity(cpx.complex_name, cand.get("kaptName"))
        household_ok = household_within_tolerance(
            cpx.total_household_count, cand.get("kaptdaCnt")
        )
        if household_ok is False:
            # 세대수가 명백히 다르면 이름이 아무리 비슷해도 다른 단지다.
            continue
        threshold = (
            _NAME_RATIO_MIN if household_ok is True else _NAME_RATIO_MIN_NO_HOUSEHOLD
        )
        if ratio < threshold:
            continue
        scored.append((ratio, cand))

    if not scored:
        return None

    best_ratio = max(score for score, _ in scored)
    top = [cand for score, cand in scored if score == best_ratio]
    if len(top) > 1:
        # 동점이 여럿이면 어느 쪽인지 알 수 없다 — 찍지 않고 버린다.
        logger.info(
            "[kapt_match] 단지 %s(%s) 최고점 동률 %d건 — 탈락",
            cpx.complex_no, cpx.complex_name, len(top),
        )
        return None
    return top[0], best_ratio


def _fetch_all_kapt(limit_pages: int = _MAX_LIST_PAGES) -> tuple[list[dict], bool]:
    """전국 K-apt 목록 전량 페이지네이션. 반환 (rows, is_complete).

    is_complete=False 는 "중간에 끊긴 부분 목록"이라는 뜻이다. 부분 목록으로도
    매칭 자체는 안전하다(upsert 라 기존 매칭을 지우지 않는다) — 다만 그 회차의
    낮은 매칭 수가 '정상 완료'로 보고되면 조용한 퇴행이 되므로, 호출자가 이
    플래그로 job 에 경고를 남길 수 있게 분리해 돌려준다.
    """
    collected: list[dict] = []
    total_count = 0
    page = 1
    while page <= limit_pages:
        items, total = fetch_apt_list_page(page, _LIST_PAGE_SIZE)
        if total:
            total_count = total
        if not items:
            break
        collected.extend(items)
        if total_count and len(collected) >= total_count:
            break
        page += 1

    is_complete = bool(total_count) and len(collected) >= total_count
    if not is_complete:
        logger.warning(
            "[kapt_match] 목록 조기 종료 의심: %d/%s건만 수집",
            len(collected), total_count or "?",
        )
    return collected, is_complete


def match_kapt_complexes(scheduler_job_id: str = "kapt_match") -> dict:
    """K-apt 단지 목록 ↔ 우리 단지 매칭 (월 1회).

    법정동(cortar_no)으로 후보를 좁힌 뒤 이름 유사도·세대수로 거른다.
    매칭 확정분만 getAphusBassInfoV5 를 한 번 더 호출해 복도유형·세대수를 채운다
    (확정 전에 부르면 후보 전량에 API 를 태워 쿼터가 터진다).
    """
    db = SessionLocal()
    job = _record_job(db, _MATCH_JOB_TYPE, scheduler_job_id)
    try:
        kapt_rows, list_complete = _fetch_all_kapt()
        if not kapt_rows:
            _fail_job(db, job, "K-apt 목록 조회 실패 (0건)")
            logger.error("[kapt_match] 목록 0건 — API 실패로 판단")
            return {"matched": 0, "error": "kapt_list_empty"}

        # 법정동 → K-apt 후보 목록
        by_bjd: dict[str, list[dict]] = {}
        for row in kapt_rows:
            bjd = (row.get("bjdCode") or "").strip()[:10]
            if len(bjd) != 10:
                continue
            by_bjd.setdefault(bjd, []).append(row)

        targets = (
            db.query(Complex)
            .filter(
                Complex.real_estate_type_code.in_(("APT", "JGC")),
                Complex.cortar_no.isnot(None),
            )
            .all()
        )

        matched, skipped = 0, 0
        for cpx in targets:
            candidates = by_bjd.get((cpx.cortar_no or "").strip()[:10])
            if not candidates:
                skipped += 1
                continue
            best = pick_best_match(cpx, candidates)
            if best is None:
                skipped += 1
                continue
            cand, ratio = best

            # 확정분만 기본정보 보강 — 실패해도 매칭 자체는 저장한다.
            corridor, household = None, None
            basis = fetch_apt_basis_info(cand["kaptCode"])
            if basis:
                corridor = basis.get("codeHallNm")
                raw_cnt = basis.get("kaptdaCnt")
                try:
                    household = int(float(raw_cnt)) if raw_cnt is not None else None
                except (TypeError, ValueError):
                    household = None

            # ⚠ 세대수 게이트 재판정 — 여기가 게이트 ③이 실제로 발동하는 유일한 지점이다.
            # pick_best_match 는 **목록 API 후보**로 호출되는데 getTotalAptList4 응답에는
            # kaptdaCnt 가 없다 → 그 안의 household_within_tolerance 는 항상 None(대조 불가)
            # 이라 이름 임계 0.75 강화만 걸린다. 세대수를 실제로 아는 시점은 방금
            # getAphusBassInfoV5 를 부른 지금뿐이므로, 여기서 다시 대조하지 않으면
            # "법정동 같고 이름 0.75 이상이면 세대수가 3배 달라도 확정"이 되어
            # 3중 게이트가 사실상 2중으로 퇴화한다.
            if household_within_tolerance(cpx.total_household_count, household) is False:
                logger.info(
                    "[kapt_match] 세대수 게이트 탈락: %s(%s) 우리 %s vs kapt %s(%s)",
                    cpx.complex_no, cpx.complex_name,
                    cpx.total_household_count, household, cand.get("kaptName"),
                )
                skipped += 1
                continue

            _do_upsert(
                db,
                KaptComplexMap,
                {
                    "complex_no": cpx.complex_no,
                    "kapt_code": cand["kaptCode"],
                    "kapt_name": cand.get("kaptName"),
                    "match_score": round(ratio, 4),
                    "corridor_type": corridor,
                    "kapt_household_count": household,
                    "matched_at": utcnow(),
                },
                "complex_no",
            )
            matched += 1

        db.commit()

        # silent failure 가드 (env_air.py 세션 280 패턴 답습): 대상 단지가 있는데
        # 한 건도 못 붙였으면 '완료(0)' 위장 대신 failed 로 알린다.
        if matched == 0 and targets:
            _fail_job(db, job, f"대상 단지 {len(targets)}개 전부 매칭 실패 (매칭 0건)")
            logger.error("[kapt_match] silent failure 감지: 대상 %d개 전부 실패", len(targets))
            return {"matched": 0, "skipped": skipped, "error": "no_match"}

        _complete_job(db, job, matched, skipped)
        if not list_complete:
            # 부분 목록으로 돈 회차임을 job 에 남긴다 — 매칭 수가 평소보다 낮아도
            # '정상 완료'로만 보이면 조용한 퇴행이 된다(관측 가능성 확보).
            job.error_message = (
                f"부분 목록으로 매칭 (K-apt {len(kapt_rows)}건만 수집) — 다음 회차 재시도 필요"
            )[:500]
            db.commit()
        logger.info(
            "[kapt_match] 완료: %d 매칭, %d 미매칭 (대상 %d, K-apt %d건, 목록완전=%s)",
            matched, skipped, len(targets), len(kapt_rows), list_complete,
        )
        return {"matched": matched, "skipped": skipped, "list_complete": list_complete}
    except Exception as exc:
        _fail_job(db, job, str(exc))
        logger.exception("[kapt_match] 매칭 실패")
        return {"matched": 0, "error": str(exc)}
    finally:
        db.close()


def candidate_cost_months(today: date | None = None) -> list[str]:
    """수집 시도할 YYYYMM 후보 — 최신(당월-3)부터 거꾸로 _COST_MONTH_TRIES 개.

    K-apt 는 약 3개월 지연 공개라(2026-08-27 실측: 202605 가 최신), 당월-3 을
    먼저 시도하고 없으면 더 과거로 물러난다.
    """
    base = today or datetime.now(timezone.utc).date()
    months = []
    year, month = base.year, base.month
    for offset in range(_COST_LAG_MONTHS, _COST_LAG_MONTHS + _COST_MONTH_TRIES):
        total = (year * 12 + (month - 1)) - offset
        months.append(f"{total // 12:04d}{total % 12 + 1:02d}")
    return months


def _fetch_costs_for_month(kapt_code: str, month: str) -> dict[str, int]:
    """한 달치 22개 오퍼레이션 호출 → {op: 금액} 병합. 전부 미공개면 빈 dict."""
    breakdown = dict(fetch_common_cost(kapt_code, month))
    breakdown.update(fetch_individual_cost(kapt_code, month))
    return breakdown


def _summarize(breakdown: dict[str, int], household: int | None) -> dict:
    """항목별 원값 → 공용/개별/총액/세대당 요약.

    공용·개별 구분은 오퍼레이션 접미사(V3=공용, V2=개별)로 판정한다 —
    두 서비스의 op 이름이 각각 V3/V2 로 끝나 안정적인 구분자다.
    """
    common = sum(v for k, v in breakdown.items() if k.endswith("V3"))
    individual = sum(v for k, v in breakdown.items() if k.endswith("V2"))
    total = common + individual
    per_household = (
        int(round(total / household)) if household and household > 0 else None
    )
    return {
        "common_cost": common,
        "individual_cost": individual,
        "total_cost": total,
        "cost_per_household": per_household,
    }


def collect_kapt_costs(batch_size: int = 500, scheduler_job_id: str = "kapt_costs") -> dict:
    """매칭된 단지의 월별 관리비 수집 (매일).

    "이번 수집월 행이 아직 없는 단지"를 오래된 매칭 순으로 batch_size 만큼 처리한다.
    ⚠ 단지 하나에 22콜이 나가므로 batch_size 가 곧 쿼터 소모량(×22)이다.
    """
    db = SessionLocal()
    job = _record_job(db, _COST_JOB_TYPE, scheduler_job_id)
    try:
        months = candidate_cost_months()
        target_month = months[0]

        # 후보월 중 **아무 달이라도** 이미 수집한 단지는 제외.
        # ⚠ target_month 만 보면 안 된다 — 폴백으로 더 과거 달(months[1:])을 받은 단지는
        # target_month 행이 영영 안 생겨서 매일 22콜 × 3개월을 무한 재조회한다(쿼터 소진).
        done = {
            row[0]
            for row in db.query(KaptManagementCost.complex_no)
            .filter(KaptManagementCost.cost_month.in_(months))
            .all()
        }
        rows = (
            db.query(KaptComplexMap)
            .order_by(KaptComplexMap.matched_at.asc())
            .all()
        )
        targets = [r for r in rows if r.complex_no not in done][:batch_size]

        collected, failed, empty = 0, 0, 0
        for mapping in targets:
            try:
                breakdown, used_month = {}, None
                for month in months:
                    breakdown = _fetch_costs_for_month(mapping.kapt_code, month)
                    if breakdown:
                        used_month = month
                        break
                if not breakdown or used_month is None:
                    # 미공개 단지 — 실패가 아니라 정상적인 '데이터 없음'
                    empty += 1
                    continue

                household = mapping.kapt_household_count
                summary = _summarize(breakdown, household)
                _do_upsert(
                    db,
                    KaptManagementCost,
                    {
                        "complex_no": mapping.complex_no,
                        "cost_month": used_month,
                        "household_count": household,
                        "breakdown": breakdown,
                        "fetched_at": utcnow(),
                        **summary,
                    },
                    ["complex_no", "cost_month"],
                )
                collected += 1
            except Exception:
                logger.exception("[kapt_costs] 단지 %s 처리 실패", mapping.complex_no)
                failed += 1

        db.commit()

        # silent failure 가드: 대상이 있는데 한 건도 저장 못 했고 그 원인이
        # '미공개'가 아니라 실패라면 '완료(0)' 위장 대신 failed 로 알린다.
        # (전부 미공개인 경우는 정상이므로 completed 로 둔다 — 오탐 방지)
        if collected == 0 and targets and failed > 0:
            _fail_job(
                db, job,
                f"대상 {len(targets)}개 중 수집 0건 (실패 {failed}, 미공개 {empty})",
            )
            logger.error(
                "[kapt_costs] silent failure 감지: 대상 %d개 수집 0건 (실패 %d)",
                len(targets), failed,
            )
            return {"collected": 0, "failed": failed, "empty": empty, "error": "no_collect"}

        _complete_job(db, job, collected, failed)
        logger.info(
            "[kapt_costs] 완료: %d 수집, %d 실패, %d 미공개 (대상 %d, 기준월 %s)",
            collected, failed, empty, len(targets), target_month,
        )
        return {
            "collected": collected,
            "failed": failed,
            "empty": empty,
            "cost_month": target_month,
        }
    except Exception as exc:
        _fail_job(db, job, str(exc))
        logger.exception("[kapt_costs] 수집 실패")
        return {"collected": 0, "error": str(exc)}
    finally:
        db.close()
