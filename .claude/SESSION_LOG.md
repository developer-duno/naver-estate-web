# 세션 27 로그 (2026-04-08)

## 작업 내용

### 매물 상세 모달 1열 레이아웃 리디자인
- **배경**: 사용자가 좌측 빈 공간 문제 지적 → 지도 불필요, 가독성+프린트 최적화 요청
- **변경**: 2열 비대칭 그리드(5col) → 1열 스택 레이아웃
- **모달 너비**: max-w-6xl(1344px) → max-w-4xl(896px) 축소
- **지도 제거**: ArticleMap.tsx 삭제 (ArticleDetail에서만 사용)
- **InfoCards**: space-y-3 → grid md:grid-cols-2 gap-4 (2카드 나란히)
- **검증**: 9 GATE 하네스 검증 통과 (🟢8, 🟡1, 🔴0)

## 수정 파일

| 파일 | 변경 |
|------|------|
| frontend/src/components/ArticleDetail.tsx | 2열→1열, max-w-4xl, 지도 import 제거 |
| frontend/src/components/article/InfoCards.tsx | md:grid-cols-2 나란히 배치 |
| frontend/src/components/article/ArticleMap.tsx | 삭제 |

## 커밋

1. `7876924` refactor: 매물 상세 모달 1열 레이아웃 리디자인 (지도 제거)

## 테스트

- FE: 529 passed (59파일)
- Build: 통과
- tsc: 에러 0건

## 미완료 운영 작업 (코드 변경 없음)

1. backend/.env SMTP 설정 → 이메일 알림 활성화
2. data.go.kr HRDKOREA API 키 신청 → HRDKOREA_ENABLED=true
3. info.childcare.go.kr 운영키 신청 → CHILDCARE_ENABLED=true
4. 4/11(토) /admin → SchedulerMonitor → collect_public_trades 확인
