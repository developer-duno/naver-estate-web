import { expect, test } from "@playwright/test";
import { applyMibunyangDetailMocks } from "./fixtures/mibunyang-mocks";

test.describe("mibunyang detail visual regression", () => {
  test("/mibunyang/[id] 미분양 상세 페이지 렌더 + 시각 회귀", async ({ page }) => {
    await applyMibunyangDetailMocks(page);
    await page.goto("/mibunyang/test-apt-001");

    // detailQuery.isLoading false → 단지명 heading 렌더
    await expect(page.getByRole("heading", { name: "테스트미분양단지" })).toBeVisible({ timeout: 10_000 });

    // historyQuery.isLoading false 확인 — "추이 데이터 로딩 중" 미표시
    await expect(page.getByText("추이 데이터 로딩 중")).toBeHidden();

    // Recharts 는 렌더 타이밍 비결정적 → 미분양 추이 섹션 전체 숨김 (세션 59 /compare 선례)
    await page.addStyleTag({
      content: `[data-testid="mb-unsold-trend"] { visibility: hidden !important; }`,
    });

    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("mibunyang.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
