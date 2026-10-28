import { test, expect } from "@playwright/test";
import { applyPublicMocks } from "./fixtures/public-mocks";

/**
 * 비로그인 단지 화면 (세션 481 공개 전환 → 세션 482 PR 1b 소비자 화면 「C 질문형」) — 시각 회귀 장 아님(스크린샷 없음).
 * 단지 상세는 BE 가 비로그인 응답에서 네이버 재료 칸을 뺀 모양으로, 공개 자료(공개 가격 기록·지역 흐름·공시가격·
 * 관리비·지하철·동네)는 200, 매물·평형·호가·그래프는 401 로 mock.
 * 기대(휴대폰 390 · 데스크톱 1280): 로그인 화면으로 튕기지 않고 200 · 질문 4개 제목 · 필터 바·데이터 갱신·엑셀 없음 ·
 * 맨 아래 잠금 카드 1장.
 */
const PUBLIC_OK: Record<string, unknown> = {
  "public-price-history": {
    area_m2: 59,
    months: [{ month: "202606", trade_count: 2, price_min: 15700, price_max: 17200, price_median: 16500 }],
    two_year: { min: 14700, max: 20000, count: 12 },
    basis: "최근 2년 전용 59㎡ 대 정부 실거래 최저~최고(달마다 직거래 제외) · 국토교통부 실거래",
  },
  "region-trend": {
    region_code: "30200", region_name: "유성구", source: "한국부동산원 전국주택가격동향조사",
    items: [
      { period: "202410", jeonse_ratio: 69.2, sale_price_median: 40000 },
      { period: "202609", jeonse_ratio: 69.5, sale_price_median: 40600 },
    ],
  },
  "official-prices": { complex_no: "100001", year: "2026", items: [{ prvuse_ar: 59.9, price_median: 113000000, ho_count: 116 }] },
  subway: { stations: [{ station_name: "갑천", lines: ["대전1호선"], distance_m: 1100 }] },
};

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
  test.describe(`비로그인 단지 화면 ${viewport.width}px (세션 482)`, () => {
    test.use({ viewport });

    test("/complex/<no> 200 · 질문 4개 · 필터·갱신·엑셀 없음 · 잠금 카드 1장", async ({ page }) => {
      await page.route("**/api/complexes/**", async (route) => {
        const sub = new URL(route.request().url()).pathname.split("/").filter(Boolean)[3];
        if (!sub) {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              complex_no: "100001",
              complex_name: "공개단지",
              cortar_no: "3020012300",
              real_estate_type_name: "아파트",
              sido: "대전",
              sigungu: "유성구",
              cortar_address: "대전 유성구 봉명동",
              total_household_count: 199,
              total_dong_count: 1,
              rep_area_m2: 59,
              // 거래 3줄 — 휴대폰 390px 에서 4열 거래 표가 가로로 넘치지 않는지까지 본다(보완 F8)
              area_prices: [
                {
                  area_m2: 59, households: 116, price_median: 17200, trade_count: 3, price_min: 15700, price_max: 18000,
                  trades: [
                    { price: 18000, date: "2026-07-21", floor: 15, direct: false },
                    { price: 17200, date: "2026-06-03", floor: 7, direct: false },
                    { price: 15700, date: "2026-05-11", floor: 2, direct: true },
                  ],
                },
              ],
            }),
          });
        }
        if (sub in PUBLIC_OK) {
          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PUBLIC_OK[sub]) });
        }
        if (sub === "kapt" || sub === "neighborhood") {
          return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "없음" }) });
        }
        return route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ detail: "인증이 필요합니다" }),
        });
      });
      await page.route("**/api/live/**", (route) => route.fulfill({ status: 401, body: "{}" }));

      // 세션 483 PR 3b: 서버 렌더 — 단지명 h1·'한눈에 보기'는 가짜 API 서버(fixtures/public-summary-mocks.mjs "100001")가 준다
      const res = await page.goto("/complex/100001");

      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: "공개단지" })).toBeVisible({ timeout: 10_000 });
      await expect(page.locator("h1")).toHaveCount(1);
      for (const title of ["1 · 얼마짜리 집인가", "2 · 어떻게 변해 왔나", "3 · 주변은 어떤가", "4 · 내 돈으로 가능한가"]) {
        await expect(page.getByRole("heading", { name: new RegExp(`^${title}`) })).toBeVisible();
      }
      // 범위 숫자는 서버 '한눈에 보기' 표로(결정 23) — 카드 1 은 막대·2년 최저/최고 + 지금 있는 거래 목록 표
      await expect(page.getByTestId("glance-areas").locator("tbody tr")).toHaveCount(1);
      await expect(page.getByTestId("glance-areas")).toContainText("1억 5,700만~1억 8,000만");
      await expect(page.getByText("2년 최저 1억 4,700만")).toBeVisible();
      await expect(page.getByTestId("consumer-trades").locator("tbody tr")).toHaveCount(3);
      // 지역 페이지가 열린 뒤(3c-1b) — 빵부스러기 시군구·동(이 단지는 동 페이지 없는 동 → 허브#동)·푸터 입구 등 1개 이상
      expect(await page.locator('a[href^="/region"]').count()).toBeGreaterThan(0);
      await expect(page.locator('a[href="/region/30200#3020012300"]').first()).toBeVisible();
      // 가까운 단지(결정 27) — 가짜 API 서버가 가까운 순 + 거리로 준다
      await expect(page.getByRole("heading", { level: 2, name: "가까운 단지" })).toBeVisible();
      await expect(page.getByTestId("nearby-complexes")).toContainText("320m");
      await expect(page.getByText("지금 나온 매물과 호가는 로그인하면 볼 수 있어요")).toBeVisible();
      await expect(page.getByText(/로그인하면 볼 수 있어요/)).toHaveCount(1);
      await expect(page.getByText(/필터 접기|필터 펼치기/)).toHaveCount(0);
      await expect(page.getByRole("button", { name: "데이터 갱신" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "엑셀 내보내기" })).toHaveCount(0);
      expect(new URL(page.url()).pathname).toBe("/complex/100001");
      // 가로 스크롤 없음(휴대폰 폭에서 카드가 넘치지 않는다) — 페이지 전체와 거래 표 자체 둘 다
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const tableOverflow = await page.getByTestId("consumer-trades").evaluate((t) => {
        const card = t.parentElement as HTMLElement;
        return t.getBoundingClientRect().right - card.getBoundingClientRect().right;
      });
      expect(tableOverflow).toBeLessThanOrEqual(0);
    });
  });
}

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

    // 홈 h1 = "아파트·오피스텔 실거래가·시세 조회"(세션 484 PR 3c-1a, 결정 31)
    await expect(page.getByRole("heading", { name: /아파트.*실거래가.*시세 조회/ })).toBeVisible();
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

/**
 * 의견 보내기 흐름 (세션 433 의견함) — 버튼 → 창 → 보내기 → 쪽지.
 * 서버는 page.route 로 대신 답한다(실제 저장·텔레그램 0). 사진 단언은 하지 않는다.
 * 백엔드 주소가 다른 출처(localhost:9999)라 CORS 사전 요청(OPTIONS)에도 같이 답한다.
 */
test.describe("의견 보내기", () => {
  test("버튼 → 창 → 보내기 → \"보냈어요\" 쪽지 (보낸 본문 확인)", async ({ page }) => {
    await applyPublicMocks(page);
    let posted: Record<string, unknown> | null = null;
    await page.route("**/api/opinions", async (route) => {
      const req = route.request();
      const cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      };
      if (req.method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: cors });
        return;
      }
      posted = req.postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: cors,
        body: JSON.stringify({ id: 1, received: true, can_reply: false }),
      });
    });

    await page.goto("/");
    await page.getByTestId("opinion-button").click();

    const dialog = page.getByRole("dialog", { name: "의견 보내기" });
    await expect(dialog).toBeVisible();
    // 비로그인 안내
    await expect(dialog.getByText(/답장을 받으려면 로그인해 주세요/)).toBeVisible();

    await dialog.getByRole("radio", { name: "버그·오류" }).click();
    await dialog.getByLabel("내용", { exact: true }).fill("검색 결과가 비어 보여요 확인 부탁");
    const submit = dialog.getByTestId("opinion-submit");
    await expect(submit).toBeDisabled(); // 동의 전
    await dialog.getByRole("checkbox", { name: /1년 보관하는 데 동의합니다/ }).click();
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByText("보냈어요. 고맙습니다")).toBeVisible();
    await expect(dialog).toBeHidden();
    expect(posted).toMatchObject({
      kind: "bug",
      message: "검색 결과가 비어 보여요 확인 부탁",
      page_path: "/",
      website: "",
    });
  });
});
