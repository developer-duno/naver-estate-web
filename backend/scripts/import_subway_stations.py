"""전국 도시철도 역사 CSV 적재 스크립트 (V047 subway_stations)

원천 = 국가철도공단 레일포털 표준데이터. 상세·정규화 규칙은 data/subway/README.md 참조.

전량 DELETE 후 INSERT 한다 — 원본이 연 1회 갱신이라 증분 upsert 를 유지할 이유가 없고,
역 폐지·노선 개명이 섞인 갱신에서 "사라진 행"을 남기지 않는 편이 안전하다(1,099행이라
전량 재적재 비용도 무시할 수준).

사용법:
    cd backend
    python -m scripts.import_subway_stations                       # data/subway/ 최신 CSV
    python -m scripts.import_subway_stations data/subway/xxx.csv   # 파일 명시
"""

import csv
import os
import re
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv

load_dotenv()

from db.database import SessionLocal
from db.models import SubwayStation

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "subway")
EXPECTED_ROWS = 1099  # 2026-06-30 기준. 갱신 파일이면 달라질 수 있다(경고만).


def _clean(value: str | None) -> str:
    """앞뒤 공백 제거 + 연속 공백 1칸 축약.

    원본에 `수도권  도시철도 9호선` 처럼 공백이 둘 박힌 노선명이 있는데, 이 값이
    그대로 화면의 노선 배지로 나간다.
    """
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value).strip())


def _parse_date(value: str | None) -> date | None:
    """`YYYY-MM-DD` / `YYYYMMDD` → date. 파싱 불가하면 None.

    원본에 빈칸·`1900-01-00`(존재하지 않는 날짜)이 섞여 있어 관대하게 처리한다 —
    이 컬럼은 표시에 쓰이지 않는 출처 메타데이터라 결측이 조회를 막으면 안 된다.
    """
    text = str(value).strip() if value is not None else ""
    match = re.fullmatch(r"(\d{4})-?(\d{2})-?(\d{2})", text)
    if not match:
        return None
    try:
        return date(*(int(part) for part in match.groups()))
    except ValueError:
        return None


def parse_row(row: dict) -> dict | None:
    """CSV 1행 → SubwayStation 생성자 인자. 필수값이 없으면 None(스킵).

    순수 함수 — DB 없이 단위 테스트로 정규화를 검증할 수 있게 분리했다.
    """
    name = _clean(row.get("station_name"))
    line = _clean(row.get("line_name"))
    if not name or not line:
        return None
    try:
        latitude = float(row["latitude"])
        longitude = float(row["longitude"])
    except (KeyError, TypeError, ValueError):
        return None
    return {
        "station_number": _clean(row.get("station_number")) or None,
        "station_name": name,
        "line_number": _clean(row.get("line_number")) or None,
        "line_name": line,
        "operator": _clean(row.get("operator")) or None,
        "latitude": latitude,
        "longitude": longitude,
        "data_date": _parse_date(row.get("data_date")),
    }


def _latest_csv() -> str:
    candidates = sorted(f for f in os.listdir(DATA_DIR) if f.endswith(".csv"))
    if not candidates:
        raise SystemExit(f"CSV 를 찾을 수 없습니다: {DATA_DIR}")
    return os.path.join(DATA_DIR, candidates[-1])


def main() -> None:
    csv_path = sys.argv[1] if len(sys.argv) > 1 else _latest_csv()
    print(f"적재 대상: {csv_path}")

    with open(csv_path, encoding="utf-8", newline="") as f:
        parsed = [parse_row(row) for row in csv.DictReader(f)]
    records = [row for row in parsed if row is not None]
    skipped = len(parsed) - len(records)
    if skipped:
        print(f"⚠ 필수값 누락으로 스킵한 행: {skipped}")
    if not records:
        raise SystemExit("적재할 행이 없습니다 — CSV 형식을 확인하세요.")

    db = SessionLocal()
    try:
        deleted = db.query(SubwayStation).delete()
        db.bulk_insert_mappings(SubwayStation, records)
        db.commit()
        total = db.query(SubwayStation).count()
    finally:
        db.close()

    print(f"삭제 {deleted}행 → 적재 {len(records)}행 (테이블 총 {total}행)")
    if total != EXPECTED_ROWS:
        print(f"⚠ 기대 행수({EXPECTED_ROWS})와 다릅니다 — 갱신된 원본이면 정상입니다.")


if __name__ == "__main__":
    main()
