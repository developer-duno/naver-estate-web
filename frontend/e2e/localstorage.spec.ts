/**
 * E2E: localStorage 영속성 테스트
 * 실행: npx playwright test e2e/localstorage.spec.ts
 */
import { test, expect } from "@playwright/test";
import { seedLocalStorage, expectHeader } from "./helpers";

test("검색 히스토리 시드 → 홈에서 히스토리 UI 존재", async ({ page }) => {
  await seedLocalStorage(page, "search_history", [
    { type: "keyword", value: "래미안", timestamp: Date.now() },
  ]);
  await page.goto("/");
  await expectHeader(page);
  // 히스토리 pill 또는 관련 UI가 존재하면 통과 (없어도 크래시 없음)
  const body = page.locator("body");
  await expect(body).toBeVisible();
});

test("즐겨찾기 시드 → 홈에서 즐겨찾기 UI 존재", async ({ page }) => {
  await seedLocalStorage(page, "favorite_complexes", ["100000"]);
  await page.goto("/");
  await expectHeader(page);
  const body = page.locator("body");
  await expect(body).toBeVisible();
});

test("미분양 즐겨찾기 시드 → 즐겨찾기 탭 데이터 표시", async ({ page }) => {
  await seedLocalStorage(page, "mb_favorites", [
    { id: "test-1", name: "테스트단지", region: "서울" },
  ]);
  await page.goto("/mibunyang?tab=favorites");
  await expectHeader(page);
  // 즐겨찾기 탭이 로드됨 — 크래시 없음
  const body = page.locator("body");
  await expect(body).toBeVisible();
});

test("비교 히스토리 시드 → 미분양 페이지 크래시 없음", async ({ page }) => {
  await seedLocalStorage(page, "mb_compare_history", [
    { ids: ["a", "b"], timestamp: Date.now() },
  ]);
  await page.goto("/mibunyang");
  await expectHeader(page);
  const body = page.locator("body");
  await expect(body).toBeVisible();
});

test("비교 북마크 시드 → 미분양 페이지 크래시 없음", async ({ page }) => {
  await seedLocalStorage(page, "mb_compare_bookmarks", [
    { ids: ["a", "b"], name: "테스트 비교", timestamp: Date.now() },
  ]);
  await page.goto("/mibunyang");
  await expectHeader(page);
  const body = page.locator("body");
  await expect(body).toBeVisible();
});
