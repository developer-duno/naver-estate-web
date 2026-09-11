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

    // 세션 398: TrafficCard 가시성 + **촬영 타이밍 경합 차단**.
    // 카드 제목은 로딩 중에도 보이므로 대기 기준이 못 된다 — 스켈레톤(h-[160px])이 사라지고
    // 데이터가 그려진 시점(표 헤더)을 기다려야 촬영 중 높이가 안 바뀐다.
    // mock(admin-mocks.ts)이 항상 200 을 주므로 정상 경로만 기다리면 된다.
    await expect(page.getByText("트래픽 (요청 수 · 방문자 · 속도 · 오류)")).toBeVisible();
    await expect(page.getByText("속도(중간)")).toBeVisible();

    // 시각 회귀: chromium-{platform} 별 baseline 자동 생성 (e2e/admin-dashboard.spec.ts-snapshots/)
    //
    // ⚠ TrafficCard 는 `admin-mocks.ts` 의 `/api/admin/traffic` mock 으로 **고정**한다(세션 398).
    //    mock 없이 두면 React Query 기본 retry(3회) 동안 로딩 스켈레톤(h-[160px]) → 에러 문구(짧음)로
    //    바뀌는 타이밍에 따라 fullPage 높이가 3642 / 3498px 로 갈려 간헐 실패한다.
    //
    //    ⛔ **mask 로는 이 문제가 안 풀린다** — mask 는 그 영역 픽셀만 덮을 뿐 **fullPage 높이 자체를
    //       고정하지 못한다.** Playwright 는 크기가 다르면 작은 쪽을 패딩한 뒤 그 패딩 영역을
    //       diff 로 세므로(coreBundle padImageToSize), 3498 baseline 에 3642 가 오면
    //       184,320/4,661,760 = **비율 0.0395 로 임계 0.02 를 초과해 실패**한다.
    //       (세션 398 에서 mask 로 "해결했다"고 잘못 보고했다가 적대검증이 실험으로 반증)
    await expect(page).toHaveScreenshot("admin-dashboard.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
