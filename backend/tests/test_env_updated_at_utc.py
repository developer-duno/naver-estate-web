"""env 수집기 *_updated_at 저장이 UTC(utcnow) 인지 회귀 가드 (세션 309 · 대상 수집기는 세션604·473 에 삭제).

배경: air_updated_at·crime_updated_at 이 과거 naive `datetime.now()`(집 서버 KST)로
저장돼, freshness.py 가 UTC 로 비교(`_to_utc` 가 naive 를 UTC 로 거짓 태깅)하면서
신선도가 9시간 더 최신으로 오판됐다(실측: air max 02:02 = KST 저장 확정). 저장을
프로젝트 표준 `utcnow()`(aware UTC, backend/utils/__init__.py)로 통일해 freshness 의
UTC 비교와 축을 맞췄다.

SQLite(CI 엔진)는 tzinfo 를 보존하지 않아 "저장값이 aware 였는가"를 런타임으로
단언하기 어렵다 → 소스 텍스트 가드로 "naive datetime.now() 로 되돌리면 실패"를 잡는다.
선례: test_migration_v031_anon_lock.py (SQLite 라 텍스트 자산 검사).
"""
# 소스 텍스트 가드의 대상이던 env_air.py(세션604)·범죄 통계 수집기(세션 473)는 둘 다 삭제됐다 —
# 남은 것은 freshness 의 UTC 비교 축 확인뿐이다.


def test_freshness_to_utc_matches_utcnow_axis():
    """freshness._to_utc 가 utcnow() 가 만든 aware UTC 를 그대로(변환 없이) 통과시킨다.

    저장(utcnow)과 비교(_to_utc) 축이 같음을 직접 확인 — 9시간 오판 회귀 방지.
    """
    from routers.admin.freshness import _to_utc
    from utils import utcnow

    aware = utcnow()
    # 이미 aware UTC 면 _to_utc 는 그대로 반환해야 한다 (거짓 태깅 없음).
    assert _to_utc(aware) == aware
    assert _to_utc(aware).tzinfo is not None
