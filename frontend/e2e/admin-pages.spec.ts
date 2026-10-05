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

  test("/admin/data 렌더 + 통계 카드", async ({ page }) => {
    await page.goto("/admin/data");

    await expect(page.getByRole("heading", { name: "데이터 관리" })).toBeVisible();
    // 세션 401: "오래된 데이터 정리" 카드 제거 — 그 카드/문구/삭제 버튼 단언 3건도 함께 삭제.
    // (제거 사유는 app/admin/data/page.tsx 헤더 주석. 화면에서 없어진 요소를 계속 단언하면
    //  스냅샷보다 먼저 이 단언이 깨져 baseline 재촬영조차 불가능해진다.)
    await expect(page.getByText("오래된 데이터 정리")).toHaveCount(0);
    // StatsCards 는 토큰 취득 → /api/admin/stats/detailed(mock) 순으로 비동기 렌더된다.
    // 카드가 뜨기 전에 찍으면 페이지 높이가 달라져 baseline 과 어긋나는 경합(세션 396, PR #480 CI 1회 실패)
    // — 다른 admin 시각 스펙처럼 mock 데이터가 화면에 보인 뒤 찍는다.
    // 관리자 화면 리뉴얼(A4): 대시보드에서 뺀 숫자(24시간 오류·채워진 비율·가치 점수)가 이 화면의
    // "숫자 자세히 보기" 소제목 아래로 옮겨 왔다 — 소제목까지 보인 뒤 찍는다.
    await expect(page.getByText("숫자 자세히 보기")).toBeVisible();
    await expect(page.getByText("단지 수")).toBeVisible();
    await expect(page.getByText("1,234")).toBeVisible();

    await expect(page).toHaveScreenshot("admin-data.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });

  test("/admin/users 렌더 + 사용자 목록 + 필터", async ({ page }) => {
    await page.goto("/admin/users");

    await expect(page.getByRole("heading", { name: "사용자 관리" })).toBeVisible();
    // 관리자 화면 리뉴얼(A4): 필터가 "사용자 목록" 카드 머리로 옮겨졌다 — 첫 combobox 는 여전히 역할 필터다
    await expect(page.getByRole("combobox").first()).toBeVisible();

    // UserTable 에 mock 사용자 2명 (admin/expert) 렌더
    await expect(page.getByText("admin@example.com")).toBeVisible();
    await expect(page.getByText("expert@example.com")).toBeVisible();

    await expect(page).toHaveScreenshot("admin-users.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });

  // 세션 419(2026-09-26 사장님 결정): /admin/settings 화면 삭제 — 그 렌더·시각 회귀 테스트도 함께 제거.

  // 세션 437 의견함 — 렌더만 본다(기준 사진 없음). 공통 mock(빈 목록) 위에 이 시험용 한 건을 덮는다
  // (Playwright 는 나중에 건 route 가 먼저 받는다).
  test("/admin/opinions 렌더 + 목록 + 배지", async ({ page }) => {
    await page.route("**/api/admin/opinions*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: 1, kind: "bug", message: "검색이 안 돼요 확인 부탁드려요", page_path: "/search",
              interests: null, user_id: null, user_email: null, user_agent: "UA", status: "new",
              reply: null, replied_at: null, reply_mail_sent: false, is_public: false,
              public_title: null, public_answer: null, published_at: null,
              created_at: "2026-10-06T01:00:00+00:00", updated_at: "2026-10-06T01:00:00+00:00",
            },
          ],
          total: 1,
          page: 1,
          new_count: 1,
        }),
      });
    });
    await page.goto("/admin/opinions");

    await expect(page.getByRole("heading", { name: "의견함", level: 2 })).toBeVisible();
    await expect(page.getByText("/search", { exact: true })).toBeVisible();
    await expect(page.getByText("로그인 안 함")).toBeVisible();
    await expect(page.getByTestId("opinions-badge")).toHaveText("1");
    // 화면 경로는 글자로만 — 링크가 아니다
    await expect(page.locator('main a[href="/search"]')).toHaveCount(0);
  });
});
