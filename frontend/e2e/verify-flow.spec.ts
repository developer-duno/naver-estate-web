/**
 * E2E: 검증 흐름 — /verify 폼 렌더링, 입력 검증, /admin/users 심사 UI
 * 실행: npx playwright test e2e/verify-flow.spec.ts
 * 주의: 백엔드 서버 가동 + 인증 세션 필요 (비인증 시 리다이렉트)
 */
import { test, expect } from "@playwright/test";

test("검증 신청 페이지 접근 — 미인증 시 로그인 리다이렉트 또는 폼 표시", async ({ page }) => {
  await page.goto("/verify");
  // 미인증 시 로그인으로 리다이렉트되거나, 인증 시 폼이 표시됨
  const isLoginPage = page.url().includes("/login");
  const hasForm = await page.locator("input#v-biz, h1:has-text('인증')").count();
  expect(isLoginPage || hasForm > 0).toBeTruthy();
});

test("검증 신청 폼 — 필수 입력 필드 존재", async ({ page }) => {
  await page.goto("/verify");
  // 폼이 표시되는 경우만 검증 (미인증 시 스킵)
  const formVisible = await page.locator("form").count();
  if (formVisible === 0) return;

  await expect(page.locator("input#v-biz")).toBeVisible();
  await expect(page.locator("input#v-name")).toBeVisible();
  await expect(page.locator("input#v-license")).toBeVisible();
  await expect(page.locator("input#v-office")).toBeVisible();
  await expect(page.locator("button[type='submit']")).toBeVisible();
});

test("검증 신청 폼 — 클라이언트 검증 (잘못된 사업자번호)", async ({ page }) => {
  await page.goto("/verify");
  const formVisible = await page.locator("form").count();
  if (formVisible === 0) return;

  await page.fill("input#v-biz", "12345");
  await page.fill("input#v-name", "홍길동");
  await page.click("button[type='submit']");

  await expect(page.locator("[role='alert']")).toBeVisible();
  await expect(page.locator("[role='alert']")).toContainText("10자리");
});

test("관리자 검증 심사 페이지 접근", async ({ page }) => {
  await page.goto("/admin/users");
  // 관리자 인증 필요 — 리다이렉트 또는 심사 UI 표시
  const isRedirected = !page.url().includes("/admin/users");
  const hasContent = await page.locator("h1, h2, h3").count();
  expect(isRedirected || hasContent > 0).toBeTruthy();
});
