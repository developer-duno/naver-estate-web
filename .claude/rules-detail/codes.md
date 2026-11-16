# codes.md 상세 — 상시 로드 안 함

`.claude/rules/codes.md` 에서 옮긴 표·예시·실측 수치·사건 경위 원문(세션 430, 글자 그대로). 규칙 문장은 핵심 파일에 남아 있고, 옮긴 자리마다 `(상세: … §제목)` 링크가 있다.

## localStorage 키 표

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
| `mb_radar_settings`  | ~~레이더 축 선택+가중치~~ **폐지(세션 472)** | 레이더 삭제로 읽고 쓰는 코드 없음 — 옛 브라우저에 남은 값은 무해 |
| `favorite_articles`  | 매물 즐겨찾기           | 무제한, 토글 방식 |
| `article_view_mode`  | 매물 카드 모양 (compact/medium/large) | 값 1개, default = medium |
| `article_page_size`  | 한 페이지당 매물 개수 (10/20/30/50) | 값 1개, default = 10 |
| `mb_view_mode`       | 미분양 탭 보기 방식 (list/map)          | 값 1개, default = list |
| `favorite_price_snapshot` | 즐겨찾기 단지 가격 변동 배지용 마지막 조회가 (complex_no→가격 맵) | 승인 중개사 전용(B2 게이트), 표시용 캐시라 유실돼도 무해 |
| `search_view_mode`   | 매물 검색 결과 보기 방식 (list/map)     | 값 1개, default = list, mb_view_mode 와 물리적으로 분리된 키(탭 간 의도치 않은 결합 방지) |
| `broker_deals_v1`    | 중개 실무 체크 목록의 거래 묶음(거래 번호·유형·계약일)과 체크 표시 (`lib/broker/deals-storage.ts`, 세션 513) | 중개사용 거래 20개(유형 합 · 세입자·집주인은 유형마다 1개라 합계에서 뺌, 세션 514) · 읽을 때 모양 검사(틀리면 버리고 화면이 한 번 알림) · 체크는 항목 id 로만(이 판이 모르는 유형의 거래·모르는 항목 id 는 읽을 때 화면에서 숨기고 쓸 때 그대로 보존 — 옛 탭이 새 판의 체크를 지우지 않게, 세션 515 · 모르는 거래 보존은 50개까지) · 모양을 바꾸면 `_v2` 새 키 + v1 이관 · 계약 체크 목록(세입자·집주인, `/checklist/<type>`)도 같은 키 · 유형 `jeonse-tenant`·`jeonse-landlord`(세션 514) · 매매 `sale`(중개사용 · 상한에 셈)·`sale-buyer`·`sale-seller`(당사자용 · 세션 516) |
