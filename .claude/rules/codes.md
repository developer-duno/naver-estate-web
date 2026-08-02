# 도메인 코드·상수·저장소

## 핵심 상수

- `M2_TO_PYEONG = 3.3058` (프론트/백엔드 동일)
- `LIVE_TIMEOUT_MS = 120_000` (실시간 크롤링 타임아웃)
- `get_dynamic_ttl()` (live 엔드포인트 시간대별 동적 캐시: 새벽 2시간 / 오전 15분 / 오후 30분 / 저녁 1시간)
- `_PRICE_COLLECT_TTL = 86400` (실거래가 수집 24시간 TTL)
- `PRICE_COLLECT_POLL_MS = 5_000` (실거래가 수집 폴링 간격 5초, 네이버 IP 차단 방지 — spec §네이버 보호 답습)
- `MAX_PRICE_COLLECT_POLLS = 36` (폴링 최대 36회 × 5초 = 3분 타임아웃 유지)

## 크롤 지표 컬럼 (진단 시 의미 구분)

- `complexes.last_crawled_at` — **매물 크롤 시각** 지표. 단지 상세 수집 여부와 무관 (2026-04-13 SQL 일괄 UPDATE 로 허수 다수 — `infra.md` IP 차단 방지 사건 참조).
- `complexes.detail_crawled_at` — **단지 상세 수집** 지표. 단지 상세 진단·backfill 우선순위는 이 컬럼 기준.
- `articles.detail_crawled` — 매물 상세 크롤 완료 여부 (bool).

## 거래유형 코드

| 코드 | 이름     | 설명                   |
| ---- | -------- | ---------------------- |
| A1   | 매매     | 매매 거래              |
| B1   | 전세     | 전세 거래              |
| B2   | 월세     | 월세 (보증금/월세)     |
| B3   | 단기임대 | 단기임대 (보증금/월세) |

> 매핑·집계 SSOT = `.claude/rules/domain-mapping-ssot.md` 룰 1. 표 행 변경 시 양쪽 답습.

## 매물유형 코드

| 코드 | 이름           | 설명            |
| ---- | -------------- | --------------- |
| APT  | 아파트         | 일반 아파트     |
| ABYG | 아파트분양권   | 아파트 분양권   |
| JGC  | 재건축         | 재건축 단지     |
| PRE  | 분양권         | 분양권 (레거시) |
| OPST | 오피스텔       | 오피스텔        |
| OBYG | 오피스텔분양권 | 오피스텔 분양권 |
| RDV  | 재개발         | 재개발 단지     |

## 클라이언트 저장소 (localStorage)

| 키                   | 용도                    | 제한                  |
| -------------------- | ----------------------- | --------------------- |
| `search_history`     | 최근 검색 (키워드/지역) | 최대 10개, 중복 제거  |
| `favorite_complexes` | 즐겨찾기 단지           | 무제한, 토글 방식     |
| `compare_complexes`  | 비교 대상 단지          | 최대 4개              |
| `mb_favorites`       | 미분양 즐겨찾기         | 최대 200개, 토글 방식 |
| `mb_compare`         | 미분양 비교 대상        | 최대 4개              |
| `mb_search_history`  | 미분양 검색 히스토리    | 최대 10개, 중복 제거  |
| `mb_compare_history` | 미분양 비교 히스토리    | 최대 10개, 자동 저장, ids 정렬 중복 제거 |
| `mb_compare_bookmarks` | 미분양 비교 북마크    | 최대 20개, 수동 저장, 이름 지정 가능 |
| `mb_radar_settings`  | 레이더 축 선택+가중치  | 축 13개, 가중치 1-5, 프리셋 3종 |
| `favorite_articles`  | 매물 즐겨찾기           | 무제한, 토글 방식 |
| `article_view_mode`  | 매물 카드 모양 (compact/medium/large) | 값 1개, default = medium |
| `article_page_size`  | 한 페이지당 매물 개수 (10/20/30/50) | 값 1개, default = 10 |
| `mb_view_mode`       | 미분양 탭 보기 방식 (list/map)          | 값 1개, default = list |
| `favorite_price_snapshot` | 즐겨찾기 단지 가격 변동 배지용 마지막 조회가 (complex_no→가격 맵) | 승인 중개사 전용(B2 게이트), 표시용 캐시라 유실돼도 무해 |
| `search_view_mode`   | 매물 검색 결과 보기 방식 (list/map)     | 값 1개, default = list, mb_view_mode 와 물리적으로 분리된 키(탭 간 의도치 않은 결합 방지) |
