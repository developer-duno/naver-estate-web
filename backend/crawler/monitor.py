"""크롤링 수집기 모니터 — 장애 감지 + 쿨다운 + 텔레그램 알림.

APScheduler 의 monitor job 이 주기적으로 run_monitor() 를 호출한다.
감지 신호 3종: 작업 실패 / 작업 마비 / 데이터 미축적.
설계 = docs/superpowers/specs/2026-05-18-crawler-telegram-monitoring-design.md
"""

import logging
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, case, func, select, text

from crawler.alert_format import format_issue_message, format_resolved_batch
from db.models import CrawlJob, MonitorAlert
from routers.admin.freshness import compute_freshness
from services.telegram import send_telegram
from utils import utcnow

logger = logging.getLogger(__name__)

# 작업 마비 판정 — running 인 채 이 시간 넘으면 stale (기본)
_STALE_HOURS = 1
# job_type 별 stale 임계 override (시간) — 정상적으로 오래 도는 잡의 오탐 방지.
# 배경(세션 266): public_trade_data 는 정상 69~105분(실측 4139~6291초) 도는데
# 기본 1h 임계로 "마비" 오탐(5/29 가짜 경보). 정상 최대 소요의 ~2배로 여유.
# 배경(2026-08-15): official_price(공동주택 공시가격, 매월 15일 06:30) 가 이 표에
# 누락돼 8/15 첫 정기 실행(job 43010)이 07:31 오탐 sweep(cancelled + 텔레그램
# "마비 의심" 실발화) — 실제로는 07:55 까지 44,621행 수집 중이었다. 8/10 수동
# 실행 2건(41781·41797)도 동일하게 도중 sweep. 관측 정상 소요 = 청크당 3h36m
# (24,719건·25,475건), 전량 fresh 1패스 약 7.2h → ~2배 여유로 16h.
_STALE_HOURS_BY_TYPE = {
    "public_trade_data": 3,
    "official_price": 16,
    # kapt(세션 388): 매칭=2.2만 kapt 단지 목록 + 매칭분 기본정보 1콜(0.3s throttle)로
    # 1h 초과 상시. 관리비=500단지×22콜×0.3s≈55min+지연이라 1h 경계 — 둘 다 예외 등록.
    # ⚠ kapt_match 4h 는 여유가 부족했다: 매칭 확정분 basis 콜이 2만 건 규모면
    #    2만×0.8s(RTT 실측) ≈ 4.45h 로 임계를 넘겨 official_price 와 같은 오탐
    #    sweep(세션 369)이 난다 → 관측 최대 소요의 ~2배인 8h 로 상향.
    "kapt_match": 8,
    "kapt_costs": 3,
    # childcare(세션 393): 배치 100 → 전량(2,938단지) 전환. 호출은 시군구당 1콜
    # 캐시 재사용이라 ~248콜뿐이지만 단지별 반경 매칭까지 합쳐 예상 20~30분이다.
    # 기본 1h 로도 넉넉해 보이나 첫 실전(2026-10-01) 관측 전이라, official_price
    # 가 이 표에 없어 도중 sweep 당한 오탐 사고(세션 369)를 되풀이하지 않도록
    # 보수적으로 3h 선등록한다. 첫 실전 소요 관측 후 조정 가능.
    "childcare": 3,
}
# 실패 작업 조회 윈도 — 최근 이 시간 내 failed 만
_FAILED_WINDOW_HOURS = 24


def _job_stats(db, job_type: str) -> dict | None:
    """해당 job_type 의 마지막 completed 작업 통계 1건.

    24h 합산이 아니라 마지막 1건만 — completed 여도 처리율이 낮을 수 있어
    합산하면 의미가 섞인다 (실측: public_trades 가 completed 인데 18% 처리).
    """
    row = db.execute(
        select(
            CrawlJob.processed_items,
            CrawlJob.total_items,
            CrawlJob.completed_at,
        )
        .where(and_(CrawlJob.job_type == job_type, CrawlJob.status == "completed"))
        .order_by(CrawlJob.completed_at.desc())
        .limit(1)
    ).first()
    if row is None:
        return None
    return {
        "processed": int(row.processed_items or 0),
        "total": int(row.total_items or 0),
        "completed_at": row.completed_at.isoformat() if row.completed_at else None,
    }


def _latest_failure_error(db, job_type: str, cutoff: datetime) -> str:
    """관찰 창(cutoff 이후) 안에서 가장 최근 실패 1건의 error_message.

    옛 구현은 func.max(error_message) 로 뽑아 "사전순 마지막"을 대표 에러로 썼다 —
    같은 job_type 이 여러 번 실패하면 옛 에러가 최신 에러를 가려(예: "zzz 옛 원인"이
    "aaa 새 원인"을 이김) 사장님이 이미 해결된 원인을 계속 보게 된다(세션 393 §5-J ②).
    created_at 동률(같은 초 저장)일 때를 대비해 id 로 2차 정렬한다.
    """
    row = db.execute(
        select(CrawlJob.error_message)
        .where(and_(
            CrawlJob.job_type == job_type,
            CrawlJob.status == "failed",
            CrawlJob.created_at >= cutoff,
        ))
        .order_by(CrawlJob.created_at.desc(), CrawlJob.id.desc())
        .limit(1)
    ).first()
    if row is None:
        return ""
    return row.error_message or ""


def detect_issues(db) -> list[dict]:
    """현재 크롤링 장애를 감지해 리스트로 반환 (기존 계약 유지 래퍼).

    각 항목: {"alert_key": str, "kind": str, "detail": str, "data": dict}
    alert_key 는 장애 종류 식별자 — monitor_alerts 쿨다운 키.
    detail 은 평문 (MonitorAlert.detail 컬럼 저장용), data 는 메시지 포맷용 구조화 필드.

    신선도 계산 성공 여부까지 필요하면 detect_issues_ex 를 쓴다 (세션 391).
    """
    return detect_issues_ex(db)[0]


def detect_issues_ex(db) -> tuple[list[dict], bool]:
    """detect_issues + 신선도 계산 성공 여부(freshness_ok).

    freshness_ok=False 는 "compute_freshness 가 예외로 죽어 freshness:* 신호를
    이번 스캔에서 아예 못 만들었다" 는 뜻이다. 이 경우 freshness:* 키가 통째로
    사라지므로, 해소 판정에서 그대로 쓰면 "복구됐다" 로 오인한다 (세션 391 §5-C
    가짜 복구 경로 ③) — run_monitor 가 이 플래그로 해소를 건너뛴다.
    """
    now = datetime.now(timezone.utc)
    issues: list[dict] = []
    freshness_ok = True

    # 1. 작업 실패 — 최근 24h failed job_type 별
    # 대표 에러는 아래 _latest_failure_error() 로 job_type 마다 따로 조회한다.
    # (옛 구현은 func.max(error_message) = 사전순 마지막이라 "가장 최근 실패"가 아니었다 —
    #  옛 에러가 최신 에러를 가려 원인 진단을 어긋나게 함, 세션 393 §5-J ②)
    cutoff = now - timedelta(hours=_FAILED_WINDOW_HOURS)
    failed = db.execute(
        select(
            CrawlJob.job_type,
            func.count(CrawlJob.id).label("cnt"),
        )
        .where(and_(CrawlJob.status == "failed", CrawlJob.created_at >= cutoff))
        .group_by(CrawlJob.job_type)
    ).all()

    # 1-a. 자가 복구된 job_type 식별 — 마지막 failed 이후 같은 job_type 에 completed 가 있으면
    # 이미 정상 복구된 것으로 간주하고 발화 skip. run_monitor 의 line 215 분기가 자동으로
    # "✅ 크롤링 복구" 텔레그램 알림 + status='resolved' 전이.
    # (배경: 24h 윈도 안에 옛 failed 가 있으면 매 스캔마다 active 유지되어 stale 알림 결함)
    recovery = db.execute(
        select(
            CrawlJob.job_type,
            func.max(case((CrawlJob.status == "failed", CrawlJob.created_at))).label("last_failed"),
            func.max(case((CrawlJob.status == "completed", CrawlJob.created_at))).label("last_completed"),
        )
        .where(CrawlJob.created_at >= cutoff)
        .group_by(CrawlJob.job_type)
    ).all()
    recovered = {
        r.job_type for r in recovery
        if r.last_failed and r.last_completed and r.last_completed > r.last_failed
    }

    for row in failed:
        if row.job_type in recovered:
            continue
        stats = _job_stats(db, row.job_type)
        # 실패 job_type 은 평시 0~2개라 job_type 당 1쿼리(N+1)의 부담이 무시 가능하다.
        err = _latest_failure_error(db, row.job_type, cutoff)
        issues.append({
            "alert_key": f"crawl_failed:{row.job_type}",
            "kind": "crawl_failed",
            "detail": f"{row.job_type} 작업 {row.cnt}건 실패 — {err[:200]}",
            "data": {
                "job_type": row.job_type,
                "count": row.cnt,
                "error": err,
                "processed": stats["processed"] if stats else None,
                "total": stats["total"] if stats else None,
                "last_completed_at": stats["completed_at"] if stats else None,
            },
        })

    # 2. 작업 마비 — running 인 채 job_type 별 임계 초과
    # 가장 작은 기본 임계(1h)로 후보를 넓게 가져온 뒤 Python 에서 job_type 별 임계로
    # 필터한다. public_trade_data 처럼 정상적으로 오래 도는 잡(69~105분)의 오탐 방지
    # (세션 266: 5/29 정상 80분 잡이 1h 임계로 "마비" 가짜 경보).
    base_cutoff = now - timedelta(hours=_STALE_HOURS)
    stale = db.execute(
        select(
            CrawlJob.job_type,
            func.count(CrawlJob.id).label("cnt"),
            func.min(CrawlJob.started_at).label("oldest"),
        )
        .where(and_(CrawlJob.status == "running", CrawlJob.started_at < base_cutoff))
        .group_by(CrawlJob.job_type)
    ).all()
    for row in stale:
        threshold = _STALE_HOURS_BY_TYPE.get(row.job_type, _STALE_HOURS)
        # oldest 가 job_type 임계를 아직 안 넘었으면 정상 — skip (오탐 방지).
        # SQLite 는 DateTime(timezone=True) 라도 naive 로 돌려줄 수 있어 tz 보정
        # (run_monitor line 224 _to_utc 패턴 답습).
        oldest = row.oldest
        if oldest is not None and oldest.tzinfo is None:
            oldest = oldest.replace(tzinfo=timezone.utc)
        if oldest is not None and oldest >= now - timedelta(hours=threshold):
            continue
        issues.append({
            "alert_key": f"crawl_stale:{row.job_type}",
            "kind": "crawl_stale",
            "detail": f"{row.job_type} 작업 {row.cnt}건이 {threshold}시간 넘게 running 상태 — 마비 의심",
            "data": {
                "job_type": row.job_type,
                "count": row.cnt,
                "stale_hours": threshold,
                "started_at": row.oldest.isoformat() if row.oldest else None,
            },
        })

    # 3. 데이터 미축적 — 신선도 red 종목
    # ⚠ compute_freshness 는 8종목 풀 테이블 집계라 부하 시 8초 statement_timeout 을
    # 넘길 수 있다(세션 342 실측: articles slow query 9.6초). timeout 이 나면 트랜잭션이
    # aborted 되는데, 메인 db 를 공유하면 그 뒤 monitor_alerts SELECT/UPDATE 가 전부
    # InFailedSqlTransaction 으로 연쇄 실패한다. 그래서 freshness 는 **별도 세션**으로
    # 격리해 실패해도 메인 트랜잭션을 오염시키지 않게 한다(NullPool 이라 연결 1개 잠깐 추가).
    try:
        from db.database import SessionLocal
        fresh_db = SessionLocal()
        try:
            fresh = compute_freshness(fresh_db)
        finally:
            fresh_db.close()
        for item in fresh["items"]:
            if item["status"] != "red":
                continue
            # age_hours 는 item 에 없음 — last_updated 로 직접 계산
            age_hours = None
            if item["last_updated"]:
                last = datetime.fromisoformat(item["last_updated"])
                age_hours = int((now - last).total_seconds() // 3600)
            job = item.get("last_job") or {}
            issues.append({
                "alert_key": f"freshness:{item['key']}",
                "kind": "freshness",
                "detail": f"{item['label']} 데이터 미축적 (신선도 red, 마지막 갱신 {item['last_updated']})",
                "data": {
                    "label": item["label"],
                    "status": item["status"],
                    "spinning": item.get("spinning", False),
                    "new_rows": item.get("new_rows"),
                    "last_updated": item["last_updated"],
                    "age_hours": age_hours,
                    "processed": job.get("processed_items"),
                    "total": job.get("total_items"),
                    "link_path": "/admin#freshness",
                },
            })
    except Exception:
        logger.warning("[monitor] 신선도 계산 실패 — 이번 스캔 skip", exc_info=True)
        freshness_ok = False

    return issues, freshness_ok


def _cooldown_hours() -> int:
    """쿨다운 시간 (기본 6h)."""
    return int(os.getenv("MONITOR_COOLDOWN_HOURS", "6"))


def _sweep_stale_jobs(db, issues: list[dict], now: datetime) -> int:
    """crawl_stale 로 감지된 job_type 의 running 잡을 cancelled 로 정리.

    모니터가 stale 을 감지(알림)만 하던 사각지대 보완 — 부팅 sweep(main.py)이
    '부팅 직전 시작된 잡'을 5분 임계로 놓치면 고아 running 이 영원히 남아
    매 사이클 텔레그램 오탐을 유발한다(세션 269: 잡 22665, 6시간 잔존).

    cutoff 는 detect_issues 와 동일한 job_type 별 임계(_STALE_HOURS_BY_TYPE)로
    계산 — 감지와 정리 조건을 일치시켜 drift 방지. UPDATE 는 run_monitor 의
    기존 db.commit() 에 함께 묶인다(별도 커밋 없음).
    'cancelled' 사용(failed 아님) — 강제종료/유령 잔재는 실패 통계에 잡히면 안 됨.
    """
    swept = 0
    for issue in issues:
        if issue["kind"] != "crawl_stale":
            continue
        job_type = issue["data"]["job_type"]
        threshold = _STALE_HOURS_BY_TYPE.get(job_type, _STALE_HOURS)
        cutoff = now - timedelta(hours=threshold)
        # raw text SQL — ORM update() 는 SQLite 에서 in-Python 평가 시 naive/aware
        # datetime 비교로 깨진다(_sweep_stale_running_jobs main.py 패턴 답습).
        # cutoff 는 Python 측 계산해 paramize (PG/SQLite 호환, NOW()-INTERVAL 금지).
        #
        # 마커는 COALESCE(덮어쓰기 방지)가 아니라 **항상 append** 한다 — 진행 상황을
        # error_message 에 기록하는 잡(official_price 가 대표)은 스윕 시점에 이미 값이
        # 있어 COALESCE 로는 마커가 안 붙었고, 그러면 _resolution_reason 이 그 잡을
        # 'swept' 가 아니라 '수동 취소' 로 오분류한다(세션 391). 기존 문구는 보존.
        res = db.execute(
            text("""
                UPDATE crawl_jobs
                SET status = 'cancelled',
                    completed_at = :now,
                    error_message = COALESCE(error_message || ' | ', '')
                                    || 'stale running — swept by monitor'
                WHERE status = 'running'
                  AND completed_at IS NULL
                  AND job_type = :job_type
                  AND started_at < :cutoff
            """),
            {"now": now, "job_type": job_type, "cutoff": cutoff},
        )
        swept += res.rowcount or 0
    if swept:
        logger.info("[monitor] stale running crawl_jobs %d개 cancelled 정리", swept)
    return swept


def _resolution_reason(db, kind: str, job_type: str) -> tuple[str, str]:
    """해소(resolved) 사유를 판정 — (reason, detail) 반환.

    "이번 스캔에 그 키가 없다" 는 것은 **성공 확인이 아니다**. 원인이 셋인데
    지금까지 전부 "✅ 정상으로 돌아왔습니다" 한 문구로 나가 사장님이 가짜 복구를
    믿게 만들었다 (세션 391 §5-C):
      ① _sweep_stale_jobs 가 running 잡을 강제 cancelled → 다음 스캔에 키 소멸
      ② 24h 관찰 창에서 failed 가 빠져나감 (성공은 한 번도 없었음)
      ③ 신선도 계산 실패로 freshness:* 키 통째 소멸 (→ 이건 run_monitor 가 아예 차단)

    reason:
      "recovered"   — 최근 실행이 completed. 진짜 복구.
      "swept"       — 모니터/부팅 스윕이 강제 정리(cancelled + 'swept' 마커). 원인 미해결.
      "unconfirmed" — 조건은 해소됐으나 성공 실행 미확인. detail 에 마지막 실행 상태 명시.

    ⚠ 사유는 문구·이모지에만 영향을 준다 — status 전환(active→resolved)은 전부 기존과 동일.
    """
    if kind not in ("crawl_failed", "crawl_stale"):
        # freshness:* 는 신선도 계산이 성공한 스캔에서만 해소된다(run_monitor 가 보장).
        # 그 스캔에서 키가 빠졌다 = 실제로 red 를 벗어난 것이므로 진짜 복구.
        return "recovered", ""

    row = db.execute(
        select(CrawlJob.status, CrawlJob.error_message)
        .where(and_(CrawlJob.job_type == job_type, CrawlJob.status != "running"))
        .order_by(CrawlJob.created_at.desc(), CrawlJob.id.desc())
        .limit(1)
    ).first()

    if row is None:
        return "unconfirmed", "실행 이력 없음"
    if row.status == "completed":
        return "recovered", ""
    if row.status == "cancelled":
        # monitor 스윕('swept by monitor')·부팅 스윕('swept on startup') 양쪽 포괄.
        if "swept" in (row.error_message or ""):
            return "swept", ""
        return "unconfirmed", "마지막 실행: 취소됨 (수동 취소 또는 토글 꺼짐)"
    if row.status == "failed":
        # "24h 관찰 창 경과" 는 crawl_failed 알림의 해소 사유일 때만 참이다.
        # crawl_stale(마비)은 24h 창과 무관하게 running 소멸로 해소되므로 그 문구를
        # 붙이면 거짓 설명이 된다.
        if kind == "crawl_failed":
            return "unconfirmed", f"마지막 실행: 실패 ({_FAILED_WINDOW_HOURS}h 관찰 창 경과)"
        return "unconfirmed", "마지막 실행: 실패"
    # pending·paused 등 그 밖의 상태 — 임의로 "실패" 라 부르지 않고 원문 그대로 전달.
    return "unconfirmed", f"마지막 실행: {row.status}"


def run_monitor(db) -> None:
    """장애 감지 → monitor_alerts 대조 → 쿨다운 적용 → 텔레그램 발송.

    APScheduler monitor job 이 호출. 예외는 흡수하지 않고 전부 위로 던진다 —
    run_monitor_job → APScheduler EVENT_JOB_ERROR → job_error_listener 텔레그램
    경로가 발화해야 "감시자 자신이 죽은 것"을 사장님이 알 수 있다(세션 393 §5-J ①).
    옛 구현은 여기서 흡수해 monitor 가 매 주기 죽어도 무알림이었다.
    freshness 계산 실패 격리(detect_issues_ex 내부 try/except)는 그대로 유지 —
    그건 "부분 신호 결손" 이라 스캔 전체를 죽일 이유가 아니다.
    """
    try:
        issues, freshness_ok = detect_issues_ex(db)
    except Exception:
        logger.warning("[monitor] 장애 감지 실패", exc_info=True)
        raise

    now = utcnow()
    current_keys = {i["alert_key"] for i in issues}
    cooldown = timedelta(hours=_cooldown_hours())
    # 헤더 "N건 활성" — 이번 스캔 장애 총 건수. 모든 발송에 동일 값 (전체 상황 요약).
    header_ctx = {"active_count": len(issues), "now": now}

    # 0. stale running 잡 정리 — 감지만 하던 사각지대 보완 (세션 269).
    #    아래 alert 처리의 db.commit() 에 함께 묶임.
    _sweep_stale_jobs(db, issues, now)

    # 1. 현재 장애 — 신규 발송 / 쿨다운 억제
    for issue in issues:
        key = issue["alert_key"]
        kind = issue["kind"]
        data = issue["data"]
        alert = db.execute(
            select(MonitorAlert).where(MonitorAlert.alert_key == key)
        ).scalar_one_or_none()

        if alert is None:
            # 신규 장애 — 발송 성공 시에만 last_notified 기록
            msg = format_issue_message(kind, data, event="new", header_ctx=header_ctx)
            sent = send_telegram(msg, parse_mode="HTML")
            db.add(MonitorAlert(
                alert_key=key, status="active",
                detail=issue["detail"],
                last_notified=now if sent else None,
            ))
        elif alert.status == "resolved":
            # 해소됐던 장애 재발 — 발송 성공 시에만 last_notified 갱신
            msg = format_issue_message(kind, data, event="recur", header_ctx=header_ctx)
            sent = send_telegram(msg, parse_mode="HTML")
            alert.status = "active"
            alert.detail = issue["detail"]
            if sent:
                alert.last_notified = now
        else:
            # 진행 중 장애 — 쿨다운 확인
            last = alert.last_notified
            # SQLite 는 DateTime(timezone=True) 라도 naive 로 돌려줄 수 있어
            # tz-aware now 와 빼면 에러 → freshness._to_utc 와 동일하게 보정
            if last is not None and last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            if last is None or (now - last) >= cooldown:
                msg = format_issue_message(kind, data, event="ongoing", header_ctx=header_ctx)
                if send_telegram(msg, parse_mode="HTML"):
                    alert.last_notified = now
            alert.detail = issue["detail"]

    # 2. 해소된 장애 — 이번 스캔에 없는 active 행
    #    발송은 "먼저 전부 모은 뒤" 1건이면 단건, 2건 이상이면 1통 묶음 (세션 393 §5-J ④).
    #    DB 장애 복구 직후처럼 여러 건이 한 스캔에 해소되면 건당 1통이 알림 폭탄이 됐다.
    actives = db.execute(
        select(MonitorAlert).where(MonitorAlert.status == "active")
    ).scalars().all()
    resolved_targets: list[tuple[MonitorAlert, str, dict]] = []
    for alert in actives:
        if alert.alert_key not in current_keys:
            # 복구 알림 성공 시에만 resolved 처리 — 실패 시 다음 스캔 재시도
            # 구조화 data 없음 → alert_key·detail 만 전달
            # kind = alert_key 의 prefix (crawl_failed / crawl_stale / freshness).
            kind, _, target = alert.alert_key.partition(":")
            # 신선도 계산이 실패한 스캔에서는 freshness:* 키가 통째로 사라진다 —
            # 이걸 해소로 읽으면 "가짜 복구" 알림이 나간다(세션 391 경로 ③).
            # 계산이 성공한 다음 스캔에서 판정하도록 이번엔 건드리지 않는다.
            if not freshness_ok and kind == "freshness":
                continue
            try:
                reason, reason_detail = _resolution_reason(db, kind, target)
            except Exception:
                # 사유 판정은 부가 정보일 뿐이다 — 여기서 예외가 새면 스캔 전체
                # 트랜잭션이 되돌아가 alert 처리가 통째로 죽는다(세션 342 재현).
                # reason="" 는 alert_format 이 기존 문구로 폴백하는 값.
                logger.warning("[monitor] 해소 사유 판정 실패 — 기존 문구 폴백", exc_info=True)
                reason, reason_detail = "", ""
            resolved_targets.append((alert, kind, {
                "alert_key": alert.alert_key,
                "detail": alert.detail,
                "reason": reason,
                "reason_detail": reason_detail,
            }))

    if len(resolved_targets) == 1:
        alert, kind, data = resolved_targets[0]
        msg = format_issue_message(kind, data, event="resolved", header_ctx=header_ctx)
        if send_telegram(msg, parse_mode="HTML"):
            alert.status = "resolved"
    elif resolved_targets:
        # 묶음 발송 1회가 성공해야만 전부 resolved 로 전이 — 실패하면 아무도 전이하지
        # 않고 다음 스캔에서 재시도(단건 경로의 "성공 시에만 전이" 의미 그대로 보존).
        msg = format_resolved_batch(
            [data for _, _, data in resolved_targets], header_ctx=header_ctx
        )
        if send_telegram(msg, parse_mode="HTML"):
            for alert, _, _ in resolved_targets:
                alert.status = "resolved"

    db.commit()


def run_monitor_job() -> None:
    """APScheduler 진입점 — DB 세션 열고 run_monitor 호출.

    예외는 rollback 후 **재던진다** — APScheduler EVENT_JOB_ERROR 가 떠야
    job_error_listener 가 텔레그램으로 "크롤링 모니터 작업 실패" 를 알린다.
    옛 구현은 logger.warning 으로 삼켜 감시자 자신의 사망이 무알림이었다
    (감시 사각, 세션 393 §5-J ①). 리스너는 in-process 쿨다운(600초)이라 DB 가
    죽은 상황에서도 동작하고, 스팸도 억제된다.
    """
    from db.database import SessionLocal

    db = SessionLocal()
    try:
        run_monitor(db)
    except Exception:
        logger.warning("[monitor] job 실행 실패", exc_info=True)
        db.rollback()
        raise
    finally:
        db.close()
