import { test, expect } from "@playwright/test";
import { applyPublicMocks } from "./fixtures/public-mocks";

test.describe("public visual regression", () => {
  test("로그인 페이지 렌더 + 시각 회귀", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
    await expect(page.locator("#login-email")).toBeVisible();
    await expect(page.locator("#login-password")).toBeVisible();
    await expect(page.getByRole("button", { name: "로그인" })).toBeVisible();

    await expect(page).toHaveScreenshot("login.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });

  test("홈 페이지 렌더 + 시각 회귀", async ({ page }) => {
    await applyPublicMocks(page);
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /공인중개사.*분석 도구/ })).toBeVisible();
    await expect(page.getByText("단지", { exact: true })).toBeVisible();
    await expect(page.getByText("매물", { exact: true })).toBeVisible();

    await expect(page).toHaveScreenshot("home.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });

  /**
   * 헤더 전용 좁은 스냅샷 (세션 400 신설) — 왜 페이지 전체가 아니라 헤더만 따로 찍는가.
   *
   * 기존 19장은 전부 `fullPage` + `maxDiffPixelRatio: 0.02`(비율) 이다. 비율 임계는
   * **프레임 면적에 비례**하므로, 전 페이지가 공유하는 얇은 헤더 띠(1280×57 = fullPage 의
   * 1.5~6.8%)에서 메뉴 하나가 사라져도 diff 는 4,300~8,400px = 전체의 0.1~0.8% 밖에 안 돼
   * **2% 임계에 구조적으로 안 걸린다**(19장 PNG IHDR 실측). 실제로 "요금제" 메뉴 제거가
   * 어느 장에서도 빨강을 만들지 못했다. 그래서 헤더만 잘라 **분모를 작게** 만든 프레임에서
   * 절대 픽셀(maxDiffPixels)로 본다 — 메뉴 1개 변경이 프레임의 약 6% 라 확실히 잡힌다.
   *
   * 범위를 이 한 장으로 한정한 이유:
   *   - 관리자 헤더 = admin fullPage 5장이 이미 로그인 상태 헤더를 담고 있고, 전문가·구독
   *     배지가 계정 상태에 따라 흔들려(비결정) 전용 스냅샷을 두면 flaky 가 된다.
   *   - 모바일 헤더 = `hidden md:flex` 라 nav 자체가 렌더되지 않고 닫힌 햄버거뿐이다.
   *     열린 드로어의 링크 집합은 Header.test.tsx(DOM 레인)가 집합 동일성으로 본다.
   *
   * 뷰포트는 이 spec 이 setViewportSize 를 쓰지 않으므로 public-visual 프로젝트 기본
   * 1280×720 — md(768px) 이상이라 데스크톱 nav 가 보인다.
   */
  test("헤더 시각 회귀 — 비로그인 데스크톱 (좁은 프레임, 메뉴 1개 변경도 감지)", async ({ page }) => {
    await applyPublicMocks(page);
    await page.goto("/blog"); // 정적 페이지, 활성 메뉴 있음, 배너/토스트 없음

    // /blog 목록엔 header 가 하나뿐 — .first() 는 향후 두 번째 header 가 생겨도
    // 셀렉터가 strict mode 위반으로 죽지 않게 하는 방어.
    const header = page.locator("header").first();

    // hydration 전이(mounted 전 80×34 placeholder → getSession 후 "로그인" 링크)가
    // baseline 으로 굳지 않도록 최종 상태를 기다린다(Header.tsx `mounted` 게이트).
    await expect(header.getByRole("link", { name: "로그인" })).toBeVisible();
    await expect(header.getByRole("link", { name: "블로그" })).toBeVisible();

    await expect(header).toHaveScreenshot("header-public-desktop.png", {
      // 절대 픽셀 — 안티앨리어싱 완충용. 전역 maxDiffPixelRatio 0.02 와는 Math.min 으로
      // 합성되므로(coreBundle padImageToSize 경로) 실효 임계는 min(100, 1280×57×0.02) = 100.
      maxDiffPixels: 100,
      animations: "disabled",
    });
  });
});
