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

    // 세션 146: FailureBreakdown 12번째 카드 가시성 회귀 가드
    await expect(page.getByText(/유형별 실패 분포/)).toBeVisible();

    // 세션 398: TrafficCard 가시성 가드 + **촬영 타이밍 경합 차단**.
    // 카드 제목은 로딩 중에도 보이므로 대기 기준이 못 된다. 스켈레톤(h-[160px])이 사라지고
    // **최종 상태로 굳은 시점**을 기다려야 한다 — 그러지 않으면 촬영 중 높이가 바뀌어
    // "Failed to take two consecutive stable screenshots"(3339→3642→3498px)로 실패한다.
    //
    // ⚠ 최종 상태는 환경에 따라 둘로 갈린다. E2E 는 NEXT_PUBLIC_API_URL=localhost:9999(미기동)라
    //    조회가 실패해 **에러 문구**로 굳고, 실제 운영에서는 **표 헤더**로 굳는다.
    //    그래서 한쪽만 기다리면(처음엔 "속도(중간)"만 기다렸다) CI 에서 element not found 로 죽는다.
    //    둘 중 먼저 나타나는 것을 기다린다. 선례 = 세션 396 PR #483(/admin/data).
    await expect(page.getByText("트래픽 (요청 수 · 방문자 · 속도 · 오류)")).toBeVisible();
    await expect(
      page.getByText("속도(중간)").or(page.getByText(/트래픽 통계를 불러오지 못했습니다/)),
    ).toBeVisible();

    // 시각 회귀: chromium-{platform} 별 baseline 자동 생성 (e2e/admin-dashboard.spec.ts-snapshots/)
    await expect(page).toHaveScreenshot("admin-dashboard.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
