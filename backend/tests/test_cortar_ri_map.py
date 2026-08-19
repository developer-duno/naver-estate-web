"""읍/면 리(里) 확장 맵 무결성 회귀 테스트 (PR-E2, 세션 373).

`test_cortar_legacy.py` 의 "맵 무결성" 검증 축(형식·건수 하한·자기참조 없음)을
그대로 답습한다. 이 맵은 구조가 다르다(1:1 이 아니라 "읍/면 코드 → 리 코드 목록"
1:N) 이라 검증 항목도 그에 맞게 조정했다.

검증 축:
  1. 맵 무결성 — 키/값 형식, 건수 하한(대량 유실 감지), 리 코드가 2자리 숫자문자열
  2. expand_to_ri_codes() 단위 — 조립 규칙(끝 두 글자 대체), 맵 밖 코드는 빈 리스트
  3. 라이브 검증 샘플 — 세션 373 실증 표본(기장읍·봉담읍)이 여전히 맵에 남아있는지

외부 API 호출 없음 — 생성된 정적 dict 만 검증(이미 생성 스크립트로 만들어진 산출물).
"""

from crawler.cortar_ri_map import RI_CODE_MAP, expand_to_ri_codes

# 실제 생성 결과는 561개 읍/면 · 리 6,627개(세션 373, 2026-08-19). 하한을 살짝
# 낮게 둬서 "대량 유실"만 잡고 원장 갱신에 따른 ±소폭 변동은 허용한다
# (test_cortar_legacy.py 의 _MIN_ENTRIES 답습).
_MIN_EUP_MYEON = 400


# ── 1. 맵 무결성 ──

def test_map_has_enough_entries():
    """대량 유실 감지 — 생성 스크립트가 빈 원장을 받아 맵을 비우는 사고 방지."""
    assert len(RI_CODE_MAP) >= _MIN_EUP_MYEON


def test_all_keys_are_10digit_codes():
    """모든 키는 10자리 숫자 법정동코드."""
    for key in RI_CODE_MAP:
        assert len(key) == 10, f"키 길이가 10이 아니다: {key}"
        assert key.isdigit(), f"키에 숫자 아닌 문자: {key}"


def test_all_values_are_nonempty_ri_code_lists():
    """모든 값은 비어있지 않은 리 코드(두 글자 숫자문자열) 목록."""
    for key, ri_codes in RI_CODE_MAP.items():
        assert ri_codes, f"빈 리 목록이 맵에 들어가면 안 된다: {key}"
        for ri_cd in ri_codes:
            assert len(ri_cd) == 2 and ri_cd.isdigit(), f"리 코드 형식 위반: {key}->{ri_cd}"


def test_no_duplicate_ri_codes_within_same_eup():
    """같은 읍/면 안에서 리 코드가 중복되면 생성 로직 결함(집합 dedupe 실패) 신호."""
    for key, ri_codes in RI_CODE_MAP.items():
        assert len(ri_codes) == len(set(ri_codes)), f"리 코드 중복: {key} -> {ri_codes}"


# ── 2. expand_to_ri_codes() 단위 ──

def test_expand_assembles_full_10digit_codes():
    """읍/면 코드 끝 두 글자("00")를 리 코드로 바꿔 10자리 법정동코드를 조립한다."""
    expanded = expand_to_ri_codes("2671025000")  # 부산 기장군 기장읍
    assert expanded, "기장읍은 맵에 있어야 한다(세션 373 실증 대상)"
    for code in expanded:
        assert len(code) == 10 and code.isdigit()
        assert code[:8] == "26710250", f"접두 8자리가 원본과 달라졌다: {code}"


def test_expand_returns_empty_list_for_unmapped_code():
    """맵에 없는 코드(리 확장 대상 밖)는 빈 리스트 — 호출부가 확장을 건너뛴다."""
    assert expand_to_ri_codes("0000000000") == []
    assert expand_to_ri_codes("1168010600") == []  # 대치동(동 단위, 리 문제 아님)


# ── 3. 라이브 검증 샘플 (세션 373 실증) ──

def test_gijang_eup_matches_live_verified_sample():
    """부산 기장군 기장읍 — 라이브 실증(리 14개, 교리 조회 시 7,992행)."""
    ri_codes = RI_CODE_MAP.get("2671025000")
    assert ri_codes is not None, "기장읍이 맵에서 사라졌다"
    assert len(ri_codes) == 14
    assert "22" in ri_codes, "교리(리 코드 22)가 빠졌다 — 라이브 실증 대상"


def test_bongdam_eup_matches_live_verified_sample():
    """경기 화성시 효행구 봉담읍 — 2026개편+리 이중함정, 라이브 실증(리 16개)."""
    ri_codes = RI_CODE_MAP.get("4159325000")
    assert ri_codes is not None, "봉담읍이 맵에서 사라졌다"
    assert len(ri_codes) == 16
