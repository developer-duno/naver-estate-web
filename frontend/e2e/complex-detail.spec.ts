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
  const res = await page.goto("/complex/99999999");
  expect(res?.status()).toBeLessThan(500);
  await expect(page.locator("header")).toBeVisible();
});

test("엑셀 내보내기 버튼 — 페이지 크래시 없이 로드", async ({ page }) => {
  await page.goto("/complex/12345");
  await page.waitForLoadState("networkidle");
  // 페이지가 정상 로드되면 테스트 통과
  await expect(page.locator("header")).toBeVisible();
});
