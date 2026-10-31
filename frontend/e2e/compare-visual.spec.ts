import { test, expect } from "@playwright/test";
import { COMPARE_FIXED_NOW, applyCompareMocks } from "./fixtures/compare-mocks";

test.describe("compare visual regression", () => {
  test("단지 비교 페이지 렌더 + 시각 회귀", async ({ page }) => {
    // 비로그인 실거래가 추이 띠의 마지막 달 = 오늘 달 → 시계 고정(세션 491). 타이머는 그대로 돈다
    await page.clock.setFixedTime(COMPARE_FIXED_NOW);
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
    // 실거래가 추이 카드(비로그인 · mock 고정)가 회색 자리에서 굳을 때까지 — A = 띠, B = 거래 없음 글자
    const trendCells = page.getByTestId("compare-public-trend-cell");
    await expect(trendCells.nth(0).getByTestId("consumer-bands")).toBeVisible();
    await expect(trendCells.nth(1).getByText("최근 2년 실거래 없음")).toBeVisible();
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("compare.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
