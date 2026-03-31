# 세션 로그: 2026-04-01 (세션 6)

## 완료 작업

### 크롤링 진행 상태 버그 수정

**증상**: 단지 상세 페이지 새로고침 시 "갱신 중..." 상태 무한 반복 + 진행률 0% 멈춤

**근본 원인**: `_background_crawl` 완료 시 `articles:{complex_no}` 캐시 삭제 → `start-crawl`이 매번 캐시 미스 → 불필요한 재크롤링

**수정 (live.py + page.tsx)**:
1. BE: 캐시 키를 `crawl_done:{complex_no}`로 분리 — 크롤링 완료 마커 역할 (동적 TTL)
2. BE: `done_partial` 상태를 `_polled_final` 정리 대상에 추가 (메모리 누수 방지)
3. FE: `calcCrawlProgress` articles 단계 최소 3% 보장 (0% → 3%)

### Vercel 재배포

- CI #158 통과 (3m 1s) — 코드 정리 4종 + 크롤 버그 수정 반영
- 브라우저 수동 테스트: 필터 URL 동기화 정상, 크롤링 진행 확인

## 커밋

1. `e1f45b9` fix: 크롤링 진행 상태 버그 수정 — 캐시 키 분리 + 최소 3%

## 검증

- tsc: 0 에러
- lint: 0 warnings
- test: FE 506개 (55파일), BE 280개 — 전체 통과
- ruff: 0 에러
- console.log / TODO: 0건

## 다음 작업

1. Vercel 재배포 (크롤 버그 수정 반영) + 브라우저 수동 테스트 (새로고침 시 "갱신 중..." 안 나오는지)
2. 백엔드 `/api/live/{no}/articles` 레거시 엔드포인트 정리 검토
3. E2E 테스트 보강 (Playwright)
4. useCrawlProgress 폴링 최대 시간 제한 추가 (무한 폴링 방지)
