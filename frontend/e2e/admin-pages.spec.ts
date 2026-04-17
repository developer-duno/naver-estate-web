import { test, expect } from "@playwright/test";
import { applyAdminMocks } from "./fixtures/admin-mocks";

/**
 * /admin 하위 페이지(데이터/사용자/설정) 시각 회귀 스펙.
 * 세션 48 admin-dashboard 와 동일한 mock + storageState 패턴으로 인증 우회.
 * 각 페이지 진입 + 핵심 텍스트 가시성 + toHaveScreenshot 시각 회귀.
 */
test.describe("admin sub-pages", () => {
  test.beforeEach(async ({ page }) => {
    await applyAdminMocks(page);
  });

  test("/admin/data 렌더 + 오래된 데이터 정리 카드", async ({ page }) => {
    await page.goto("/admin/data");

    await expect(page.getByRole("heading", { name: "데이터 관리" })).toBeVisible();
    await expect(page.getByText("오래된 데이터 정리")).toBeVisible();
    await expect(
      page.getByText("비활성 상태(is_active=false)이며 지정 일수 이상 경과된 매물을 삭제합니다."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "삭제" })).toBeVisible();

    await expect(page).toHaveScreenshot("admin-data.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });

  test("/admin/users 렌더 + 사용자 목록 + 필터", async ({ page }) => {
    await page.goto("/admin/users");

    await expect(page.getByRole("heading", { name: "사용자 관리" })).toBeVisible();
    await expect(page.getByRole("combobox").first()).toBeVisible();

    // UserTable 에 mock 사용자 2명 (admin/expert) 렌더
    await expect(page.getByText("admin@example.com")).toBeVisible();
    await expect(page.getByText("expert@example.com")).toBeVisible();

    await expect(page).toHaveScreenshot("admin-users.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });

  test("/admin/settings 렌더 + 설정 키 목록", async ({ page }) => {
    await page.goto("/admin/settings");

    await expect(page.getByRole("heading", { name: "시스템 설정" })).toBeVisible();
    await expect(page.getByText("scheduler.popular_batch_size")).toBeVisible();
    await expect(page.getByText("crawl.throttle_ms")).toBeVisible();

    // 편집 버튼 2개 (설정 키당 1개)
    const editButtons = page.getByRole("button", { name: "편집" });
    await expect(editButtons).toHaveCount(2);

    await expect(page).toHaveScreenshot("admin-settings.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
