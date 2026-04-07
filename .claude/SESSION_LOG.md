# 세션 22 로그 (2026-04-08)

## 변경 내역

### Phase 1: 매물 목록 모바일 카드뷰
- `ArticleCardMobile.tsx`(신규): 매물 모바일 카드 컴포넌트 (memo, 4행 레이아웃)
  - 1행: 체크박스+거래유형뱃지+가격+변동 표시
  - 2행: 면적·동·층
  - 3행: 방/욕·방향·입주·관리비
  - 4행: 특징 (truncate)
- `complex/[no]/page.tsx`: `hidden md:block` 테이블 + `md:hidden` 카드뷰 분기
- 카드 클릭 → 기존 ArticleDetail 모달 열림 (상세 정보는 모달에서)

### Phase 2: 헤더/액션바 반응형
- `complex/[no]/page.tsx`: 헤더 text-lg md:text-2xl, gap-2 md:gap-4, flex-wrap
- 크롤링 시간 뱃지: hidden sm:inline-flex (모바일 숨김)
- 액션바: flex-wrap gap-2, 버튼 text-xs md:text-sm

### Phase 3: FilterDropdown 뷰포트 오버플로 수정
- `FilterDropdown.tsx`: max-w-[calc(100vw-2rem)] + max-h-[70vh] overflow-y-auto 추가
- 320px 화면에서 드롭다운 오른쪽 오버플로 해결
- DetailSection(8개 필드) 긴 드롭다운 세로 스크롤 지원

### Phase 4: ComplexInfo 탭바 모바일 최적화
- `ComplexInfo.tsx`: 탭 px-3 md:px-4, py-2 md:py-2.5, text-xs md:text-sm
- 콘텐츠 영역: p-3 md:p-4

## 공공데이터 수집 확인
- 4/12(토) 05:00 KST 자동 실행 예정
- skip 조건: day==10 AND Saturday → 12일은 해당 없음 → 정상 실행
- 코드 변경 불필요, /admin/scheduler-status에서 모니터링

## 테스트 현황
- FE: 518개 (57파일) 전체 통과 (+7 ArticleCardMobile)
- BE: 396개 (변경 없음)
- E2E: 44개 (변경 없음)

## 다음 세션 우선순위
1. 어린이집 API 운영키 전환 (info.childcare.go.kr 신청)
2. 4/12 공공데이터 수집 결과 확인
3. 추가 모바일 UI 개선 (Pagination, FilterChips 등)
