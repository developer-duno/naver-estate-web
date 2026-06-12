# FE 데이터 래퍼는 에러를 삼키지 않는다 (폴백 삼킴 3사고 박제)

`frontend/src/lib/api/` 래퍼에서 `catch` 로 에러를 **빈 데이터·대체 데이터로 바꿔치기 금지**.
queryFn 이 reject 하지 않으면 React Query `isError` 가 prod 에서 영영 발화하지 않아,
컴포넌트의 에러 UI·"다시 시도" 버튼이 전부 **dead code** 가 되고 사용자는 장애 대신
"데이터 없음" 류 **가짜 빈 화면**을 본다. 같은 메커니즘 사고 3회 누적으로 룰 승격 (세션 298).

## 룰 본문

1. **삼킴 금지** — `catch { return empty }` / `data ?? []` 로 error 무시 금지. 실패는 throw 로 전파.
2. **폴백을 두더라도**:
   - 폴백 자체의 실패는 throw (조용한 빈 결과 반환 금지 — V031 차단 환경에서 폴백은 항상 실패).
   - **확정 답변(404 등)은 폴백 없이 rethrow** — 폴백이 에러 타입을 바꿔치기하면(ApiError → plain Error)
     상위의 statusCode 분기가 prod 에서 무동작.
3. **래퍼 레벨 MSW 가드 의무** — 컴포넌트 테스트의 `vi.mock("@/lib/api")` 는 래퍼를 우회하므로
   삼킴 회귀를 **절대 못 잡는다**. 래퍼 함수당 "5xx → reject" 단언 최소 1건.
   선례: `lib/__tests__/article-live-404.test.ts` · `lib/__tests__/analytics-error.test.ts`
   (`HAS_BACKEND` 가 core.ts 모듈 상수라 `vi.stubEnv` + `vi.resetModules()` + fresh import 필수).
4. **서킷브레이커/`isBackendAvailable()` false 분기도 silent 빈 반환 금지** — throw 로 교체
   (선례: analytics.ts `BACKEND_DOWN_MSG`).

## 새 래퍼·에러 UI 추가 시 체크

- [ ] 그 에러가 실제로 컴포넌트 `isError` 까지 도달하나 — 래퍼 전 경로 직독 (에러 UI 추가 전 선행)
- [ ] 래퍼 레벨 MSW 가드 1건 동반
- [ ] 폴백이 있다면 에러 타입 보존 여부 확인

## 사건 (왜 이 룰?)

| 세션 | 사고 | 수정 |
|---|---|---|
| 290 | api-direct 폴백 5함수가 Supabase error 무시 `data ?? []` → V031 차단이 "0개 단지" 빈 화면으로 위장 | PR #146 폴백 throw |
| 297 | `getArticleLive` catch 가 backend 404(ApiError)를 삼키고 Supabase 폴백(plain Error) → 404 UI 분기 도달 불가 | PR #161 404 rethrow + MSW 가드 |
| 298 | `analytics.ts` 3함수 `catch { return empty }` → 기존 retry UI 6곳(세션 274 작품 포함) 전부 prod dead code, 장애 시 "데이터 부족" 가짜 빈 화면 | PR #163 에러 전파 + `analytics-error.test.ts` |

## Cross-link

- `web-rules.md` §실시간 크롤링 "live 엔드포인트에서 에러 시 빈 배열 반환 금지" (BE 측 동일 결)
- `derived-display-ssot.md` — "실제 동작과 표시의 silent drift" 자매 패턴
- 글로벌 메모리 `[[session297-summary]]` `[[session298-summary]]`
