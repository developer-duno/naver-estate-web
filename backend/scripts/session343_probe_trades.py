"""세션 343 — 공공데이터(trades) 신선도 거짓경보 실증 프로브 (읽기전용)

목적: public_trades 종목이 매월 거짓 red 가 되는 서사를 prod 데이터로 실증한다.
  1) trades.recorded_at 최신 시각이 현재 red 임계(7일×3=21일)를 넘었는지
  2) freshness:public_trades 가 monitor_alerts 에 active 로 올라와 실제 알림이 나갔는지
  3) complex_price_history 에 공공데이터/네이버 출처 구분 컬럼이 있는지 (옵션 C 기각 확인)

읽기전용 — INSERT/UPDATE 0. 네이버 호출 0. 임시 uvicorn 금지(release.md §5-1).
사용법: cd backend && python -m scripts.session343_probe_trades
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv

load_dotenv()

from datetime import datetime, timezone

from sqlalchemy import func, inspect, select, text

from db.database import SessionLocal
from db.mb_models import MBTrade


def _status_label(age_days: float, expected_days: float) -> str:
    """freshness.py:_status() 와 동일 공식 — 표시용 (초 대신 일 단위)."""
    if age_days <= expected_days * 1.5:
        return f"green ({age_days / expected_days:.2f}×)"
    if age_days <= expected_days * 3.0:
        return f"yellow ({age_days / expected_days:.2f}×)"
    return f"red ({age_days / expected_days:.2f}×)"


db = SessionLocal()
try:
    now = datetime.now(timezone.utc)

    # 1) trades 최신 시각 + 행수
    print("=== [1] trades (MBTrade) 신선도 ===")
    row = db.execute(select(func.max(MBTrade.recorded_at), func.count(MBTrade.id))).one()
    max_recorded, cnt = row[0], row[1]
    print(f"  count(*)            = {cnt:,}")
    print(f"  max(recorded_at)    = {max_recorded}  (type={type(max_recorded).__name__})")
    if max_recorded is not None:
        # recorded_at 은 Date → 자정 UTC 로 승격해 나이 계산 (freshness._to_utc 와 동일)
        if isinstance(max_recorded, datetime):
            last = max_recorded if max_recorded.tzinfo else max_recorded.replace(tzinfo=timezone.utc)
        else:
            last = datetime(max_recorded.year, max_recorded.month, max_recorded.day, tzinfo=timezone.utc)
        age_days = (now - last).total_seconds() / 86400
        print(f"  age                 = {age_days:.1f} 일")
        print(f"  현재(7일) 상태      = {_status_label(age_days, 7)}   (red 임계 21일)")
        print(f"  수정후(30일) 상태   = {_status_label(age_days, 30)}   (red 임계 90일)")
        print(f"  >>> 거짓경보 실증   = {'YES (현재 red, 수정후 정상)' if age_days > 21 and age_days <= 45 else 'age 재검토 필요'}")
    else:
        print("  trades 비어있음 → status=unknown (monitor 알림 없음)")

    # 2) monitor_alerts 에 freshness:public_trades active 여부
    print("\n=== [2] monitor_alerts: freshness:public_trades ===")
    alerts = db.execute(
        text(
            "SELECT alert_key, status, last_notified, detail "
            "FROM monitor_alerts WHERE alert_key = :k"
        ).bindparams(k="freshness:public_trades")
    ).all()
    if not alerts:
        print("  (해당 alert_key 행 없음 — 아직 발화 기록 없거나 이미 정리됨)")
    for a in alerts:
        print(f"  status={a.status}  last_notified={a.last_notified}")
        print(f"  detail={a.detail}")

    # 3) complex_price_history 출처 구분 컬럼 (옵션 C 기각 근거)
    print("\n=== [3] complex_price_history 컬럼 (출처 구분 여부) ===")
    insp = inspect(db.bind)
    cols = [c["name"] for c in insp.get_columns("complex_price_history")]
    print(f"  컬럼: {cols}")
    src_cols = [c for c in cols if any(k in c.lower() for k in ("source", "src", "origin", "provider"))]
    print(f"  출처 구분 컬럼 후보: {src_cols or '없음 (naver/공공 혼재 저장 → 옵션 C 부적합 확정)'}")

finally:
    db.close()
