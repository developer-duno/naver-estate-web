import { expect, test } from "@playwright/test";
import { applySearchEmptyMocks } from "./fixtures/search-mocks";

test.describe("search visual regression", () => {
  test("/search 빈 상태 진입 시각 회귀", async ({ page }) => {
    await applySearchEmptyMocks(page);
    await page.goto("/search");

    // 검색 폼 섹션 렌더 확인 (hasSearchParams=false 진입) — 세션 314 홈/검색 통합으로
    // SearchExperience 가 빈 상태 제목을 "단지명 검색" 으로 통일
    await expect(page.getByRole("heading", { name: "단지명 검색" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "지역 선택" })).toBeVisible();

    // RegionSelector 의 "시/도" Combobox input 로딩 해소 대기 (PR 4 단계 3: @base-ui Combobox 전환).
    // native <select> 의 option 노출 → Combobox input 활성화 (disabled false) 로 대기 조건 변경.
    const sidoInput = page.getByLabel("시/도");
    await expect(sidoInput).toBeVisible({ timeout: 5_000 });
    await expect(sidoInput).toBeEnabled({ timeout: 5_000 });

    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("search.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
