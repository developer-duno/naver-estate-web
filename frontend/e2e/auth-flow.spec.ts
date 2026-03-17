/**
 * E2E: 인증 흐름 — 로그인 페이지, 회원가입 페이지, 비밀번호 찾기
 * 실행: npx playwright test e2e/auth-flow.spec.ts
 */
import { test, expect } from "@playwright/test";

test("로그인 페이지 렌더링", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("input[type='email'], input[name='email']")).toBeVisible();
  await expect(page.locator("input[type='password']")).toBeVisible();
  await expect(page.locator("button[type='submit'], button:has-text('로그인')")).toBeVisible();
});

test("회원가입 페이지 렌더링", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.locator("input[type='email'], input[name='email']")).toBeVisible();
  await expect(page.locator("input[type='password']").first()).toBeVisible();
  await expect(page.locator("button[type='submit'], button:has-text('가입')")).toBeVisible();
});

test("비밀번호 찾기 페이지 렌더링", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(page.locator("input[type='email'], input[name='email']")).toBeVisible();
  await expect(page.locator("button[type='submit'], button:has-text('재설정'), button:has-text('비밀번호')")).toBeVisible();
});

test("로그인 페이지 → 회원가입 링크", async ({ page }) => {
  await page.goto("/login");
  const signupLink = page.locator("a[href='/signup'], a:has-text('회원가입')");
  await expect(signupLink).toBeVisible();
});

test("로그인 페이지 → 비밀번호 찾기 링크", async ({ page }) => {
  await page.goto("/login");
  const forgotLink = page.locator("a[href='/forgot-password'], a:has-text('비밀번호')");
  await expect(forgotLink).toBeVisible();
});
