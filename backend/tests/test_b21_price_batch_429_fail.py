"""B21 회귀 테스트 — 주간 시세 배치가 429 로 단지를 대량 못 받으면 실패로 끝나는가

error-propagation.md 5번: 429 재시도 소진은 "자료 없음"이 아니다. 옛 코드는 429 단지를 건너뛰기만 하고
회차를 늘 completed 로 끝내, 네이버가 막은 날에도 관리자 화면·알림에 아무 일 없는 것처럼 보였다.

이 파일이 확인하는 것:
  (가) 429 단지가 연속 5개면 루프를 멈추고 failed — 남은 단지는 부르지 않고, 그 전 성공분은 체크포인트에
  (나) 429 가 섞였지만 성공 단지가 같거나 많으면 completed (지금과 같게, 체크포인트 삭제)
  (다) 연속 5개는 안 되지만 429 단지가 성공보다 많으면 failed
  (라) 429 연속 4개 뒤 성공 1개가 끼면 연속 수가 0 으로 돌아간다
  (마) 429 가 아닌 오류(자료 없음 등)만 많으면 completed — 실패로 세지 않는다
  (바) 자료 없음 단지는 429 연속을 끊지 않는다(판단 ②)
  (사) 예외를 내는 단지는 429 로 세지 않는다(판단 ①)
  (아) 이전 실패 회차에서 이어받은 완료분이 이번 실패 체크포인트에도 남는다
  (자) 우리 문구 뒤에 영문이 붙으면 원문 통과 규칙이 넓어지지 않고 막힌다
  (차) 체크포인트 저장이 실패해도 잡은 failed·429 사유 그대로
  + 실패 문구가 텔레그램(explain_error)·관리자 화면(explain_stored_error) 에 원문 그대로 보이는가

네이버 호출 0 — NaverEstateAPI.get_complex_prices 만 가짜, throttle 은 MagicMock(대기 없음), DB 는 시험 SQLite.
"""

from datetime import timedelta
from unittest.mock import MagicMock, patch

import pytest

from crawler.utils import CheckpointManager
from db.models import Complex, CrawlerCheckpoint, CrawlJob
from services.enricher import RATE_LIMIT_EXHAUSTED_ERROR
from utils import utcnow

# ── 팩토리 함수 ──

OK = "ok"            # A1·B1 모두 정상
RL = "429"           # A1·B1 모두 429 소진
HALF = "half"        # A1 429 소진 · B1 정상 → 성공 단지
OTHER = "other"      # A1·B1 모두 다른 오류(자료 없음 류)
EXC = "exc"          # A1·B1 호출이 예외를 던짐


def _response(kind: str, trade_type: str) -> dict:
    """단지 종류·거래유형별 가짜 응답"""
    if kind == RL or (kind == HALF and trade_type == "A1"):
        return {"error": RATE_LIMIT_EXHAUSTED_ERROR}
    if kind == OTHER:
        return {"error": "API 요청 실패: 상태 코드 404"}
    return {"marketPrices": []}


def _add_complexes(db, kinds: list[str]) -> list[str]:
    """kinds 순서대로 단지를 만든다 — last_crawled_at 내림차순이 곧 처리 순서가 되게 시각을 줄여 간다"""
    base = utcnow()
    nos = []
    for i, _ in enumerate(kinds):
        no = f"b21c{i:02d}"
        db.add(Complex(complex_no=no, complex_name=f"B21단지{i}", last_crawled_at=base - timedelta(minutes=i)))
        nos.append(no)
    db.commit()
    return nos


def _run(db, kinds: list[str], before=None):
    """배치를 한 번 돌리고 (새 잡, 호출된 단지 번호 목록, 단지 번호 목록) 를 돌려준다.

    before(db, nos): 단지를 만든 뒤 배치를 돌리기 전에 부를 준비 함수(이전 회차 흉내 등).
    """
    nos = _add_complexes(db, kinds)
    kind_of = dict(zip(nos, kinds))
    seen: list[str] = []
    if before:
        before(db, nos)

    def _fake(no, trade_type=None, **kwargs):
        seen.append(no)
        if kind_of[no] == EXC:
            raise RuntimeError("가짜 네트워크 오류")
        return _response(kind_of[no], trade_type)

    throttle = MagicMock()
    with (
        patch("crawler.service_price._throttle", throttle),
        patch("crawler.service_price.NaverEstateAPI.get_complex_prices", side_effect=_fake),
    ):
        from crawler.service_price import collect_price_history
        collect_price_history(batch_size=50, scheduler_job_id="collect_prices")

    db.expire_all()
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "price_history").order_by(CrawlJob.id.desc()).first()
    return job, seen, nos


def _checkpoint_done(db, job_id: int) -> list[str] | None:
    cp = db.get(CrawlerCheckpoint, job_id)
    return None if cp is None else cp.state_json["done_complex_nos"]


# ── (가) 연속 5개 429 → 중단·failed ──


def test_가_연속_5개_429면_멈추고_failed(db):
    """C0 성공 → C1~C5 429(연속 5) → 중단. C6·C7 은 부르지 않는다"""
    job, seen, nos = _run(db, [OK, RL, RL, RL, RL, RL, OK, OK])

    assert job.status == "failed"
    assert len(seen) == 12, "남은 단지 2개(호출 4번)를 부르지 않았어야 한다"
    assert nos[6] not in seen and nos[7] not in seen
    assert job.processed_items == 1
    assert job.total_items == 8
    assert "8개 단지 중 1개만 받고 멈췄어요" in job.error_message
    assert "연속 5개 단지 거절" in job.error_message
    assert _checkpoint_done(db, job.id) == [nos[0]], "그 전 성공분이 체크포인트에 남아야 한다"


# ── (나) 429 가 섞였지만 성공이 같거나 많음 → completed ──


@pytest.mark.parametrize(
    "kinds",
    [
        [OK, RL, OK, HALF, OK, RL],   # 성공 4(HALF 포함) > 429 2
        [OK, RL, OK, RL, HALF, RL],   # 성공 3 == 429 3 (경계 — "많으면" 만 실패)
    ],
    ids=["성공이_더_많음", "같음_경계"],
)
def test_나_성공이_같거나_많으면_completed(db, kinds):
    job, seen, _ = _run(db, kinds)

    assert job.status == "completed"
    assert job.error_message is None
    assert len(seen) == len(kinds) * 2
    assert _checkpoint_done(db, job.id) is None, "완료 회차는 체크포인트를 지운다(지금과 같게)"


# ── (다) 연속 5개 미만이지만 429 가 더 많음 → failed ──


def test_다_429가_더_많으면_끝까지_돌고_failed(db):
    kinds = [RL, RL, OK, RL, RL, OK, RL]      # 429 5 · 성공 2 · 최장 연속 2
    job, seen, nos = _run(db, kinds)

    assert job.status == "failed"
    assert len(seen) == len(kinds) * 2, "연속 5 미만이면 끝까지 돈다"
    assert job.processed_items == 2
    assert "7개 단지 중 5개를 못 받았어요" in job.error_message
    assert "받은 단지 2개보다 많아요" in job.error_message
    assert "중단" not in job.error_message
    assert sorted(_checkpoint_done(db, job.id)) == [nos[2], nos[5]]


# ── (라) 연속 4개 뒤 성공 1개 → 연속 수 초기화 ──


def test_라_성공_단지가_끼면_연속_수가_0으로(db):
    """429×4 → 성공 → 429×4 → 성공×8. 초기화가 없으면 6번째 단지에서 연속 5로 멈춘다"""
    kinds = [RL] * 4 + [OK] + [RL] * 4 + [OK] * 8
    job, seen, _ = _run(db, kinds)

    assert job.status == "completed"
    assert len(seen) == len(kinds) * 2


# ── (마) 429 아닌 오류만 많음 → completed ──


def test_마_다른_오류는_실패로_세지_않는다(db):
    kinds = [OTHER] * 7
    job, seen, _ = _run(db, kinds)

    assert job.status == "completed"
    assert job.processed_items == 0
    assert job.error_message is None
    assert len(seen) == len(kinds) * 2


# ── 실패 문구가 알림·화면에 원문 그대로 ──


@pytest.mark.parametrize("aborted", [True, False], ids=["중단", "끝까지"])
def test_실패_문구가_알림과_화면에_그대로_보인다(aborted):
    from crawler.plain_words import UNKNOWN_ERROR_WORDS, explain_error, explain_stored_error
    from crawler.service_price import _rate_limited_words

    words = _rate_limited_words(150, 60, 40, aborted)
    assert explain_error(words) == words
    assert explain_error(words) != UNKNOWN_ERROR_WORDS
    assert explain_stored_error(words) == words


# ── (바) 자료 없음 단지는 429 연속을 끊지 않는다 ──


def test_바_자료없음_단지는_연속을_끊지_않는다(db):
    """429×2 → 자료없음 → 429×3 : 자료없음이 끼어도 연속은 5로 이어져 6번째 단지에서 멈춘다"""
    job, seen, nos = _run(db, [RL, RL, OTHER, RL, RL, RL, OK])

    assert job.status == "failed"
    assert nos[6] not in seen, "마지막 단지는 부르지 않았어야 한다"
    assert len(seen) == 12
    assert "7개 단지 중 하나도 못 받고 멈췄어요" in job.error_message


# ── (사) 예외를 내는 단지는 429 로 세지 않는다 ──


def test_사_예외_단지는_429로_세지_않는다(db):
    """429×4 → 예외 → 성공×4 : 예외를 429 로 세면 5번째에서 멈추지만, 세지 않으면 끝까지 돌고 completed"""
    kinds = [RL, RL, RL, RL, EXC, OK, OK, OK, OK]
    job, seen, nos = _run(db, kinds)

    assert job.status == "completed"
    assert len(seen) == len(kinds) * 2, "중단 없이 끝까지 불렀어야 한다"
    assert job.processed_items == 4
    assert job.error_message is None


# ── (아) 이어받은 완료분이 실패 체크포인트에도 남는다 ──


def test_아_이어받은_완료분이_실패_체크포인트에_남는다(db):
    """이전 실패 회차가 C0 을 받아 뒀다 → 이번 회차(C0 제외)가 429 연속으로 멈춰도 C0 은 완료 집합에 남는다"""

    def _prev_failed_run(db, nos):
        prev = CrawlJob(job_type="price_history", status="failed", started_at=utcnow() - timedelta(hours=1))
        db.add(prev)
        db.commit()
        CheckpointManager.save(db, prev.id, {"done_complex_nos": [nos[0]], "total": 6})

    job, seen, nos = _run(db, [OK, RL, RL, RL, RL, RL, OK], before=_prev_failed_run)

    assert job.status == "failed"
    assert nos[0] not in seen, "이미 받은 단지는 다시 부르지 않는다"
    assert _checkpoint_done(db, job.id) == [nos[0]], "이어받은 완료분을 실패 체크포인트가 버리면 안 된다"


# ── (자) 문구 규칙이 영문이 섞인 문장까지 넓어지지 않는다 ──


def test_자_영문이_붙으면_원문_통과_규칙이_막는다():
    from crawler.plain_words import explain_error
    from crawler.service_price import _rate_limited_words

    words = _rate_limited_words(8, 5, 1, True)
    mixed = words + " | stale running — swept by monitor"
    assert explain_error(mixed) != mixed, "영문·| 가 섞인 문장은 원문 그대로 통과하면 안 된다"


# ── (차) 체크포인트 저장이 실패해도 잡은 failed·429 사유 그대로 ──


def test_차_체크포인트_저장이_실패해도_429_사유가_남는다(db):
    """429 3 > 성공 1 (연속 3, 중단 없음, 중간 저장 시점 5 미만) → 실패 경로의 저장만 예외를 낸다"""
    from crawler.service_price import _rate_limited_words

    with patch("crawler.service_price._checkpoint.save", side_effect=RuntimeError("체크포인트 boom")):
        job, _, _ = _run(db, [RL, RL, RL, OK])

    assert job.status == "failed"
    assert job.error_message == _rate_limited_words(4, 3, 1, False)
    assert "boom" not in job.error_message
    assert job.processed_items == 1 and job.total_items == 4
