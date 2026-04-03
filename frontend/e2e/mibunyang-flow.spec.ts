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

test("미분양 검색 결과 — URL 직접 접근 시 정상 렌더링", async ({ page }) => {
  // 폼 제출 동작은 단위 테스트(MbRegionSelector.test.tsx)에서 검증 완료
  // E2E는 검색 결과가 URL 파라미터를 받아 정상 렌더링하는지 확인
  await page.goto("/mibunyang?region=서울&q=래미안");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("header")).toBeVisible();
  // 테이블 또는 빈 결과 메시지 표시 확인
  const table = page.locator("table, [role='table']");
  const noResults = page.locator("text=검색 결과가 없습니다");
  const loading = page.locator("text=불러오는 중");
  await expect(table.or(noResults).or(loading)).toBeVisible({ timeout: 30_000 });
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
