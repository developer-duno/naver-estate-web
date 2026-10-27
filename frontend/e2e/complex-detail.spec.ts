/**
 * E2E: 단지 상세 페이지
 * 실행: npx playwright test e2e/complex-detail.spec.ts
 */
import { test, expect } from "@playwright/test";

test("단지 상세 페이지 접근 시 크래시 없음 — 비로그인도 로그인 화면으로 보내지 않는다 (세션 481)", async ({ page }) => {
  const res = await page.goto("/complex/12345");
  // 세션 481 공개 전환: 로그인 벽(307 → /login)을 걷었다 — 비로그인도 단지 화면이 200 으로 열린다
  expect(res?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/complex/12345");
  await expect(page.locator("header")).toBeVisible();
});

test("존재하지 않는 단지 · 숫자 아닌 번호 = 404 (세션 483 PR 3b — 서버 렌더 notFound)", async ({ page }) => {
  for (const no of ["99999999", "abc"]) {
    const res = await page.goto(`/complex/${no}`);
    // 운영 빌드(next start·Vercel ISR)는 다 그린 뒤 보내 404. e2e 의 dev 서버는 흘려 보내기(스트리밍)라 상태가 200 으로
    // 먼저 나가고 Next 가 noindex 를 붙인다(공식 not-found 문서 "Calling notFound() after streaming has started") —
    // 그래서 여기선 "404 이거나, 200 이면 noindex + 찾을 수 없음 화면"으로 본다. 운영 404 는 빌드 실측으로 확인했다.
    const status = res?.status();
    expect([404, 200], no).toContain(status);
    if (status === 200) {
      await expect(page.locator('meta[name="robots"][content*="noindex"]').first(), no).toHaveCount(1);
    }
    await expect(page.getByRole("heading", { name: "페이지를 찾을 수 없습니다" })).toBeVisible();
    await expect(page.locator("header")).toBeVisible();
  }
});

test("서버가 그린 첫 HTML — h1 단지명 1개 · title · canonical 자기 주소 · noindex(등급 B)", async ({ request }) => {
  const res = await request.get("/complex/200000");
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
  expect(html).toContain("<title>거래적은단지 공시가격·관리비 | 2u부동산</title>");
  expect(html).toMatch(/<link rel="canonical" href="[^"]*\/complex\/200000"/);
  expect(html).toMatch(/<meta name="robots" content="noindex, follow"/);
  expect(html).toContain("한눈에 보기");
});

test("엑셀 내보내기 버튼 — 페이지 크래시 없이 로드", async ({ page }) => {
  await page.goto("/complex/12345");
  await page.waitForLoadState("networkidle");
  // 페이지가 정상 로드되면 테스트 통과
  await expect(page.locator("header")).toBeVisible();
});

/**
 * 비로그인 소비자 화면 — 최근 6개월 거래가 없는 단지(약 80%)에서도 대출 카드가 보이고 2년 범위로 집값을 채운다
 * (세션 482 PR 1b 보완 F2·F5·F8, 결정 12). 서버는 page.route 로 대신 답한다(가짜 자료).
 */
test("비로그인 — 6개월 거래 없는 단지도 질문 4개 · 대출 카드는 2년 범위 · 필터·갱신·엑셀 없음 · 잠금 카드 1장", async ({ page }) => {
  await page.route("**/api/complexes/**", async (route) => {
    const sub = new URL(route.request().url()).pathname.split("/").filter(Boolean)[3];
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (!sub) {
      return json({
        complex_no: "200000", complex_name: "거래적은단지", cortar_no: "3020012300", real_estate_type_code: "APT",
        real_estate_type_name: "아파트", sido: "대전", sigungu: "유성구", rep_area_m2: 59,
        area_prices: [{ area_m2: 59, households: 80, price_median: null, trade_count: null, price_min: null, price_max: null, trades: [] }],
      });
    }
    if (sub === "public-price-history") {
      return json({
        area_m2: 59,
        months: [{ month: "202512", trade_count: 1, price_min: 14700, price_max: 14700, price_median: 14700 }],
        two_year: { min: 14700, max: 20000, count: 2 },
        basis: "최근 2년 전용 59㎡ 대 정부 실거래 최저~최고(달마다 직거래 제외) · 국토교통부 실거래",
      });
    }
    if (sub === "region-trend") {
      return json({ region_code: "30200", region_name: "유성구", source: "한국부동산원 전국주택가격동향조사", items: [{ period: "202609", jeonse_ratio: 69.5, sale_price_median: 40600 }] });
    }
    if (sub === "official-prices") return json({ complex_no: "200000", year: null, items: [] });
    if (sub === "subway") return json({ stations: [{ station_name: "갑천", lines: ["대전1호선"], distance_m: 1100 }] });
    if (sub === "kapt" || sub === "neighborhood") return json({ detail: "없음" }, 404);
    return json({ detail: "인증이 필요합니다" }, 401);
  });
  await page.route("**/api/live/**", (route) => route.fulfill({ status: 401, body: "{}" }));

  const res = await page.goto("/complex/200000");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "거래적은단지" })).toBeVisible({ timeout: 10_000 });
  for (const title of ["1 · 얼마짜리 집인가", "2 · 어떻게 변해 왔나", "3 · 주변은 어떤가", "4 · 내 돈으로 가능한가"]) {
    await expect(page.getByRole("heading", { name: new RegExp(`^${title}`) })).toBeVisible();
  }
  await expect(page.getByText("최근 6개월 거래 없음 · 2년 범위 1억 4,700만~2억")).toBeVisible();
  await expect(page.getByRole("button", { name: "보수적 1억 4,700만" })).toBeVisible();
  await expect(page.getByRole("button", { name: "이미 가진 집으로" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/로그인하면 볼 수 있어요/)).toHaveCount(1);
  await expect(page.getByText(/필터 접기|필터 펼치기/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "데이터 갱신" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "엑셀 내보내기" })).toHaveCount(0);
});

// 정보 위계 순서 회귀 가드는 page-level vitest 로 이관:
// frontend/src/app/complex/[no]/__tests__/page-hierarchy.test.tsx
// e2e 환경은 BE 단지 데이터 의존이라 ComplexLoadState 상태에 머물 수 있어 부적합.
