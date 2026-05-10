import { test, expect } from "@playwright/test";

const VIEWPORTS = {
  iphone: { width: 390, height: 844 },
  desktop: { width: 1280, height: 848 },
};

test.describe("blog visual regression (iPhone + Desktop)", () => {
  test("/blog 인덱스 hero gallery — iPhone", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.iphone);
    await page.goto("/blog");
    await expect(page.getByRole("heading", { name: /부동산 인사이트/ })).toBeVisible();
    await expect(page).toHaveScreenshot("blog-index-iphone.png", {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
    });
  });

  test("/blog 인덱스 hero gallery — Desktop", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto("/blog");
    await expect(page.getByRole("heading", { name: /부동산 인사이트/ })).toBeVisible();
    await expect(page).toHaveScreenshot("blog-index-desktop.png", {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
    });
  });

  test("/blog/[slug] hero + BlogFigure — iPhone (compare-workflow)", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.iphone);
    await page.goto("/blog/compare-workflow");
    await expect(page.getByRole("heading", { name: /24행 비교/ })).toBeVisible();
    await expect(page).toHaveScreenshot("blog-slug-iphone.png", {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
    });
  });

  test("/blog/[slug] hero + BlogFigure — Desktop (compare-workflow)", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto("/blog/compare-workflow");
    await expect(page.getByRole("heading", { name: /24행 비교/ })).toBeVisible();
    await expect(page).toHaveScreenshot("blog-slug-desktop.png", {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
    });
  });

  test("/blog/[slug] hero + BlogFigure — iPhone (realtime-listing)", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.iphone);
    await page.goto("/blog/realtime-listing");
    await expect(page.getByRole("heading", { name: /네이버 매물 실시간 조회/ })).toBeVisible();
    await expect(page).toHaveScreenshot("blog-slug-realtime-iphone.png", {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
    });
  });

  test("/blog/[slug] hero + BlogFigure — Desktop (realtime-listing)", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto("/blog/realtime-listing");
    await expect(page.getByRole("heading", { name: /네이버 매물 실시간 조회/ })).toBeVisible();
    await expect(page).toHaveScreenshot("blog-slug-realtime-desktop.png", {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
    });
  });
});
