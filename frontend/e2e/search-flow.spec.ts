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
  await expect(page.locator("header").locator("text=2u부동산").first()).toBeVisible();
});

test("검색 결과 페이지 — URL 직접 접근 시 정상 렌더링", async ({ page }) => {
  const res = await page.goto("/?q=래미안");
  expect(res?.status()).toBeLessThan(500);
  await expectHeader(page);
  await expect(page.locator("text=래미안")).toBeVisible({ timeout: 10_000 });
});

test("검색 결과 페이지 테이블 표시", async ({ page }) => {
  await page.goto("/?q=래미안");
  await page.waitForLoadState("domcontentloaded");
  const table = page.locator("table, [role='table']");
  const noResults = page.locator("text=검색 결과가 없습니다");
  const loading = page.locator("text=검색 중입니다");
  await expect(table.or(noResults).or(loading)).toBeVisible({ timeout: 30_000 });
});

// 세션 525(B40 PR 2a): 검색 결과 새 틀 — 홈 큰 띠 없음(보이는 h1 하나) · 20곳씩 「더 보기」.
// 브라우저의 검색 요청만 가짜로 답한다(운영 API·네이버를 부르지 않는다). 기준 그림 없음.
test("검색 결과 새 틀 — h1 하나 · 20곳씩 더 보기", async ({ page }) => {
  const complexes = Array.from({ length: 45 }, (_, i) => ({
    complex_no: `9${String(i + 1).padStart(3, "0")}`,
    complex_name: `시험단지 ${String(i + 1).padStart(3, "0")}`,
    real_estate_type_code: "APT",
    real_estate_type_name: "아파트",
    cortar_address: "서울시 서초구 반포동",
  }));
  await page.route("**/api/live/search**", (route) =>
    route.request().method() === "OPTIONS"
      ? route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization" } })
      : route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ complexes, total: 45 }) }),
  );
  await page.goto("/?q=래미안");
  await expect(page.getByRole("heading", { level: 1, name: "「래미안」 단지 45곳" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("h1:visible")).toHaveCount(1);
  const names = page.locator('a[href^="/complex/"]:visible');
  await expect(names).toHaveCount(20);
  await page.getByRole("button", { name: "더 보기 · 20 / 45" }).click();
  await expect(names).toHaveCount(40);
  await page.getByRole("button", { name: "더 보기 · 40 / 45" }).click();
  await expect(names).toHaveCount(45);
  await expect(page.getByRole("button", { name: /더 보기/ })).toHaveCount(0);
});

// ── 인터랙션 테스트 ──

test("존재하지 않는 키워드 검색 — 빈 결과 또는 로딩", async ({ page }) => {
  const res = await page.goto("/?q=zzzzzzz999");
  expect(res?.status()).toBeLessThan(500);
  await expectHeader(page);
  // 빈 결과 또는 검색 중 표시
  const noResults = page.locator("text=검색 결과가 없습니다");
  const loading = page.locator("text=검색 중입니다");
  const table = page.locator("table");
  await expect(noResults.or(loading).or(table)).toBeVisible({ timeout: 30_000 });
});

test("지역 검색 — URL 파라미터로 정상 렌더링", async ({ page }) => {
  const res = await page.goto("/?sido=서울특별시&sigungu=강남구");
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
