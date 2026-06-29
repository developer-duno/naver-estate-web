import { expect, test } from "@playwright/test";
import { applySearchEmptyMocks } from "./fixtures/search-mocks";

/**
 * 세션 314: 홈/검색 통합으로 /search 는 홈으로 리다이렉트됨. 빈 상태 시각 회귀는
 * public-flow.spec.ts 의 home.png 가 이미 커버(중복 스냅샷 제거). 여기선 홈 빈 상태의
 * 검색 폼 섹션(단지명 검색·지역 선택) 노출만 smoke 로 가드.
 */
test.describe("home search form smoke", () => {
  test("홈 빈 상태 — 검색 폼 섹션 노출", async ({ page }) => {
    await applySearchEmptyMocks(page);
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "단지명 검색" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "지역 선택" })).toBeVisible();

    const sidoInput = page.getByLabel("시/도");
    // 시/도 input enabled 는 /api/regions 응답 → React Query 해소 → 리렌더가 끝나야 풀린다.
    // 같은 파일 14행(heading 대기)·다른 시각회귀 spec 과 동일하게 10초 — CI 부하 시 5초 outlier 가 가장 먼저 깨지던 flaky 해소.
    await expect(sidoInput).toBeVisible({ timeout: 10_000 });
    await expect(sidoInput).toBeEnabled({ timeout: 10_000 });
  });
});
