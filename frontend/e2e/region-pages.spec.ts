/**
 * 지역 장(세션 484 PR 3c-1b) — 서버 렌더(ISR) 허브·동 장이 열리고, 모양이 틀린 주소는 404, 전국 목록에 시군구 링크가 있다.
 * 재료 = 가짜 API 서버(fixtures/fake-api-server.mjs + region-mocks.mjs, 단지 이름 가짜). 시각 사진은 찍지 않는다(재촬영은 CI).
 * project = public(기본 testIgnore 에 없음).
 */
import { test, expect } from "@playwright/test";

test.describe("지역 장", () => {
  test("시군구 허브 — 200 · h1 하나 · 동 칩 · 동 묶음 12곳 + 전체 링크", async ({ page }) => {
    const res = await page.goto("/region/30200");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1, name: "대전 유성구 아파트 실거래가·공시가격" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "유성구 동 목록" }).locator("a")).toHaveCount(2);
    await expect(page.locator('section[id="3020011800"] tbody tr')).toHaveCount(12);
    await expect(page.getByRole("link", { name: "봉명동 단지 전체 13곳 →" })).toHaveAttribute("href", "/region/30200/3020011800");
    await expect(page.locator('section[id="3020012300"] tbody tr')).toHaveCount(2);
  });

  test("동 장 — 200 · h1 하나 · 단지 13곳 · 동네 정보 카드", async ({ page }) => {
    const res = await page.goto("/region/30200/3020011800");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1, name: "대전 유성구 봉명동 아파트 실거래가·공시가격" })).toBeVisible();
    await expect(page.locator("table tbody tr")).toHaveCount(13);
    await expect(page.getByTestId("dong-neighborhood-card")).toHaveCount(1);
  });

  test("모양이 틀린 주소 = 404", async ({ page }) => {
    for (const p of ["/region/abc", "/region/30200/abc"]) {
      const res = await page.goto(p);
      expect(res?.status(), p).toBe(404);
    }
  });

  test("전국 목록 — 시군구 링크 1개 이상(허브로)", async ({ page }) => {
    const res = await page.goto("/region");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    expect(await page.locator('a[href^="/region/"]').count()).toBeGreaterThan(0);
    await expect(page.locator('a[href="/region/30200"]').first()).toBeVisible();
  });
});
