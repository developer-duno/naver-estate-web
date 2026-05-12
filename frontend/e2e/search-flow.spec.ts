/**
 * E2E: 검색 흐름 테스트
 * 실행: npx playwright test e2e/search-flow.spec.ts
 */
import { test, expect } from "@playwright/test";
import { expectHeader } from "./helpers";

test("홈 페이지 로드", async ({ page }) => {
  await page.goto("/");
  await expectHeader(page);
  // strict mode 회피: first() 사용
  await expect(page.locator("header").locator("text=아파트·오피스텔").first()).toBeVisible();
});

test("검색 결과 페이지 — URL 직접 접근 시 정상 렌더링", async ({ page }) => {
  const res = await page.goto("/search?q=래미안");
  expect(res?.status()).toBeLessThan(500);
  await expectHeader(page);
  await expect(page.locator("text=래미안")).toBeVisible({ timeout: 10_000 });
});

test("검색 결과 페이지 테이블 표시", async ({ page }) => {
  await page.goto("/search?q=래미안");
  await page.waitForLoadState("domcontentloaded");
  const table = page.locator("table, [role='table']");
  const noResults = page.locator("text=검색 결과가 없습니다");
  const loading = page.locator("text=검색 중입니다");
  await expect(table.or(noResults).or(loading)).toBeVisible({ timeout: 30_000 });
});

// ── 인터랙션 테스트 ──

test("존재하지 않는 키워드 검색 — 빈 결과 또는 로딩", async ({ page }) => {
  const res = await page.goto("/search?q=zzzzzzz999");
  expect(res?.status()).toBeLessThan(500);
  await expectHeader(page);
  // 빈 결과 또는 검색 중 표시
  const noResults = page.locator("text=검색 결과가 없습니다");
  const loading = page.locator("text=검색 중입니다");
  const table = page.locator("table");
  await expect(noResults.or(loading).or(table)).toBeVisible({ timeout: 30_000 });
});

test("지역 검색 — URL 파라미터로 정상 렌더링", async ({ page }) => {
  const res = await page.goto("/search?sido=서울특별시&sigungu=강남구");
  expect(res?.status()).toBeLessThan(500);
  await expectHeader(page);
  // 로딩 또는 결과가 보이면 통과
  const table = page.locator("table, [role='table']");
  const noResults = page.locator("text=검색 결과가 없습니다");
  const loading = page.locator("text=검색 중입니다");
  await expect(table.or(noResults).or(loading)).toBeVisible({ timeout: 30_000 });
});

test("홈 페이지 — 헤더 네비게이션 링크 존재", async ({ page }) => {
  await page.goto("/");
  await expectHeader(page);
  // 미분양 링크 존재 확인
  const mbLink = page.locator("a[href='/mibunyang']").first();
  await expect(mbLink).toBeVisible();
});

test("홈 → 미분양 페이지 네비게이션", async ({ page }) => {
  await page.goto("/");
  await expectHeader(page);
  const mbLink = page.locator("a[href='/mibunyang']").first();
  await mbLink.click();
  await page.waitForURL("**/mibunyang**");
  await expectHeader(page);
});
