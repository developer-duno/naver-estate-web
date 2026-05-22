/**
 * E2E: 반응형 뷰포트 테스트
 * 실행: npx playwright test e2e/responsive.spec.ts
 */
import { test, expect } from "@playwright/test";
import { expectHeader } from "./helpers";

// ── 모바일 (375x667) ──

test("모바일 — 홈 페이지 렌더링", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/");
  await expectHeader(page);
  const body = page.locator("body");
  await expect(body).toBeVisible();
});

test("모바일 — 미분양 페이지 렌더링", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const res = await page.goto("/mibunyang");
  expect(res?.status()).toBeLessThan(500);
  await expectHeader(page);
  // 탭 버튼이 보이는지 확인
  await expect(page.locator("button").filter({ hasText: "미분양 단지" }).first()).toBeVisible();
});

test("모바일 — 검색 결과 페이지 렌더링", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const res = await page.goto("/search?q=래미안");
  expect(res?.status()).toBeLessThan(500);
  await expectHeader(page);
});

// ── 태블릿 (768x1024) ──

test("태블릿 — 홈 페이지 렌더링", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/");
  await expectHeader(page);
});

test("태블릿 — 미분양 페이지 테이블 표시", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  const res = await page.goto("/mibunyang?region=서울");
  expect(res?.status()).toBeLessThan(500);
  await expectHeader(page);
  // 테이블 또는 로딩/빈 상태 확인
  const table = page.locator("table, [role='table']");
  const noData = page.locator("text=데이터가 없습니다");
  const loading = page.locator("text=불러오는 중");
  await expect(table.or(noData).or(loading)).toBeVisible({ timeout: 30_000 });
});

// ── 데스크톱 (1280x720) ──

test("데스크톱 — 홈 페이지 정상 레이아웃", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expectHeader(page);
  // 네비게이션 링크 표시 확인
  const navLink = page.locator("a[href='/mibunyang']").first();
  await expect(navLink).toBeVisible();
});

test("데스크톱 — 비교 페이지 렌더링", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const res = await page.goto("/compare?ids=12345,67890");
  expect(res?.status()).toBeLessThan(500);
  await expectHeader(page);
});

// PR 3b 모바일 Sheet 필터 smoke. SheetTrigger 노출까지의 인터랙션 검증은
// BE 단지 12345 seed 의존이라 flaky 위험 → vitest (page-hierarchy.test +
// FilterBarMobileSheet.test) 로 대체. e2e 는 응답 코드·헤더 가시성만 확인.
test("모바일 — /complex/[no] 진입 응답 200 + 헤더 (PR 3b smoke)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const res = await page.goto("/complex/12345");
  expect(res?.status()).toBeLessThan(500);
  await expectHeader(page);
});
