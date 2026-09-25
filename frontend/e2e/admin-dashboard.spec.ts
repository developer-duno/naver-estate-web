import { test, expect } from "@playwright/test";
import { applyAdminMocks } from "./fixtures/admin-mocks";

test.describe("admin dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await applyAdminMocks(page);
  });

  test("메인 대시보드 렌더 + 핵심 카드 가시성", async ({ page }) => {
    await page.goto("/admin");

    await expect(page.getByRole("heading", { name: "대시보드" })).toBeVisible();

    // 세션 419: 대시보드를 세로 4층으로 재배치 — 대기 조건도 새 배치 기준으로.
    // ⚠ 카드 제목은 로딩 중에도 보이므로 대기 기준이 못 된다(세션 398 교훈) — 각 층에서
    //    **데이터가 그려진 뒤에만 나오는 글자**를 기다려야 촬영 중 높이가 안 바뀐다.

    // 1층 지금 상태 — 실행 중 작업 mock(admin-mocks.ts mockRunningCrawlJobs)이 그려진 시점
    await expect(page.getByText("지금 상태")).toBeVisible();
    await expect(page.getByText("오늘 데이터 상태:")).toBeVisible();
    await expect(page.getByText("지금 돌아가는 작업 1건")).toBeVisible();
    await expect(page.getByText("500건 중 120건 처리")).toBeVisible();
    await expect(page.getByText(/이번 주 챙길 일 \d+건/)).toBeVisible();

    // 2층 숫자 (compact 4칸) + 공공데이터 하루 사용량 — 라벨이 아니라 값을 기다린다.
    // "1,234" 는 단지 수(mockDetailedStats)와 오늘 사용량(mockQuotaStatus) 두 곳 — 둘 다 그려져야 2개.
    await expect(page.getByText("단지 수")).toBeVisible();
    await expect(page.getByText("오늘 수집")).toBeVisible();
    await expect(page.getByText("공공데이터 하루 사용량")).toBeVisible();
    await expect(page.getByText("1,234", { exact: true })).toHaveCount(2);
    await expect(page.getByText(/남은 호출/)).toBeVisible();

    // 3층 원인 — 접힌 절 5개. **열지 않고 촬영한다**: 접힌 동안 안쪽 카드를 그리지도 부르지도
    // 않으므로(AdminSection), 옛 TrafficCard 스켈레톤→표 전환 같은 높이 흔들림이 원천 차단된다.
    // (세션 51 NaverCallsCard·세션 146 FailureBreakdown·세션 398 TrafficCard 가시성 가드는
    //  카드가 접힌 절 안으로 들어가 단위 테스트(각 카드 테스트 + page.test.tsx)로 옮겼다.)
    for (const title of [
      "자동 작업 현황",
      "데이터 신선도",
      "실패 자세히 (최근 24시간)",
      "네이버 호출 횟수",
      "방문·요청 통계",
    ]) {
      await expect(page.getByText(title, { exact: true })).toBeVisible();
    }
    await expect(page.getByText(/펼치기/)).toHaveCount(5);

    // 4층 작업 + 최근 활동 (감사 로그 mock 이 그려진 시점)
    await expect(page.getByText("외부 데이터 지금 받아오기")).toBeVisible();
    await expect(page.getByText("최근 활동")).toBeVisible();
    // 감사 로그 mock 5건이 그려진 시점 (라벨 문구는 admin-labels 사전 소관이라 건수로 본다)
    await expect(
      page
        .getByRole("heading", { name: "최근 활동" })
        .locator("xpath=ancestor::div[contains(@class, 'rounded-lg')][1]")
        .locator("li"),
    ).toHaveCount(5);

    // 시각 회귀: chromium-{platform} 별 baseline 자동 생성 (e2e/admin-dashboard.spec.ts-snapshots/)
    //
    // ⚠ TrafficCard 는 `admin-mocks.ts` 의 `/api/admin/traffic` mock 으로 **고정**한다(세션 398).
    //    (세션 419 부터 TrafficCard 는 접힌 절 안이라 이 촬영엔 안 그려지지만, 절을 기본으로
    //     펼치게 바꾸면 아래 사연이 그대로 되살아나므로 mock 과 기록은 남겨 둔다.)
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
