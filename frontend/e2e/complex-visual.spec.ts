import { expect, test } from "@playwright/test";
import { applyComplexMocks } from "./fixtures/complex-mocks";

test.describe("complex detail visual regression", () => {
  test("/complex/[no] 단지 상세 페이지 렌더 + 시각 회귀", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await applyComplexMocks(page);
    await page.goto("/complex/100000");

    // LoadingSpinner 해소 시점 = complexQuery.isLoading false → 단지명 heading 렌더
    await expect(page.getByRole("heading", { name: "테스트단지" })).toBeVisible({ timeout: 10_000 });

    // tableLoading 스피너(role=status, 매물 수 옆) 미표시 확인 — mock 즉시 응답 후 articlesQuery.isFetching=false
    await expect(page.getByRole("status", { name: "로딩 중" })).toBeHidden();

    // 자동 크롤 스피너(page.tsx:334 role=status aria-label="매물 갱신 중") 미출현 —
    // complex-mocks 의 start-crawl cached 분기로 tableLoading 이 true 로 튀지 않음.
    await expect(page.getByRole("status", { name: "매물 갱신 중" })).toHaveCount(0);

    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("complex.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
