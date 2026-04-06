"""live 라우터 테스트 — 실시간 검색, 지역 검색, 멀티타입 검색 로직
실행: python -m pytest tests/test_live_router.py -v
"""
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from routers.live import CRAWL_REAL_ESTATE_TYPES, MAX_SEARCH_PAGES, _parse_allowed_types, _search_all_types

# ── 팩토리 함수 ──

def make_complex_data(complex_no="C001", name="래미안", re_type="APT", **kw):
    """네이버 API 검색 응답의 단지 데이터 팩토리"""
    base = {
        "complexNo": complex_no,
        "complexName": name,
        "realEstateTypeCode": re_type,
        "cortarAddress": "서울시 강남구 역삼동",
        "latitude": "37.5",
        "longitude": "127.0",
    }
    base.update(kw)
    return base


def make_search_result(complexes=None, is_more=False, error=None):
    """네이버 API search_by_keyword 응답 팩토리"""
    if error:
        return {"error": error}
    return {
        "complexes": complexes or [],
        "isMoreData": is_more,
    }


# ── _parse_allowed_types 단위 테스트 ──

class TestParseAllowedTypes:
    """types 쿼리 파라미터 파싱 검증"""

    def test_none_returns_all(self):
        """None 입력 → 전체 7개 유형 반환"""
        result = _parse_allowed_types(None)
        assert result == CRAWL_REAL_ESTATE_TYPES

    def test_empty_string_returns_all(self):
        """빈 문자열 → 전체 유형 반환"""
        result = _parse_allowed_types("")
        assert result == CRAWL_REAL_ESTATE_TYPES

    def test_valid_filter(self):
        """유효한 코드만 필터링"""
        result = _parse_allowed_types("APT,OPST")
        assert result == {"APT", "OPST"}

    def test_invalid_codes_ignored(self):
        """잘못된 코드는 무시, 유효한 것만 반환"""
        result = _parse_allowed_types("APT,INVALID,XYZ")
        assert result == {"APT"}

    def test_whitespace_handling(self):
        """공백 포함 파라미터 정상 파싱"""
        result = _parse_allowed_types(" APT , OPST ")
        assert result == {"APT", "OPST"}


# ── live_search 엔드포인트 테스트 ──

SEARCH_PATCH = "routers.live.search.NaverEstateAPI.search_by_keyword"


class TestLiveSearch:
    """실시간 키워드 검색 엔드포인트 검증"""

    @patch(SEARCH_PATCH)
    def test_search_success(self, mock_search, client, db):
        """정상 검색 → 200 + complexes 배열 반환"""
        mock_search.return_value = make_search_result([
            make_complex_data("C001", "래미안"),
        ])
        res = client.get("/api/live/search?q=래미안")
        assert res.status_code == 200
        data = res.json()
        assert len(data["complexes"]) >= 1
        assert data["total"] >= 1

    @patch(SEARCH_PATCH)
    def test_search_naver_error_502(self, mock_search, client, db):
        """네이버 API 에러 → 502 반환"""
        mock_search.return_value = make_search_result(error="서버 오류")
        res = client.get("/api/live/search?q=테스트")
        assert res.status_code == 502

    @patch(SEARCH_PATCH)
    def test_search_types_filter(self, mock_search, client, db):
        """types=OPST → '오피스텔' suffix 그룹만 검색"""
        mock_search.return_value = make_search_result([
            make_complex_data("C010", "오피스텔A", re_type="OPST"),
        ])
        res = client.get("/api/live/search?q=대전&types=OPST")
        assert res.status_code == 200

        # '오피스텔' suffix 검색이 호출되었는지 확인
        called_keywords = [call.args[0] for call in mock_search.call_args_list]
        assert any("오피스텔" in kw for kw in called_keywords)
        # 기본(아파트) 그룹은 호출되지 않아야 함
        assert not any(kw == "대전" for kw in called_keywords)

    @patch(SEARCH_PATCH)
    def test_search_cache_hit(self, mock_search, client, db):
        """동일 요청 시 캐시 반환 — NaverEstateAPI 재호출 안 함"""
        mock_search.return_value = make_search_result([
            make_complex_data("C001", "래미안"),
        ])
        # 첫 번째 요청
        res1 = client.get("/api/live/search?q=캐시테스트")
        assert res1.status_code == 200
        call_count_after_first = mock_search.call_count

        # 두 번째 요청 — 캐시에서 반환
        res2 = client.get("/api/live/search?q=캐시테스트")
        assert res2.status_code == 200
        assert mock_search.call_count == call_count_after_first  # 추가 호출 없음

    def test_search_empty_keyword_422(self, client):
        """빈 키워드 → 422 (min_length=1 검증)"""
        res = client.get("/api/live/search?q=")
        assert res.status_code == 422


# ── live_region 엔드포인트 테스트 ──

class TestLiveRegion:
    """실시간 지역 검색 엔드포인트 검증"""

    @patch(SEARCH_PATCH)
    def test_region_success(self, mock_search, client, db):
        """시도+시군구 검색 성공"""
        mock_search.return_value = make_search_result([
            make_complex_data("C002", "힐스테이트"),
        ])
        res = client.get("/api/live/region?sido=서울&sigungu=강남구")
        assert res.status_code == 200
        data = res.json()
        assert data["total"] >= 1

    @patch(SEARCH_PATCH)
    def test_region_keyword_with_dong(self, mock_search, client, db):
        """dong 포함 시 키워드 조합 확인"""
        mock_search.return_value = make_search_result([
            make_complex_data("C003", "래미안"),
        ])
        client.get("/api/live/region?sido=서울&sigungu=강남구&dong=역삼동")

        # 키워드에 dong이 포함되었는지 확인
        called_keywords = [call.args[0] for call in mock_search.call_args_list]
        assert any("역삼동" in kw for kw in called_keywords)


# ── _search_all_types 통합 테스트 ──

class TestSearchAllTypes:
    """멀티타입 검색 로직 검증"""

    @patch(SEARCH_PATCH)
    def test_multi_group_dedup(self, mock_search, db):
        """여러 그룹에서 같은 단지 → seen set으로 중복 제거"""
        # 기본 그룹과 재건축 그룹 모두에서 JGC 단지 반환
        mock_search.return_value = make_search_result([
            make_complex_data("C100", "재건축단지", re_type="JGC"),
        ])

        allowed = {"APT", "ABYG", "JGC", "PRE"}
        result = _search_all_types("테스트", allowed, db)

        # 중복 제거되어 1건만 반환
        complex_nos = [c["complex_no"] for c in result]
        assert complex_nos.count("C100") == 1

    @patch(SEARCH_PATCH)
    def test_empty_type_code_filtered(self, mock_search, db):
        """realEstateTypeCode="" → 필터링됨 (빈 문자열 제외)"""
        mock_search.return_value = make_search_result([
            make_complex_data("C200", "유형없음", re_type=""),
            make_complex_data("C201", "아파트", re_type="APT"),
        ])

        allowed = {"APT"}
        result = _search_all_types("테스트", allowed, db)

        # 빈 타입코드는 필터링, APT만 통과
        complex_nos = [c["complex_no"] for c in result]
        assert "C200" not in complex_nos
        assert "C201" in complex_nos

    @patch(SEARCH_PATCH)
    def test_max_page_limit(self, mock_search, db):
        """MAX_SEARCH_PAGES 초과 시 페이지네이션 중단"""
        # 항상 isMoreData=True 반환 → 무한 루프 시도
        mock_search.return_value = make_search_result(
            [make_complex_data("C300", "무한단지", re_type="APT")],
            is_more=True,
        )

        allowed = {"APT"}
        _search_all_types("테스트", allowed, db)

        # MAX_SEARCH_PAGES만큼만 호출되어야 함
        assert mock_search.call_count <= MAX_SEARCH_PAGES

    @patch(SEARCH_PATCH)
    def test_sqlite_sequential_search(self, mock_search, db):
        """SQLite 환경: 순차 실행 동작 확인"""
        assert db.bind.dialect.name == "sqlite"
        mock_search.return_value = make_search_result([
            make_complex_data("C400", "테스트아파트", re_type="APT"),
        ])
        result = _search_all_types("테스트", {"APT", "OPST"}, db)
        assert len(result) >= 1
        # 기본+오피스텔 2그룹 이상 호출
        assert mock_search.call_count >= 2

    @patch(SEARCH_PATCH)
    def test_sqlite_sequential_dedup(self, mock_search, db):
        """SQLite 순차 처리에서도 중복 제거 동작"""
        mock_search.return_value = make_search_result([
            make_complex_data("C500", "중복단지", re_type="JGC"),
        ])
        result = _search_all_types("테스트", {"APT", "JGC"}, db)
        nos = [c["complex_no"] for c in result]
        assert nos.count("C500") == 1

    @patch(SEARCH_PATCH)
    def test_sqlite_sequential_all_fail_502(self, mock_search, db):
        """SQLite 순차 모드에서 모든 그룹 실패 → 502"""
        mock_search.return_value = make_search_result(error="네이버 서버 오류")
        with pytest.raises(HTTPException) as exc_info:
            _search_all_types("테스트", {"APT", "OPST"}, db)
        assert exc_info.value.status_code == 502
