/**
 * E2E: 비교 페이지 흐름 테스트
 * 실행: npx playwright test e2e/compare-flow.spec.ts
 */
import { test, expect } from "@playwright/test";
import { expectHeader, seedLocalStorage } from "./helpers";

test("단지 비교 — ids 없이 접근 시 크래시 없음", async ({ page }) => {
  const res = await page.goto("/compare");
  expect(res?.status()).toBeLessThan(500);
  await expectHeader(page);
});

test("단지 비교 — 더미 ids로 접근 시 크래시 없음", async ({ page }) => {
  const res = await page.goto("/compare?ids=12345,67890");
  expect(res?.status()).toBeLessThan(500);
  await expectHeader(page);
});

test("미분양 비교 — ids 없이 접근 시 크래시 없음", async ({ page }) => {
  const res = await page.goto("/mibunyang/compare");
  expect(res?.status()).toBeLessThan(500);
  await expectHeader(page);
});

test("미분양 비교 — 더미 ids로 접근 시 크래시 없음", async ({ page }) => {
  const res = await page.goto("/mibunyang/compare?ids=1,2");
  expect(res?.status()).toBeLessThan(500);
  await expectHeader(page);
});

// ── 인터랙션 테스트 ──

test("단지 비교 — compare_complexes localStorage 시드 후 정상 로드", async ({ page }) => {
  await seedLocalStorage(page, "compare_complexes", ["100000", "200000"]);
  const res = await page.goto("/compare?ids=100000,200000");
  expect(res?.status()).toBeLessThan(500);
  await expectHeader(page);
  // 비교 테이블 / 로딩 / 빈 상태 / 에러 화면 (PR #47 신설) 중 하나라도 보이면 통과
  const table = page.locator("table, [role='table']");
  const loading = page.locator("text=로딩");
  const noData = page.locator("text=단지를 선택");
  const errorAlert = page.locator("[role='alert']");
  const errorEmpty = page.locator("text=비교 단지 정보를 불러오지 못했습니다");
  await expect(table.or(loading).or(noData).or(errorAlert).or(errorEmpty)).toBeVisible({ timeout: 30_000 });
});

test("미분양 비교 — mb_compare localStorage 시드 후 정상 로드", async ({ page }) => {
  await seedLocalStorage(page, "mb_compare", ["apt-1", "apt-2"]);
  const res = await page.goto("/mibunyang/compare?ids=apt-1,apt-2");
  expect(res?.status()).toBeLessThan(500);
  await expectHeader(page);
  const table = page.locator("table, [role='table']");
  const loading = page.locator("text=로딩");
  const noData = page.locator("text=단지를 선택");
  const errorAlert = page.locator("[role='alert']");
  const errorEmpty = page.locator("text=비교 데이터를 불러오지 못했습니다");
  await expect(table.or(loading).or(noData).or(errorAlert).or(errorEmpty)).toBeVisible({ timeout: 30_000 });
});

test("비교 페이지 — 뒤로가기 버튼 존재", async ({ page }) => {
  await page.goto("/compare?ids=12345,67890");
  await expectHeader(page);
  // 뒤로가기 또는 홈 링크 존재 확인
  const backBtn = page.locator("button:has-text('뒤로'), a[href='/']").first();
  await expect(backBtn).toBeVisible({ timeout: 10_000 });
});
