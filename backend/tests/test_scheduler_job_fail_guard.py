"""스케줄러 잡 except 가드 회귀 (세션 271).

배경: 세션 266 에서 fail_job_safely(새 세션 마킹) 를 도입했으나, status='running'
CrawlJob 을 만드는 스케줄 잡 중 일부(collect_price_history·collect_metrics·
discover_regions)가 이 가드 없이 except 안에서 같은 세션으로 rollback/commit 만 했다.
연결 끊김(SSL closed) 시 그 commit 이 또 예외를 던져 job 이 running 으로 영구 잔존
(세션 266 = 11시간 running 실측 메커니즘). 세션 271 에서 3종에 가드 추가.

이 테스트는 ast 로 각 잡 함수의 try/except 본문에 fail_job_safely 폴백이 있는지
정적 검증한다(신규 잡 추가 시 누락 silent 재발 차단). 실행 통합 테스트는 네이버 호출
의존성이 무거워 부적합 — `test_migration_v031_anon_lock.py` 텍스트 자산 검사 선례 답습.
"""
import ast
from pathlib import Path

import pytest

_CRAWLER_DIR = Path(__file__).resolve().parent.parent / "crawler"

# (모듈 파일, 함수명) — status='running' CrawlJob 을 만드는 스케줄 잡.
# 신규 스케줄 잡 추가 시 본 목록에 등록 + 가드 적용 의무.
_GUARDED_JOBS = [
    ("service_price.py", "collect_price_history"),
    ("service_metrics.py", "collect_complex_metrics"),
    ("service_discover.py", "discover_complexes_by_region"),
    # 세션 266 에서 이미 가드된 핵심 경로 (회귀 방지로 함께 검증)
    ("service_discover.py", "crawl_complex_articles"),
    ("service_discover.py", "crawl_article_details"),
    # 세션 288: CrawlJob 기록 신설과 동시에 가드 적용 (last_run null 해소)
    ("service_public.py", "backfill_price_batch"),
    # 세션 394: 결제 배치는 이 가드가 유일하게 빠져 있었다 (running 유령 → 모니터 오탐)
    ("billing_charge.py", "charge_due_billing_keys"),
]


def _find_function(tree: ast.Module, name: str) -> ast.FunctionDef | None:
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == name:
            return node
    return None


def _calls_fail_job_safely(node: ast.AST) -> bool:
    """노드 하위에서 fail_job_safely(...) 호출이 있는지."""
    for sub in ast.walk(node):
        if isinstance(sub, ast.Call):
            fn = sub.func
            if isinstance(fn, ast.Name) and fn.id == "fail_job_safely":
                return True
    return False


def _except_handlers_have_fallback(func: ast.FunctionDef) -> bool:
    """함수의 최상위 try/except 핸들러 중 하나라도 fail_job_safely 폴백을 가지는지.

    보호 패턴: except Exception 안에 중첩 try(같은 세션 마킹) + except 에서
    fail_job_safely(새 세션). 핸들러 본문 어딘가에 fail_job_safely 호출이 있으면 통과.
    """
    for node in ast.walk(func):
        if isinstance(node, ast.ExceptHandler):
            if _calls_fail_job_safely(node):
                return True
    return False


@pytest.mark.parametrize("module_file, func_name", _GUARDED_JOBS)
def test_scheduler_job_has_fail_job_safely_guard(module_file: str, func_name: str):
    """status='running' 잡 함수의 except 가 fail_job_safely 폴백을 가져야 한다."""
    source = (_CRAWLER_DIR / module_file).read_text(encoding="utf-8")
    tree = ast.parse(source)
    func = _find_function(tree, func_name)
    assert func is not None, f"{module_file} 에 {func_name} 함수가 없음"
    assert _except_handlers_have_fallback(func), (
        f"{module_file}:{func_name} 의 except 블록에 fail_job_safely 폴백이 없음 — "
        f"연결 끊김 시 job 이 running 으로 영구 잔존할 수 있음 (세션 266/271 가드 누락)"
    )
