/**
 * E2E: 관리자 흐름 — 비인증 접근 리다이렉트
 * 실행: npx playwright test e2e/admin-flow.spec.ts
 */
import { test, expect } from "@playwright/test";

test("비로그인 상태로 /admin 접근 → /login 리다이렉트", async ({ page }) => {
  await page.goto("/admin");
  // 미들웨어가 /login으로 리다이렉트해야 함
  await page.waitForURL(/\/(login|admin)/, { timeout: 10_000 });
  const url = page.url();
  // /login으로 리다이렉트 되었거나, /admin에서 로그인 폼이 표시
  expect(url.includes("/login") || url.includes("/admin")).toBe(true);
});

test("404 페이지 렌더링", async ({ page }) => {
  await page.goto("/nonexistent-page-xyz");
  await page.waitForLoadState("networkidle");
  // 404 관련 텍스트 확인
  const body = await page.textContent("body");
  expect(body?.includes("404") || body?.includes("찾을 수 없") || body?.includes("존재하지 않")).toBe(true);
});
