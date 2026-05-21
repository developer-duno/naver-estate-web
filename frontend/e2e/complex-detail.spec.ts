/**
 * E2E: 단지 상세 페이지
 * 실행: npx playwright test e2e/complex-detail.spec.ts
 */
import { test, expect } from "@playwright/test";

test("단지 상세 페이지 접근 시 크래시 없음", async ({ page }) => {
  const res = await page.goto("/complex/12345");
  // 페이지가 로드되면 성공 (200 또는 리다이렉트)
  expect(res?.status()).toBeLessThan(500);
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

test("정보 위계 4섹션 순서 — 시세 → 매물 → 실거래가 추이 → 단지 정보 (PR 3a spec L323)", async ({ page }) => {
  await page.goto("/complex/12345");
  await page.waitForLoadState("networkidle");
  // 페이지 본문의 H2 4개가 spec L323 의 정보 위계 순서를 따르는지 검증.
  // 누군가 섹션 한 줄 옮기면 즉시 회귀.
  const h2s = await page.getByRole("heading", { level: 2 }).allTextContents();
  expect(h2s).toEqual(["시세", "매물", "실거래가 추이", "단지 정보"]);
});
