import { expect, test } from "@playwright/test";
import { applyComplexMocks } from "./fixtures/complex-mocks";

test.describe("complex detail visual regression", () => {
  test("/complex/[no] 단지 상세 페이지 렌더 + 시각 회귀", async ({ page }) => {
    await applyComplexMocks(page);
    await page.goto("/complex/100000");

    // LoadingSpinner 해소 시점 = complexQuery.isLoading false → 단지명 heading 렌더
    await expect(page.getByRole("heading", { name: "테스트단지" })).toBeVisible({ timeout: 10_000 });

    // tableLoading 스피너(role=status, 매물 수 옆) 미표시 확인 — mock 즉시 응답 후 articlesQuery.isFetching=false
    await expect(page.getByRole("status", { name: "로딩 중" })).toBeHidden();

    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("complex.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
