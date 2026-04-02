/**
 * E2E: 비교 페이지 흐름 테스트
 * 실행: npx playwright test e2e/compare-flow.spec.ts
 */
import { test, expect } from "@playwright/test";

test("단지 비교 — ids 없이 접근 시 크래시 없음", async ({ page }) => {
  const res = await page.goto("/compare");
  expect(res?.status()).toBeLessThan(500);
  await expect(page.locator("header")).toBeVisible();
});

test("단지 비교 — 더미 ids로 접근 시 크래시 없음", async ({ page }) => {
  const res = await page.goto("/compare?ids=12345,67890");
  expect(res?.status()).toBeLessThan(500);
  await expect(page.locator("header")).toBeVisible();
});

test("미분양 비교 — ids 없이 접근 시 크래시 없음", async ({ page }) => {
  const res = await page.goto("/mibunyang/compare");
  expect(res?.status()).toBeLessThan(500);
  await expect(page.locator("header")).toBeVisible();
});

test("미분양 비교 — 더미 ids로 접근 시 크래시 없음", async ({ page }) => {
  const res = await page.goto("/mibunyang/compare?ids=1,2");
  expect(res?.status()).toBeLessThan(500);
  await expect(page.locator("header")).toBeVisible();
});
