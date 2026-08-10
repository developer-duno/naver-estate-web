"""APScheduler 잡 예외/누락(misfire) 최후 안전망 — DB 도달 전 죽는 잡도 알림.

배경: monitor.py 는 CrawlJob row 가 이미 기록된 실패만 감지한다. 잡이 CrawlJob 을
기록하기 전에 예외를 던지거나(예: 빌링키 04:50 크론이 시작 직후 죽음), APScheduler
가 misfire(누락)로 스킵하면 DB 흔적도 텔레그램도 없이 silent 로 사라진다.
본 모듈은 스케줄러 이벤트 레벨에서 이 두 상황을 감지하는 최후의 그물이다.

등록은 main.py 에서 register_job_listener(scheduler) 호출로 이뤄진다(본 모듈은 안 함).

세션 359: 옛 메시지("[내부즉시] 잡 실패 job_id=crawl_details: InFailedSqlTransaction...")
가 job_id(영문 코드)·raw 예외 타입만 찍혀 사장님이 "뭐가 문제인지 안 나온다"고
지적 — 3가지를 보강한다: ①한글 잡 이름 ②event.traceback 에서 실제 원인 라인(파일:줄
+ 예외타입, InFailedSqlTransaction 같은 후속 증상이 아니라 최초 발생 지점) ③관리자
화면 링크. traceback 자체가 이미 원인 체인(예외 전파 스택)을 담고 있어, 별도로
로그를 파싱해 "직전에 삼켜진 예외"를 추적할 필요가 없다 — event.exception 이 그
잡을 실제로 죽인 예외이고, traceback 이 그 예외가 어디서 발생했는지 보여준다.
"""

import html
import logging
import os
import re
import time

from apscheduler.events import EVENT_JOB_ERROR, EVENT_JOB_MISSED

logger = logging.getLogger(__name__)

# 두 이벤트를 한 리스너에서 같이 받기 위한 마스크 (add_listener 두 번째 인자)
JOB_LISTENER_MASK = EVENT_JOB_ERROR | EVENT_JOB_MISSED

# 알림 쿨다운 — billing_charge.py _ALERT_COOLDOWN_SEC 패턴 답습.
# 같은 (kind, job_id) 조합은 이 시간 안에 재알림 억제 (스케줄러 폭주 시 텔레그램 스팸 방지).
_COOLDOWN_SEC = 600  # 10분
_last_alert_at: dict[str, float] = {}

# 잡 id(영문) → 한글 라벨 폴백. scheduler.get_job(job_id).name 조회가 우선이고
# (잡이 아직 스케줄러에 등록된 상태), 이건 그마저 실패할 때(잡이 이미 제거된 경우
# 등)의 최후 폴백 — SCHEDULER_JOB_META(admin/scheduler.py) 와 별개의 최소 사본.
_JOB_LABEL_FALLBACK = {
    "discover_regions": "전국 단지 발견",
    "crawl_articles": "매물 수집 배치",
    "crawl_details": "매물 상세 보강",
    "collect_prices": "시세 이력 수집",
    "backfill_price": "시세 이력 소급 수집",
    "collect_public_trades": "공공데이터 실거래가 수집",
    "collect_officetel_presale": "청약홈 오피스텔 수집",
    "collect_rental_presale": "청약홈 민간임대 수집",
    "official_price": "공동주택 공시가격 수집",
    "collect_air_quality": "에어코리아 대기질 수집",
    "collect_emergency": "응급의료기관 수집",
    "collect_childcare": "어린이집 수집",
    "collect_crime_stats": "범죄통계 수집",
    "crawler_monitor": "크롤링 모니터",
    "collect_metrics": "단지 가치지표 수집",
    "billing_charge": "빌링키 자동결제",
    "vacuum_maintenance": "정기 VACUUM 유지보수",
}


def _job_label(scheduler, job_id: str) -> str:
    """job_id(영문) → 한글 라벨. scheduler 조회 우선, 실패 시 폴백 표, 그마저 없으면 job_id 그대로."""
    try:
        job = scheduler.get_job(job_id)
        if job is not None and job.name:
            return job.name
    except Exception:
        pass
    return _JOB_LABEL_FALLBACK.get(job_id, job_id)


def _root_cause_location(tb_text: str | None) -> str | None:
    """traceback 문자열에서 "어느 파일 몇 번째 줄"인지만 추출 — 실패하면 None.

    traceback.format_exception() 결과는 'File X, line N, in func' 줄과 그 아래
    실제 코드 줄이 번갈아 나오고, 마지막 예외 타입 줄로 끝난다.

    ⚠ 단순히 "마지막 File 줄"을 뽑으면 site-packages/venv 등 라이브러리 내부
    프레임(예: sqlalchemy/orm/session.py)이 걸릴 수 있다 — 그건 "무엇을 하다"의
    답이 아니라 "그걸 실행한 라이브러리 함수 내부 어디"일 뿐이라 사장님이 봐도
    무슨 뜻인지 알 수 없다. 우리 코드(crawler/routers/services/db/main.py 등,
    site-packages 가 아닌 backend/ 소스)가 마지막으로 등장한 프레임이 실제
    "어느 기능에서 무엇을 하다 죽었는지"를 알려주는 지점이라 그것부터 우선한다.

    ⚠ File 줄이 하나도 없으면(형식이 다른 트레이스백, 혹은 트레이스백 자체가
    비정상) None 을 반환한다 — 호출부가 "위치를 못 찾았다"와 "위치를 찾았는데
    라이브러리뿐이다"를 구분해서 실제 예외 메시지(event.exception)는 항상
    별도로 보여주게 하기 위함. 여기서 아무 줄이나 반환하면 실제 예외 메시지가
    가려질 위험이 있다(예: 트레이스백 마지막 줄이 원본 예외 텍스트와 다를 때).
    """
    if not tb_text:
        return None
    lines = [line.strip() for line in tb_text.strip().split("\n") if line.strip()]
    file_lines = [line for line in lines if line.startswith("File ")]
    if not file_lines:
        return None
    # 우리 소스(site-packages/venv 가 아닌 backend/ 자체 모듈)만 남긴 뒤 마지막 것 —
    # 없으면(라이브러리 내부에서만 죽은 극단 케이스) 어쩔 수 없이 전체 마지막으로 폴백.
    own_code_lines = [
        line for line in file_lines
        if "site-packages" not in line and "venv" not in line and "\\lib\\" not in line.lower()
    ]
    last_file = (own_code_lines or file_lines)[-1]
    # backend/ 기준 상대경로만 남겨 메시지 길이 절약 (전체 절대경로는 로그에서 확인)
    return re.sub(r'File ".*?backend[\\/]', 'File "', last_file)


def _admin_link(path: str) -> str:
    """alert_format._admin_link 와 동일 로직(순환import 회피 위해 복제, 5줄 이내)."""
    raw = os.getenv("FRONTEND_URL", "")
    candidates = [u.strip().rstrip("/") for u in raw.split(",") if u.strip()]
    if not candidates:
        return path
    non_local = [u for u in candidates if "localhost" not in u and "127.0.0.1" not in u]
    base = (non_local or candidates)[0]
    return f"{base}{path}"


def _should_alert(key: str) -> bool:
    """쿨다운 확인 — 억제 대상이면 False, 아니면 발송 허용하며 시각 기록."""
    now = time.monotonic()
    last = _last_alert_at.get(key)
    if last is not None and (now - last) < _COOLDOWN_SEC:
        return False
    _last_alert_at[key] = now
    return True


def _send_alert(message: str, *, parse_mode: str | None = None) -> None:
    """텔레그램 발송 — 실패해도 리스너를 죽이지 않음(best-effort, lazy import)."""
    try:
        from services.telegram import send_telegram
        send_telegram(message, parse_mode=parse_mode)
    except Exception:
        logger.warning("[scheduler] 텔레그램 알림 발송 실패", exc_info=True)


def job_event_listener(event, scheduler=None) -> None:
    """APScheduler 잡 예외(EVENT_JOB_ERROR)/누락(EVENT_JOB_MISSED) 리스너.

    monitor.py 가 못 잡는, CrawlJob row 기록 이전 단계의 실패를 last-resort 로 감지.
    scheduler 인자는 register_job_listener 가 클로저로 주입(잡 이름 조회용).
    """
    # [내부즉시] 접두어 = 3채널(healthcheck.yml 외부/monitor.py 내부모니터/본 모듈)
    # 문구 통일 작업의 일부. 옛 [SCHEDULER] 표기를 다른 두 채널과 같은 명명 규칙으로
    # 교체 — 사장님이 채널명만 보고 어느 감시가 보낸 메시지인지 구분 가능하게 함
    # (IMPROVEMENT_PLAN P0-0 보류 항목).
    # _job_label 은 scheduler=None(테스트·초기화 전)도 안전 — get_job() 호출이
    # AttributeError 로 죽어도 내부 try/except 가 흡수해 폴백 표로 넘어간다.
    label = _job_label(scheduler, event.job_id)
    link = _admin_link("/admin#scheduler")

    safe_label = html.escape(str(label))
    safe_link = html.escape(link)

    if event.code == EVENT_JOB_ERROR:
        job_id = event.job_id
        # 실제 예외 메시지(event.exception)는 항상 보여준다 — 위치 추출 실패가
        # 이걸 가리면 안 된다(테스트 fixture 처럼 traceback 이 비정형일 때 발생).
        exc_text = str(event.exception)[:300]
        location = _root_cause_location(getattr(event, "traceback", None))
        logger.error("[scheduler] 잡 예외 job_id=%s: %s", job_id, event.exception)
        key = f"job_error:{job_id}"
        if _should_alert(key):
            lines = [f"[내부즉시] 🔴 <b>{safe_label}</b> 작업 실패"]
            if location:
                lines.append(f"위치: {html.escape(location)}")
            lines.append(f"오류: {html.escape(exc_text)}")
            lines.append(f"→ {safe_link} 확인")
            _send_alert("\n".join(lines), parse_mode="HTML")
    elif event.code == EVENT_JOB_MISSED:
        job_id = event.job_id
        logger.warning(
            "[scheduler] 잡 누락(misfire) job_id=%s 예정시각=%s",
            job_id, event.scheduled_run_time,
        )
        key = f"job_missed:{job_id}"
        if _should_alert(key):
            _send_alert(
                f"[내부즉시] 🔴 <b>{safe_label}</b> 실행 누락(예정 시각을 건너뜀)\n"
                f"예정시각: {html.escape(str(event.scheduled_run_time))}\n"
                f"→ {safe_link} 확인",
                parse_mode="HTML",
            )


def register_job_listener(scheduler) -> None:
    """scheduler 에 job_event_listener 를 등록 — main.py 에서 호출.

    잡 이름 조회(_job_label)를 위해 scheduler 를 클로저로 주입 — APScheduler 의
    add_listener 콜백은 (event) 단일 인자만 받으므로 래핑한다.
    """
    scheduler.add_listener(lambda event: job_event_listener(event, scheduler), JOB_LISTENER_MASK)
