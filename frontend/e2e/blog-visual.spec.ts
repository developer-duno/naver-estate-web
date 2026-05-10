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

  test("/blog/[slug] hero + BlogFigure — iPhone (mibunyang-radar-weights)", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.iphone);
    await page.goto("/blog/mibunyang-radar-weights");
    await expect(page.getByRole("heading", { name: /30초에 줄세우기/ })).toBeVisible();
    await expect(page).toHaveScreenshot("blog-slug-radar-weights-iphone.png", {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
    });
  });

  test("/blog/[slug] hero + BlogFigure — Desktop (mibunyang-radar-weights)", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto("/blog/mibunyang-radar-weights");
    await expect(page.getByRole("heading", { name: /30초에 줄세우기/ })).toBeVisible();
    await expect(page).toHaveScreenshot("blog-slug-radar-weights-desktop.png", {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
    });
  });

  test("/blog/[slug] hero + BlogFigure — iPhone (mibunyang-for-agents)", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.iphone);
    await page.goto("/blog/mibunyang-for-agents");
    await expect(page.getByRole("heading", { name: /공인중개사를 위한 미분양/ })).toBeVisible();
    await expect(page).toHaveScreenshot("blog-slug-for-agents-iphone.png", {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
    });
  });

  test("/blog/[slug] hero + BlogFigure — Desktop (mibunyang-for-agents)", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto("/blog/mibunyang-for-agents");
    await expect(page.getByRole("heading", { name: /공인중개사를 위한 미분양/ })).toBeVisible();
    await expect(page).toHaveScreenshot("blog-slug-for-agents-desktop.png", {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
    });
  });
});
