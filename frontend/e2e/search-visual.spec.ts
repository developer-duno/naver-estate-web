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

    // 시/도 input 은 "노출"만 확인한다(노출 smoke 목적). enabled 까지 기다리지 않는다 —
    // disabled={loading} 가 풀리려면 /api/regions(mock 200) → React Query 해소 → base-ui Combobox
    // 리렌더가 끝나야 하는데, 이 비동기 타이밍이 CI 부하 시 10초+ 걸려 toBeEnabled 가 flaky 였다.
    // 폼 섹션 노출은 위 heading 2개로 이미 증명됨. enabled 회귀는 RegionSelector 단위테스트 영역.
    await expect(page.getByLabel("시/도")).toBeVisible({ timeout: 10_000 });
  });
});
