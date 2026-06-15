"""env_air·env_crime 의 *_updated_at 저장이 UTC(utcnow) 인지 회귀 가드 (세션 309).

배경: air_updated_at·crime_updated_at 이 과거 naive `datetime.now()`(집 서버 KST)로
저장돼, freshness.py 가 UTC 로 비교(`_to_utc` 가 naive 를 UTC 로 거짓 태깅)하면서
신선도가 9시간 더 최신으로 오판됐다(실측: air max 02:02 = KST 저장 확정). 저장을
프로젝트 표준 `utcnow()`(aware UTC, backend/utils/__init__.py)로 통일해 freshness 의
UTC 비교와 축을 맞췄다.

SQLite(CI 엔진)는 tzinfo 를 보존하지 않아 "저장값이 aware 였는가"를 런타임으로
단언하기 어렵다 → 소스 텍스트 가드로 "naive datetime.now() 로 되돌리면 실패"를 잡는다.
선례: test_migration_v031_anon_lock.py (SQLite 라 텍스트 자산 검사).
"""
import re
from pathlib import Path

import pytest

_BACKEND = Path(__file__).resolve().parent.parent

# (파일, 그 파일에서 *_updated_at 저장에 쓰여야 하는 헬퍼)
_ENV_FILES = [
    "crawler/env_air.py",
    "crawler/env_crime.py",
]


@pytest.mark.parametrize("rel", _ENV_FILES)
def test_env_updated_at_uses_utcnow_not_naive_now(rel):
    """env 수집기는 *_updated_at 저장에 naive datetime.now() 를 쓰면 안 된다.

    naive datetime.now() 는 머신 로컬(집 서버 KST)을 따라가 freshness UTC 비교와
    9시간 어긋난다. 반드시 utcnow()(aware UTC) 경유.
    """
    src = (_BACKEND / rel).read_text(encoding="utf-8")

    # utcnow 가 import 되어 있어야 한다.
    assert "from utils import utcnow" in src, f"{rel}: utcnow import 누락"

    # *_updated_at = datetime.now() (naive, tz 인자 없음) 패턴 금지.
    # datetime.now(timezone.utc)·datetime.now(_KST) 같이 tz 인자가 있으면 허용.
    naive_now = re.findall(r"_updated_at\s*=\s*datetime\.now\(\s*\)", src)
    assert not naive_now, (
        f"{rel}: *_updated_at 에 naive datetime.now() 사용 — utcnow() 로 교체 필요. {naive_now}"
    )


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
