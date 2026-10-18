"""한국부동산원 R-ONE 클라이언트 시험 (세션 473) — 가장 낮은 경계(get)만 가짜로. 네트워크 0.

응답 모양은 2026-10-18 실제 호출 원문을 옮겼다(정상 = SttsApiTblData head/row · 오류·결과 없음 = 최상위 RESULT 만).
"""

import pytest

from crawler import rone_api
from crawler.rone_api import RoneApiError, RoneKeyMissing, fetch_table


def _row(i: int) -> dict:
    return {
        "STATBL_ID": "A_2024_00073", "DTACYCLE_CD": "MM", "WRTTIME_IDTFR_ID": "202601",
        "CLS_ID": 530045 + i, "CLS_NM": "만안구", "CLS_FULLNM": "경기>경부1권>안양시>만안구",
        "ITM_NM": "매매가격 대비 전세가격", "DTA_VAL": 65.0366748166259, "UI_NM": "%",
    }


def _page(total: int, rows: list[dict]) -> dict:
    return {"SttsApiTblData": [
        {"head": [{"list_total_count": total},
                  {"RESULT": {"CODE": "INFO-000", "MESSAGE": "정상 처리되었습니다."}}]},
        {"row": rows},
    ]}


class _FakeGet:
    def __init__(self, pages):
        self.pages = list(pages)
        self.calls: list[dict] = []

    def __call__(self, url, params):
        self.calls.append(dict(params))
        return self.pages.pop(0)


def test_normal_single_page():
    get = _FakeGet([_page(3, [_row(i) for i in range(3)])])
    rows = fetch_table("A_2024_00073", "202608", "202609", key="k", get=get, sleep=lambda s: None)
    assert len(rows) == 3
    assert rows[0]["CLS_FULLNM"] == "경기>경부1권>안양시>만안구"
    p = get.calls[0]
    assert p["KEY"] == "k" and p["Type"] == "json" and p["pIndex"] == 1 and p["pSize"] == 1000
    assert p["STATBL_ID"] == "A_2024_00073" and p["DTACYCLE_CD"] == "MM"
    assert (p["START_WRTTIME"], p["END_WRTTIME"]) == ("202608", "202609")


def test_multi_page_sleeps_between_calls(monkeypatch):
    monkeypatch.setattr(rone_api, "PAGE_SIZE", 2)
    slept: list[float] = []
    get = _FakeGet([_page(3, [_row(0), _row(1)]), _page(3, [_row(2)])])
    rows = fetch_table("A", "202601", "202602", key="k", get=get, sleep=slept.append)
    assert len(rows) == 3
    assert [c["pIndex"] for c in get.calls] == [1, 2]
    assert slept == [1.0]


def test_bad_key_raises_with_number_only():
    get = _FakeGet([{"RESULT": {"CODE": "ERROR-290", "MESSAGE": "인증키가 유효하지 않습니다. 인증키가 없는 경우…"}}])
    with pytest.raises(RoneApiError) as ei:
        fetch_table("A", "202601", "202602", key="bad", get=get)
    assert str(ei.value) == "부동산원 인증키가 맞지 않아요(사유 번호 290)"
    assert ei.value.code == "ERROR-290"


def test_other_error_code_raises():
    get = _FakeGet([{"RESULT": {"CODE": "ERROR-999", "MESSAGE": "시험용 가짜 오류"}}])
    with pytest.raises(RoneApiError, match="사유 번호 999"):
        fetch_table("A", "202601", "202602", key="k", get=get)


def test_no_data_is_empty_list():
    """INFO-200(해당하는 데이터가 없습니다 — 2026-10-18 실측) → 빈 목록(판정은 적재 서비스가)."""
    get = _FakeGet([{"RESULT": {"CODE": "INFO-200", "MESSAGE": "해당하는 데이터가 없습니다."}}])
    assert fetch_table("A", "209901", "209912", key="k", get=get) == []


def test_sample_mode_five_rows_raises():
    """열쇠가 적용되지 않으면 쪽 크기를 무시하고 5건만 온다 → 예외(5건만 저장하고 끝내지 않는다)."""
    get = _FakeGet([_page(2087, [_row(i) for i in range(5)])])
    with pytest.raises(RoneApiError, match="1000건 중 5건만"):
        fetch_table("A", "202601", "202602", key="k", get=get)


def test_missing_key_raises_before_calling(monkeypatch):
    monkeypatch.delenv("RONE_API_KEY", raising=False)
    get = _FakeGet([])
    with pytest.raises(RoneKeyMissing, match="부동산원 인증키가 없어요"):
        fetch_table("A", "202601", "202602", get=get)
    assert get.calls == []


def test_error_messages_have_no_latin_letters():
    """우리말 문구에 영문이 없어야 plain_words 원문 유지 규칙이 그대로 싣는다."""
    from crawler.plain_words import explain_error

    for msg in ("부동산원 인증키가 맞지 않아요(사유 번호 290)", str(RoneKeyMissing()),
                "받은 행은 12개인데 지역 짝이 하나도 안 맞아요"):
        assert explain_error(msg) == msg
