import { expect, test } from "@playwright/test";
import { applySearchEmptyMocks } from "./fixtures/search-mocks";

test.describe("search visual regression", () => {
  test("/search 빈 상태 진입 시각 회귀", async ({ page }) => {
    await applySearchEmptyMocks(page);
    await page.goto("/search");

    // 검색 폼 섹션 렌더 확인 (hasSearchParams=false 진입)
    await expect(page.getByRole("heading", { name: "키워드 검색" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "지역 선택" })).toBeVisible();

    // RegionSelector 의 "시/도" select 로딩 해소 대기 (mock 응답 후 sidoList 바인딩)
    await expect(page.getByRole("option", { name: "서울" })).toBeAttached({ timeout: 5_000 });

    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("search.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
