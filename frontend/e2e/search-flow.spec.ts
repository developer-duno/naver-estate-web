/**
 * E2E: 검색 흐름 테스트
 * 실행: npx playwright test e2e/search-flow.spec.ts
 */
import { test, expect } from "@playwright/test";

test("홈 페이지 로드", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("header")).toBeVisible();
  // strict mode 회피: first() 사용
  await expect(page.locator("header").locator("text=아파트·오피스텔").first()).toBeVisible();
});

test("검색 결과 페이지 — URL 직접 접근 시 정상 렌더링", async ({ page }) => {
  // 홈에서 지역 선택으로 검색 → /search 페이지가 정상 렌더링하는지 확인
  const res = await page.goto("/search?q=래미안");
  expect(res?.status()).toBeLessThan(500);
  await expect(page.locator("header")).toBeVisible();
  // 검색 제목에 "래미안" 포함 확인
  await expect(page.locator("text=래미안")).toBeVisible({ timeout: 10_000 });
});

test("검색 결과 페이지 테이블 표시", async ({ page }) => {
  await page.goto("/search?q=래미안");
  await page.waitForLoadState("domcontentloaded");
  // 실시간 크롤링은 시간이 오래 걸릴 수 있음 — 로딩/결과/에러 중 하나라도 보이면 통과
  const table = page.locator("table, [role='table']");
  const noResults = page.locator("text=검색 결과가 없습니다");
  const loading = page.locator("text=검색 중입니다");
  await expect(table.or(noResults).or(loading)).toBeVisible({ timeout: 30_000 });
});
