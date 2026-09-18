"""테이블 컬럼을 즉시 출력한다 — SQL 을 치기 전에 1회.

왜 있나: 세션 412·413 에 컬럼·테이블명을 **추측**했다가 조회가 6회 실패했다
(`agent_verifications.status`→실제 `verification_status` · `kapt_management_costs.target_month`
→`cost_month` · `.collected_at`→`fetched_at` · `monitor_alerts.resolved_at` 없음 ·
`naver_call_counts`→`naver_api_call_counts` · `crawl_jobs.total_count`→`total_items`).
PostgreSQL 은 실패한 문장 하나가 그 트랜잭션의 후속 쿼리를 전부 거부하므로, 추측 한 번이
스크립트를 통째로 죽인다. 메모리에 "모델 먼저 읽어라"가 이미 있었지만 의지로는 안 지켜졌다
— 그래서 **10초 걸리는 도구**로 바꾼다.

사용:
    cd backend && python scripts/cols.py                     # 테이블 목록
    cd backend && python scripts/cols.py crawl_jobs          # 그 테이블의 컬럼
    cd backend && python scripts/cols.py kapt                # 이름에 'kapt' 가 든 테이블 전부

**DB 에 접속하지 않는다** — models.py 의 선언(메타데이터)만 읽는다. 다만 `db.models` 가
`db.database` 를 import 하고 그쪽이 `DATABASE_URL` 을 요구하므로, 값이 없으면 여기서
**메모리 SQLite 더미**를 넣어 준다(엔진을 만들 뿐 연결은 열지 않는다). 그래서 워크트리·CI
처럼 `.env` 가 없는 곳에서도 돌고, 라이브 DB 에는 어떤 영향도 없다.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# ⚠ import 보다 먼저 — db.database 가 모듈 최상위에서 DATABASE_URL 을 읽는다.
#   이미 설정돼 있으면(라이브 폴더에서 dotenv 로 들어온 경우 등) 건드리지 않는다.
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from db import models  # noqa: E402  (경로·환경 설정 후 import)


def _tables():
    return dict(sorted(models.Base.metadata.tables.items()))


def main() -> int:
    tables = _tables()
    if len(sys.argv) < 2:
        print(f"테이블 {len(tables)}개:")
        for name in tables:
            print(" ", name)
        print("\n사용: python scripts/cols.py <테이블명 또는 일부>")
        return 0

    needle = sys.argv[1].lower()
    hits = {n: t for n, t in tables.items() if needle in n.lower()}
    if not hits:
        print(f"'{sys.argv[1]}' 에 맞는 테이블이 없다. 전체 목록:")
        for name in tables:
            print(" ", name)
        return 1

    for name, table in hits.items():
        print(f"=== {name} ===")
        for col in table.columns:
            flags = []
            if col.primary_key:
                flags.append("PK")
            if not col.nullable:
                flags.append("NOT NULL")
            if col.foreign_keys:
                flags.append("FK→" + ",".join(str(fk.column) for fk in col.foreign_keys))
            suffix = f"  [{' '.join(flags)}]" if flags else ""
            print(f"  {col.name:<28} {str(col.type):<22}{suffix}")
        uniques = [
            c for c in table.constraints
            if c.__class__.__name__ == "UniqueConstraint"
        ]
        for u in uniques:
            print("  UNIQUE:", ", ".join(c.name for c in u.columns))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
