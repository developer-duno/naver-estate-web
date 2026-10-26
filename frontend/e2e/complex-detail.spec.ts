/**
 * E2E: 단지 상세 페이지
 * 실행: npx playwright test e2e/complex-detail.spec.ts
 */
import { test, expect } from "@playwright/test";

test("단지 상세 페이지 접근 시 크래시 없음 — 비로그인도 로그인 화면으로 보내지 않는다 (세션 481)", async ({ page }) => {
  const res = await page.goto("/complex/12345");
  // 세션 481 공개 전환: 로그인 벽(307 → /login)을 걷었다 — 비로그인도 단지 화면이 200 으로 열린다
  expect(res?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/complex/12345");
  await expect(page.locator("header")).toBeVisible();
});

test("존재하지 않는 단지 접근 시 크래시 없음", async ({ page }) => {
  await page.goto("/complex/99999999");
  // 프론트엔드가 에러를 잡고 정상 렌더링하는지 확인 (서버 500도 프론트가 처리)
  await expect(page.locator("header")).toBeVisible();
});

test("엑셀 내보내기 버튼 — 페이지 크래시 없이 로드", async ({ page }) => {
  await page.goto("/complex/12345");
  await page.waitForLoadState("networkidle");
  // 페이지가 정상 로드되면 테스트 통과
  await expect(page.locator("header")).toBeVisible();
});

// 정보 위계 순서 회귀 가드는 page-level vitest 로 이관:
// frontend/src/app/complex/[no]/__tests__/page-hierarchy.test.tsx
// e2e 환경은 BE 단지 데이터 의존이라 ComplexLoadState 상태에 머물 수 있어 부적합.
