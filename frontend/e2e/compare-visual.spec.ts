import { test, expect } from "@playwright/test";
import { applyCompareMocks } from "./fixtures/compare-mocks";

test.describe("compare visual regression", () => {
  test("단지 비교 페이지 렌더 + 시각 회귀", async ({ page }) => {
    await applyCompareMocks(page);
    await page.goto("/compare?ids=100000,200000");

    // 로딩 스피너 사라질 때까지 대기 (useQueries 병렬 로드 완료)
    await expect(page.getByText("단지 정보를 불러오는 중")).toBeHidden({ timeout: 10_000 });

    await expect(page.getByRole("heading", { name: "단지 비교" })).toBeVisible();
    await expect(page.getByRole("button", { name: "테스트단지A" })).toBeVisible();
    await expect(page.getByRole("button", { name: "테스트단지B" })).toBeVisible();

    // Recharts 는 렌더 타이밍 비결정적 → 차트 섹션 전체를 숨겨 baseline 안정화
    await page.addStyleTag({
      content: `[data-testid="compare-charts"] { visibility: hidden !important; }`,
    });
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("compare.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
