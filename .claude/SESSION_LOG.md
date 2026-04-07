# 세션 20 로그 (2026-04-07)

## 커밋 (1개)
1. `adf3f6a` feat: 매물 상세 모달 중개 업무 정보 강화 (시세/경쟁/관리비 카드)

## 주요 작업
- **매물 상세 사진 섹션 제거**: ArticleDescription에서 사진 링크 섹션 삭제
- **특징/상세설명 중복 제거**: article_feature_desc === detail_description 시 하나만 표시
- **InfoCard/InfoRow export**: 하위 컴포넌트에서 공통 재사용 가능하도록 named export
- **MarketPosition 카드 신규**: 해당 면적(5m² 버킷)의 거래유형별 평균가·매물 수 표시
- **CompetingListings 카드 신규**: 같은 단지·거래유형 경쟁 매물 수, 가격 범위, 평균 평당가
- **MaintenanceCost 카드 신규**: 현재 면적의 평균/여름/겨울/최근 관리비

## 설계 결정
- 신규 백엔드 API 0개 — 기존 getPriceStats, getArticles, getPyeongDetails 100% 재사용
- React Query 캐시 공유 — 단지 상세 페이지 방문 후면 추가 API 호출 없음
- 각 카드 컴포넌트에서 독립 useQuery + enabled 조건 + null 반환 (graceful fallback)
- 9 GATE 검증 수행: 🟢7, 🟡2 (면적 매칭 로직 주의, 모바일 스크롤 증가 수용)

## 파일 변경
- 수정 3파일: ArticleDetail.tsx, ArticleDescription.tsx, InfoCards.tsx
- 신규 3파일: article/MarketPosition, CompetingListings, MaintenanceCost

## 테스트: FE 511 (56파일) 전체 통과, tsc 에러 0, lint 경고 3 (기존)

## 미완료
- 어린이집 API 운영키 전환
- 공공데이터 전체 단지 자동 수집 (4/12 토 05:00)
- 프론트엔드 추가 UI 개선 (검색 결과, 홈 페이지 등)
- 모바일에서 카드 3개 추가로 스크롤 길어짐 — 추후 탭/아코디언 검토
