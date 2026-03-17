/**
 * E2E: 검색 흐름 테스트
 * 실행: npx playwright test e2e/search-flow.spec.ts
 */
import { test, expect } from "@playwright/test";

test("홈 페이지 로드", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("header")).toBeVisible();
  // strict mode 회피: first() 사용
  await expect(page.locator("header").locator("text=아파트 매물").first()).toBeVisible();
});

test("키워드 검색 시 결과 페이지 이동", async ({ page }) => {
  await page.goto("/");
  const searchInput = page.locator('input[type="text"]').first();
  await searchInput.fill("래미안");
  await searchInput.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=/);
});

test("검색 결과 페이지 테이블 표시", async ({ page }) => {
  await page.goto("/search?q=래미안");
  await page.waitForLoadState("networkidle");
  const table = page.locator("table, [role='table']");
  const noResults = page.locator("text=검색 결과가 없습니다");
  await expect(table.or(noResults)).toBeVisible({ timeout: 130_000 });
});
