/**
 * E2E: /tools/transfer-tax 양도소득세 계산기 회귀 가드 (8 케이스, 6 분기 커버)
 * 실행: PLAYWRIGHT_PORT=3100 npx playwright test e2e/transfer-tax-flow.spec.ts --project=public
 *
 * 데스크톱 nav 의존 — 뷰포트 ≥768px 필수 (public project Chromium 기본 1280×720)
 * 박제 케이스 = src/lib/__tests__/transfer-tax.test.ts L85-235 의 #1/#2/#6/#10/#11
 */
import { test, expect, type Page } from "@playwright/test";
import { expectHeader } from "./helpers";

interface BaseInputs {
  transfer: number;
  acquisition: number;
  expenses: number;
  acqDate: string;
  transferDate: string;
  lived: number;
  houses: 1 | 2 | 3;
}

async function fillBaseInputs(page: Page, opts: BaseInputs) {
  await page.getByLabel("양도가액 (만원)").fill(String(opts.transfer));
  await page.getByLabel("취득가액 (만원)").fill(String(opts.acquisition));
  await page.getByLabel("필요경비 (만원)").fill(String(opts.expenses));
  await page.locator("#acquisitionDate").fill(opts.acqDate);
  await page.locator("#transferDate").fill(opts.transferDate);
  await page.getByLabel("거주연수").fill(String(opts.lived));
  if (opts.houses !== 1) {
    await page.getByRole("radio", { name: opts.houses === 2 ? "2주택" : "3주택 이상" }).check();
  }
}

// ── 케이스 1: 페이지 진입 + Hero ──
test("페이지 진입 + Hero 검증", async ({ page }) => {
  await page.goto("/tools/transfer-tax");
  await expectHeader(page);
  await expect(page.getByRole("heading", { name: "양도소득세 계산기", level: 1 })).toBeVisible();
  await expect(page.getByText(/표준 계산 참고치/)).toBeVisible();
});

// ── 케이스 2: 헤더 → 양도세 메뉴 진입 (데스크톱 nav 의존) ──
test("헤더 도구 메뉴 → 양도소득세 진입", async ({ page }) => {
  await page.goto("/");
  // Header.tsx L174 onClick 토글 — hover X. menuitem 은 메뉴 열림 후 DOM 추가
  await page.getByRole("button", { name: /계산기/ }).click();
  await page.getByRole("menuitem", { name: "양도소득세" }).click();
  await expect(page).toHaveURL(/\/tools\/transfer-tax$/);
});

// ── 케이스 3: 빈 입력 → empty branch ──
test("빈 입력 시 입력값 부족 안내 + 본세 표 미표시", async ({ page }) => {
  await page.goto("/tools/transfer-tax");
  await expect(page.getByText("입력값이 부족합니다 (양도가액·취득가액 필요)")).toBeVisible();
  await expect(page.locator("table")).toHaveCount(0);
});

// ── 케이스 4: #1 1세대1주택 비과세 (totalTax=0) ──
test("#1 1세대1주택 비과세 충족 → 산출세액 0원", async ({ page }) => {
  await page.goto("/tools/transfer-tax");
  await fillBaseInputs(page, {
    transfer: 80000, acquisition: 50000, expenses: 2000,
    acqDate: "2021-01-01", transferDate: "2026-04-01",
    lived: 3, houses: 1,
  });
  await page.getByRole("checkbox", { name: /취득시 조정대상지역/ }).check();
  // 분기 라벨: ", 산출세액 0원" 포함
  await expect(page.getByText("1세대1주택 비과세 충족, 산출세액 0원")).toBeVisible();
  // Notices title — exact:true 로 분기 라벨과 substring 충돌 회피
  await expect(page.getByText("1세대1주택 비과세 충족", { exact: true })).toBeVisible();
});

// ── 케이스 5: #2 12억 초과 안분 (12,456,000원, 핵심) ──
test("#2 12억 초과 안분 → 12,456,000원", async ({ page }) => {
  await page.goto("/tools/transfer-tax");
  await fillBaseInputs(page, {
    transfer: 150000, acquisition: 50000, expenses: 2000,
    acqDate: "2014-04-01", transferDate: "2026-04-01",
    lived: 5, houses: 1,
  });
  await page.getByRole("checkbox", { name: /취득시 조정대상지역/ }).check();
  await expect(page.getByText("12억 초과 안분 + 표2 장특공")).toBeVisible();
  // ResultCard L46 본세 표 td + L51 산출세액 박스 양쪽에 동일 금액 → .first()
  await expect(page.getByText("12,456,000원").first()).toBeVisible();
  await expect(page.getByText("12억 초과 안분 적용")).toBeVisible();
  await expect(page.getByText("지방소득세 별도 안내")).toBeVisible();
});

// ── 케이스 6: #6 다주택 중과 (390,310,000원, transferDate=한시배제 종료 후) ──
test("#6 다주택 중과 한시배제 종료 후 → 390,310,000원", async ({ page }) => {
  await page.goto("/tools/transfer-tax");
  await fillBaseInputs(page, {
    transfer: 120000, acquisition: 50000, expenses: 1000,
    acqDate: "2021-04-01", transferDate: "2026-05-10",
    lived: 3, houses: 2,
  });
  // TransferInputs L140 disabled={houses === 1} — houses=2 변경 후 enabled 풀림 race 가드
  await expect(page.getByRole("checkbox", { name: /양도시 조정대상지역/ })).toBeEnabled();
  await page.getByRole("checkbox", { name: /양도시 조정대상지역/ }).check();
  await expect(page.getByText("일반 양도소득세 (표1 장특공 + 누진세율)")).toBeVisible();
  await expect(page.getByText("390,310,000원").first()).toBeVisible();
  await expect(page.getByText("⚠ 다주택 중과 적용")).toBeVisible();
});

// ── 케이스 7: #11 미등기 단일 70% (343,000,000원) ──
test("#11 미등기 양도 70% 단일세율 → 343,000,000원", async ({ page }) => {
  await page.goto("/tools/transfer-tax");
  await fillBaseInputs(page, {
    transfer: 100000, acquisition: 50000, expenses: 1000,
    acqDate: "2021-04-01", transferDate: "2026-04-01",
    lived: 3, houses: 1,
  });
  await page.getByRole("checkbox", { name: "미등기 양도" }).check();
  // 분기 라벨 = "분기: 미등기 양도 — 70% 단일세율 적용". 입력 박스 경고도 같은 substring → "분기: " prefix 로 한정
  await expect(page.getByText("분기: 미등기 양도 — 70% 단일세율 적용")).toBeVisible();
  await expect(page.getByText("343,000,000원").first()).toBeVisible();
  await expect(page.getByText("⚠ 미등기 양도 형사책임")).toBeVisible();
});

// ── 케이스 8: #10 양도차손 → loss + Notices 회귀 ──
test("#10 양도차손 → 산출세액 0원 + Notices 회귀", async ({ page }) => {
  await page.goto("/tools/transfer-tax");
  await fillBaseInputs(page, {
    transfer: 50000, acquisition: 55000, expenses: 1000,
    acqDate: "2021-04-01", transferDate: "2026-04-01",
    lived: 3, houses: 1,
  });
  await expect(page.getByText("양도차손 발생, 산출세액 0원")).toBeVisible();
  // lossBranch L23 notes = ["disclaimer", "out-of-scope", "loss-no-tax"]
  await expect(page.getByText("적용 범위 안내")).toBeVisible();
  // exact:true 로 분기 라벨의 ", 산출세액 0원" 충돌 회피
  await expect(page.getByText("양도차손 발생", { exact: true })).toBeVisible();
});
