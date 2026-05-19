"""B1(전세) 시세 오염 데이터 정리 + 재수집 스크립트 (일회성).

옛 크롤러가 매매(A1) 값을 B1로 잘못 저장한 행을 삭제하고, 해당 단지의
B1 시세를 네이버 API로 재수집한다.

사용법:
  cd backend && python -m scripts.cleanup_b1_price_contamination          # dry-run (카운트만)
  cd backend && python -m scripts.cleanup_b1_price_contamination --apply  # 실삭제 + 재수집

--apply는 약 10시간 소요. 중단 시 동일 명령 재실행하면 체크포인트에서 이어받는다.
배경 상세: ~/.claude/plans/claude-cosmic-minsky.md
"""

import argparse
import json
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

from crawler.service_price import (
    contaminated_complex_nos,
    find_contaminated_b1_ids,
    recollect_b1_price_for_complex,
)
from db.database import SessionLocal
from db.models import ComplexPriceHistory

logger = logging.getLogger("cleanup_b1")

_CHECKPOINT_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "data", "b1_cleanup_checkpoint.json"
)
_DELETE_CHUNK = 5000
_RECOLLECT_SAVE_EVERY = 20


def _load_checkpoint() -> dict:
    if os.path.exists(_CHECKPOINT_PATH):
        with open(_CHECKPOINT_PATH, encoding="utf-8") as f:
            return json.load(f)
    return {"deleted": False, "complexes": [], "done_complex_nos": []}


def _save_checkpoint(ckpt: dict) -> None:
    os.makedirs(os.path.dirname(_CHECKPOINT_PATH), exist_ok=True)
    with open(_CHECKPOINT_PATH, "w", encoding="utf-8") as f:
        json.dump(ckpt, f)


def dry_run(db) -> None:
    """삭제 대상 카운트만 출력 (실변경 없음)."""
    base_only = find_contaminated_b1_ids(db, before=None)         # 기준1만
    full = find_contaminated_b1_ids(db)                            # 기준1 + 기준2
    total_b1 = db.query(ComplexPriceHistory).filter(
        ComplexPriceHistory.trade_type == "B1"
    ).count()
    print("=== B1 오염 데이터 진단 (dry-run) ===")
    print(f"  기준1 (A1 동일형)      : {len(base_only):,}행")
    print(f"  기준2 (A1 짝 없음형)   : {len(full) - len(base_only):,}행")
    print(f"  합산 삭제 대상         : {len(full):,}행")
    print(f"  전체 B1 행             : {total_b1:,}행 → 삭제 후 잔존 {total_b1 - len(full):,}행")


def delete_contaminated(db, ids: list[int]) -> None:
    """오염 B1 행 삭제 (5000개씩 배치 commit)."""
    for start in range(0, len(ids), _DELETE_CHUNK):
        chunk = ids[start : start + _DELETE_CHUNK]
        db.query(ComplexPriceHistory).filter(
            ComplexPriceHistory.id.in_(chunk)
        ).delete(synchronize_session=False)
        db.commit()
        logger.info("삭제 진행: %d/%d", min(start + _DELETE_CHUNK, len(ids)), len(ids))


def recollect(complexes: list[str], ckpt: dict) -> None:
    """단지별 B1 시세 재수집 — 단지마다 새 세션, 체크포인트 이어받기."""
    done = set(ckpt["done_complex_nos"])
    pending = [c for c in complexes if c not in done]
    logger.info("재수집 대상: %d단지 (완료 %d, 남음 %d)", len(complexes), len(done), len(pending))

    for i, complex_no in enumerate(pending, 1):
        db = SessionLocal()
        try:
            result = recollect_b1_price_for_complex(db, complex_no)
            logger.info("[%d/%d] %s → %s", i, len(pending), complex_no, result)
        except Exception:
            logger.exception("재수집 실패: %s", complex_no)
        finally:
            db.close()

        ckpt["done_complex_nos"].append(complex_no)
        if i % _RECOLLECT_SAVE_EVERY == 0:
            _save_checkpoint(ckpt)
    _save_checkpoint(ckpt)
    logger.info("재수집 완료")


def main() -> None:
    parser = argparse.ArgumentParser(description="B1 시세 오염 정리 + 재수집")
    parser.add_argument("--apply", action="store_true", help="실삭제 + 재수집 (미지정 시 dry-run)")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        dry_run(db)
        if not args.apply:
            print("\n--apply 없이 실행 — 변경 없음. 카운트가 예상과 맞으면 --apply 로 재실행.")
            return

        ckpt = _load_checkpoint()
        # 삭제 전에 재수집 대상 단지 목록을 확보 (삭제 후엔 식별 불가)
        if not ckpt["complexes"]:
            ckpt["complexes"] = contaminated_complex_nos(db)
            _save_checkpoint(ckpt)
        logger.info("재수집 대상 단지 %d개 확보", len(ckpt["complexes"]))

        # 삭제 (체크포인트 가드 — 중복 삭제 방지)
        if not ckpt["deleted"]:
            ids = find_contaminated_b1_ids(db)
            logger.info("오염 B1 행 %d개 삭제 시작", len(ids))
            delete_contaminated(db, ids)
            ckpt["deleted"] = True
            _save_checkpoint(ckpt)
        else:
            logger.info("삭제는 이미 완료됨 (체크포인트) — 재수집만 이어감")
    finally:
        db.close()

    # 재수집
    recollect(ckpt["complexes"], ckpt)
    print("=== 완료 — dry-run 재실행으로 오염 0건 확인 후 체크포인트 파일 삭제 ===")


if __name__ == "__main__":
    main()
