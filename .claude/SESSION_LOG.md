# 세션 19 로그 (2026-04-07)

## 커밋 (1개)
1. `460f22d` feat: 매물 상세 모달 전면 리디자인 (확장 레이아웃 + 단지정보 통합)

## 주요 작업
- **매물 상세 모달 리디자인**: max-w-2xl(672px) → max-w-6xl(1152px)
- 2열 그리드 레이아웃: 좌측(지도+가격이력) | 우측(가격+정보+설명)
- 가격 강조(2xl) + 변동 뱃지(↑↓) + 변동일시 표시
- 상태 뱃지: 거래유형, 부동산유형, 검증매물, 분양권
- 단지 상세정보 카드: 건설사, 용적률, 건폐율, 세대당주차, 주변시세, 전세가율, 최근거래
- 가격 변동 이력 테이블 (GET /api/articles/{no}/price-history 프론트 신규 연결)
- Naver Maps 위치 지도 (complex layout에 SDK Script 추가)
- 사진 URL 링크, 메타정보(최초등록/마지막확인)
- formatWon lib/format.ts 이동 (재사용성)
- 하위 컴포넌트 5개 분리: article/PriceHeader, InfoCards, ArticleDescription, PriceHistoryTable, ArticleMap

## 파일 변경
- 수정 7파일: types/index.ts, api/articles.ts, query-keys.ts, format.ts, layout.tsx, page.tsx, ArticleDetail.tsx
- 신규 5파일: article/PriceHeader, InfoCards, ArticleDescription, PriceHistoryTable, ArticleMap

## 테스트: FE 511 + BE 396 + E2E 44 = 전체 통과

## 미완료
- 어린이집 API 운영키 전환
- 공공데이터 전체 단지 자동 수집 (4/12 토 05:00)
- 프론트엔드 추가 UI 개선 (검색 결과, 홈 페이지 등)
