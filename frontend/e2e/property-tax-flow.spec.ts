/**
 * E2E: /tools/property-tax 보유세 계산기 회귀 가드 (6 케이스, 4분기 커버)
 * 실행: PLAYWRIGHT_PORT=3100 npx playwright test e2e/property-tax-flow.spec.ts --project=public
 *
 * 데스크톱 nav 의존 — 뷰포트 ≥768px 필수 (public project Chromium 기본 1280×720)
 * 박제 케이스 = src/lib/__tests__/property-tax.test.ts 와 ResultCard 분기별 라벨
 */
import { test, expect, type Page } from "@playwright/test";
import { expectHeader } from "./helpers";

interface BaseInputs {
  publishedManwon: number;
  houses: 1 | 2 | 3;
  isSingleHouseEligible?: boolean;
  ageYears?: number;
  holdYears?: number;
}

async function fillBaseInputs(page: Page, opts: BaseInputs) {
  await page.getByLabel("공시가격 (만원)").fill(String(opts.publishedManwon));
  if (opts.houses !== 1) {
    await page.getByRole("radio", { name: opts.houses === 2 ? "2주택" : "3주택 이상" }).check();
  }
  if (opts.isSingleHouseEligible) {
    await page.getByRole("checkbox", { name: /1세대1주택자/ }).check();
    if (opts.ageYears !== undefined) {
      await page.getByLabel("연령 (만 나이)").fill(String(opts.ageYears));
    }
    if (opts.holdYears !== undefined) {
      await page.getByLabel("보유연수").fill(String(opts.holdYears));
    }
  }
}

// ── 케이스 1: 페이지 진입 + Hero ──
test("페이지 진입 + Hero 검증", async ({ page }) => {
  await page.goto("/tools/property-tax");
  await expectHeader(page);
  await expect(
    page.getByRole("heading", { name: /보유세 계산기/, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText(/적용범위.*1세대1주택/)).toBeVisible();
  await expect(page.getByText(/납부 일정.*재산세 7월/)).toBeVisible();
});

// ── 케이스 2: 헤더 → 보유세 메뉴 진입 (데스크톱 nav 의존) ──
test("헤더 도구 메뉴 → 보유세 진입", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /계산기/ }).click();
  await page.getByRole("menuitem", { name: "보유세" }).click();
  await expect(page).toHaveURL(/\/tools\/property-tax$/);
});

// ── 케이스 3: 빈 입력 → empty branch ──
test("빈 입력 시 공시가격 입력 안내 + 표 미렌더", async ({ page }) => {
  await page.goto("/tools/property-tax");
  await expect(page.getByText(/공시가격을 입력하세요/)).toBeVisible();
  // 표 자체 미렌더 (BRANCH_TEXT 안내 박스만)
  await expect(page.locator("table")).toHaveCount(0);
});

// ── 케이스 4: below-threshold 분기 (공시 5억, 1세대1주택 X) ──
// 5억 < 9억 공제 → 종부세 과세표준 0 → 재산세만
test("below-threshold (공시 5억, 다주택 X) → 종부세 0 + 재산세만", async ({ page }) => {
  await page.goto("/tools/property-tax");
  await fillBaseInputs(page, { publishedManwon: 50_000, houses: 1 });
  await expect(page.getByText(/종부세 과세표준 0.*재산세만 부과/)).toBeVisible();
  await expect(page.getByText(/종부세 \(공제 미만\)/)).toBeVisible();
  // 농특세 행은 hidden (ruralTax === 0)
  await expect(page.getByText(/농특세 \(종부세 × 20%\)/)).toHaveCount(0);
});

// ── 케이스 5: single-house 분기 (공시 15억 + 1세대1주택 + 연령 70 + 보유 15) ──
// 15억 - 12억 공제 = 3억 → 종부세 과세표준 1.8억(60%) → 누진세율 + 80% 세액공제
test("single-house (공시 15억 + 1세대1주택 + 70세 + 15년) → 세액공제 표시", async ({ page }) => {
  await page.goto("/tools/property-tax");
  await fillBaseInputs(page, {
    publishedManwon: 150_000,
    houses: 1,
    isSingleHouseEligible: true,
    ageYears: 70,
    holdYears: 15,
  });
  await expect(page.getByText(/1세대1주택자.*공제 12억/)).toBeVisible();
  await expect(page.getByText(/세액공제 \(연령\+보유\)/)).toBeVisible();
  // 농특세 행 표시 (ruralTax > 0)
  await expect(page.getByText(/농특세 \(종부세 × 20%\)/)).toBeVisible();
  await expect(page.getByText(/연령 세액공제 가능/)).toBeVisible();
});

// ── 케이스 6: multi-house 분기 (공시 30억 + 3주택+) ──
// 3주택+ + 25억 초과 → 중과 누진 진입
test("multi-house (공시 30억 + 3주택+) → 다주택 9억 공제 + 25억 초과 중과", async ({ page }) => {
  await page.goto("/tools/property-tax");
  await fillBaseInputs(page, { publishedManwon: 300_000, houses: 3 });
  await expect(page.getByText(/다주택자.*공제 9억.*3주택.*25억 초과/)).toBeVisible();
  await expect(page.getByText(/일반 종부세 공제 9억/)).toBeVisible();
  await expect(page.getByText(/3주택 이상.*25억 초과.*중과/)).toBeVisible();
  // 세부담 상한 150% 황색 박스 항상 표시 (empty 제외)
  await expect(page.getByText(/세부담 상한 150% 미반영/).first()).toBeVisible();
});
