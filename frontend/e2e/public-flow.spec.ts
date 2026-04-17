import { test, expect } from "@playwright/test";
import { applyPublicMocks } from "./fixtures/public-mocks";

test.describe("public visual regression", () => {
  test("로그인 페이지 렌더 + 시각 회귀", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
    await expect(page.locator("#login-email")).toBeVisible();
    await expect(page.locator("#login-password")).toBeVisible();
    await expect(page.getByRole("button", { name: "로그인" })).toBeVisible();

    await expect(page).toHaveScreenshot("login.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });

  test("홈 페이지 렌더 + 시각 회귀", async ({ page }) => {
    await applyPublicMocks(page);
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /매물 조회/ })).toBeVisible();
    await expect(page.getByText("단지", { exact: true })).toBeVisible();
    await expect(page.getByText("매물", { exact: true })).toBeVisible();

    await expect(page).toHaveScreenshot("home.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
