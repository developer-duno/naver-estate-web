import { expect, test } from "@playwright/test";
import { applyComplexMocks } from "./fixtures/complex-mocks";

test.describe("complex detail visual regression", () => {
  test("/complex/[no] 단지 상세 페이지 렌더 + 시각 회귀", async ({ page }) => {
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("[DEBUG-16.3] console." + m.type() + ":", m.text().slice(0, 200)); });
    page.on("pageerror", (e) => console.log("[DEBUG-16.3] pageerror:", String(e).slice(0, 200)));
    page.on("response", (r) => { const u = r.url(); if (u.includes("/auth/v1/") || u.includes("/rest/v1/user_profiles") || u.includes("/api/users/me")) console.log("[DEBUG-16.3] resp:", r.status(), u.replace(/\?.*$/, "").slice(0, 110)); });
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
    // 한 프레임 mismatch 가 networkidle 직후 스크린샷에 잡혀 CrawlProgressBanner
    // 가 fallback 분기로 박혀 들어가는 비결정성이 있어, 텍스트가 사라질 때까지 명시 대기.
    await expect(page.getByText("매물 목록 불러오는 중...")).toHaveCount(0);

    // Header role 결정: Supabase user_profiles 응답이 admin 으로 들어와야 "관리자"
    // 뱃지(banner [ref=e8] 영역)가 렌더. 응답이 늦으면 spec 이 public 헤더로 찍힘.
    // ── DEBUG (임시, next 16.3.4 admin E2E 회귀 진단): 세션 인식 상태 덤프 (값 미출력, 이름만) ──
    const probe = await page.evaluate(async () => {
      const cookieNames = document.cookie.split(";").map((c) => c.trim().split("=")[0]).filter(Boolean);
      const lsKeys = Object.keys(localStorage);
      let sessionPresent = "n/a";
      try {
        const mod = await import("@/lib/supabase");
        const sb = mod.createClient();
        const { data } = await sb.auth.getSession();
        sessionPresent = data.session ? `yes(exp=${data.session.expires_at})` : "no";
      } catch (e) {
        sessionPresent = "err:" + String(e).slice(0, 120);
      }
      const headerText = document.querySelector("header, [role=banner]")?.textContent?.slice(0, 120) ?? "(no banner)";
      return { cookieNames, lsKeys, sessionPresent, headerText, ua: navigator.userAgent.slice(0, 40) };
    });
    console.log("[DEBUG-16.3] probe:", JSON.stringify(probe));
    await expect(page.getByText("관리자", { exact: true })).toBeVisible({ timeout: 10_000 });

    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("complex.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
