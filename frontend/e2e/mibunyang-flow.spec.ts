/**
 * E2E: 미분양 페이지 흐름 테스트
 * 실행: npx playwright test e2e/mibunyang-flow.spec.ts
 */
import { test, expect } from "@playwright/test";
import { expectHeader, waitForContentOrEmpty } from "./helpers";

test("미분양 메인 페이지 로드", async ({ page }) => {
  const res = await page.goto("/mibunyang");
  expect(res?.status()).toBeLessThan(500);
  await expectHeader(page);
  await expect(page.getByRole("tab", { name: /미분양 단지/ })).toBeVisible();
});

test("탭 전환 — 크래시 없음", async ({ page }) => {
  await page.goto("/mibunyang");
  await page.waitForLoadState("domcontentloaded");

  const tabs = ["미분양만", "지역 통계", "실거래", "즐겨찾기"];
  for (const tab of tabs) {
    await page.getByRole("tab", { name: new RegExp(tab) }).click();
    await expectHeader(page);
  }
});

test("미분양 검색 결과 — URL 직접 접근 시 정상 렌더링", async ({ page }) => {
  await page.goto("/mibunyang?region=서울&q=래미안");
  await page.waitForLoadState("domcontentloaded");
  await expectHeader(page);
  await waitForContentOrEmpty(page);
});

test("미분양 상세 페이지 접근 — 크래시 없음", async ({ page }) => {
  const res = await page.goto("/mibunyang/12345");
  expect(res?.status()).toBeLessThan(500);
  await expectHeader(page);
});

test("존재하지 않는 미분양 단지 — 크래시 없음", async ({ page }) => {
  const res = await page.goto("/mibunyang/99999999");
  expect(res?.status()).toBeLessThan(500);
  await expectHeader(page);
});

// ── 인터랙션 테스트 ──

test("탭 전환 시 URL tab 파라미터 변경", async ({ page }) => {
  await page.goto("/mibunyang?region=서울");
  await page.waitForLoadState("domcontentloaded");

  // "미분양만" 탭 클릭
  await page.getByRole("tab", { name: /미분양만/ }).click();
  await expect(page).toHaveURL(/tab=unsold/);
  await expectHeader(page);

  // "실거래" 탭 클릭
  await page.getByRole("tab", { name: /실거래/ }).click();
  await expect(page).toHaveURL(/tab=trades/);
  await expectHeader(page);
});

test("미분양 — 지역 파라미터별 정상 렌더링", async ({ page }) => {
  const res = await page.goto("/mibunyang?region=경기");
  expect(res?.status()).toBeLessThan(500);
  await expectHeader(page);
  await waitForContentOrEmpty(page);
});

test("미분양 — sort_by 파라미터 정상 처리", async ({ page }) => {
  const res = await page.goto("/mibunyang?region=서울&sort_by=unsold_desc");
  expect(res?.status()).toBeLessThan(500);
  await expectHeader(page);
  await waitForContentOrEmpty(page);
});
