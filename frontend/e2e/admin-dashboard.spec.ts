import { test, expect } from "@playwright/test";
import { applyAdminMocks } from "./fixtures/admin-mocks";

test.describe("admin dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await applyAdminMocks(page);
  });

  test("메인 대시보드 렌더 + 핵심 카드 가시성", async ({ page }) => {
    await page.goto("/admin");

    await expect(page.getByRole("heading", { name: "대시보드" })).toBeVisible();

    await expect(page.getByText("단지 수")).toBeVisible();
    await expect(page.getByText("오늘 크롤")).toBeVisible();

    await expect(page.getByText("스케줄러 모니터링")).toBeVisible();
    await expect(page.getByText("지금 돌아가는 작업")).toBeVisible();
    await expect(page.getByText("최근 활동")).toBeVisible();

    await expect(page.getByText("대기질 수집")).toBeVisible();

    // 세션 51: NaverCallsCard 회귀 가드 (세션 91 에서 제목 사람말화)
    await expect(page.getByText("네이버 호출 횟수 (10분 / 1시간 / 24시간)")).toBeVisible();
    await expect(page.getByText("매물 목록 (배치)")).toBeVisible();

    // 시각 회귀: chromium-{platform} 별 baseline 자동 생성 (e2e/admin-dashboard.spec.ts-snapshots/)
    await expect(page).toHaveScreenshot("admin-dashboard.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
