/**
 * E2E: 미분양 페이지 흐름 테스트
 * 실행: npx playwright test e2e/mibunyang-flow.spec.ts
 */
import { test, expect } from "@playwright/test";

test("미분양 메인 페이지 로드", async ({ page }) => {
  const res = await page.goto("/mibunyang");
  expect(res?.status()).toBeLessThan(500);
  await expect(page.locator("header")).toBeVisible();
  // 탭바 존재 확인
  await expect(page.locator("button").filter({ hasText: "미분양 단지" }).first()).toBeVisible();
});

test("탭 전환 — 크래시 없음", async ({ page }) => {
  await page.goto("/mibunyang");
  await page.waitForLoadState("domcontentloaded");

  const tabs = ["미분양만", "지역 통계", "실거래", "즐겨찾기"];
  for (const tab of tabs) {
    await page.locator("button").filter({ hasText: tab }).first().click();
    // 탭 전환 후 header 유지 확인
    await expect(page.locator("header")).toBeVisible();
  }
});

test("미분양 검색 키워드 입력", async ({ page }) => {
  await page.goto("/mibunyang");
  await page.waitForLoadState("domcontentloaded");

  const searchInput = page.locator('input[type="text"]').first();
  await searchInput.fill("래미안");
  await searchInput.press("Enter");
  // URL에 검색어 반영 확인
  await expect(page).toHaveURL(/q=/);
});

test("미분양 상세 페이지 접근 — 크래시 없음", async ({ page }) => {
  const res = await page.goto("/mibunyang/12345");
  expect(res?.status()).toBeLessThan(500);
  await expect(page.locator("header")).toBeVisible();
});

test("존재하지 않는 미분양 단지 — 크래시 없음", async ({ page }) => {
  const res = await page.goto("/mibunyang/99999999");
  expect(res?.status()).toBeLessThan(500);
  await expect(page.locator("header")).toBeVisible();
});
