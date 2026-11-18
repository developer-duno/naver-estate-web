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

    // useCrawlAction onMutate (L189-193) 가 setCrawling(true) + 메시지를
    // 깜빡 띄운 직후 cached 응답 onSuccess (L195-204) 에서 false 로 복귀.
    // 한 프레임 mismatch 가 networkidle 직후 스크린샷에 잡혀 진행 한 줄(CrawlMessage)이
    // 박혀 들어가는 비결정성이 있어, 시작 문구가 사라질 때까지 명시 대기 (세션 447 문구 변경 —
    // 낡은 자료면 "저장된 자료가 오래됐어요 · 네이버에서 지금 매물 받는 중" 이라 부분 일치로 잡는다).
    await expect(page.getByText("네이버에서 지금 매물 받는 중")).toHaveCount(0);

    // Header role 결정: Supabase user_profiles 응답이 admin 으로 들어와야 "관리자"
    // 뱃지(banner [ref=e8] 영역)가 렌더. 응답이 늦으면 spec 이 public 헤더로 찍힘.
    await expect(page.getByText("관리자", { exact: true })).toBeVisible({ timeout: 10_000 });

    await page.waitForLoadState("networkidle");

    // 중개사 작업 화면이 굳은 시점(세션 524 B40 PR 1 보완) — 위 단지명 heading 은 서버 h1(띠)이라 처음부터 보여 대기 기준이 못 된다.
    // 승인 판정 전 로딩(「단지 정보를 불러오는 중...」 · 높이 +552px 안팎)이 networkidle 뒤에도 0.2~1초 남아 fullPage 높이가
    // 1804 → 1613 으로 바뀌는 것을 로컬 3/3 회 실측(CI run 44230335653 재시도 1596 → 1804 → 1596 과 같은 흔들림).
    // 로딩 분기와 대시보드는 같이 그려지지 않으므로 대시보드가 보이고 로딩 글자가 0 이면 최종 상태다.
    await expect(page.getByLabel("단지 종합 대시보드")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("단지 정보를 불러오는 중...")).toHaveCount(0);

    await expect(page).toHaveScreenshot("complex.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
