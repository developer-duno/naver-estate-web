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
  // strict mode 회피: "분기:" prefix 로 ResultCard 분기 라벨만 한정 (세션 100 답습)
  await expect(page.getByText(/분기: 1세대1주택자.*공제 12억/)).toBeVisible();
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

// ── 케이스 7: B-2 합산배제 (3주택 중 1채 임대) ──
// PropertyTaxAdvancedFields details/summary 펼친 후 합산배제 select 1 선택
test("B-2 합산배제 (3주택 중 1채 임대) → exclusion-applied notice + effectiveHouses 반영", async ({ page }) => {
  await page.goto("/tools/property-tax");
  await fillBaseInputs(page, { publishedManwon: 300_000, houses: 3 });
  // 고급 옵션 details 펼치기
  await page.getByText(/고급 옵션.*합산배제.*공동명의.*법인/).click();
  // 합산배제 select 1채 선택
  await page.getByLabel(/합산배제 신청 주택 수/).selectOption("1");
  // Notices 라벨 (고유 단어 "합산배제 신청 주택 반영")
  await expect(page.getByText(/합산배제 신청 주택 반영/)).toBeVisible();
});

// ── 케이스 8: B-3 공동명의 (1세대1주택 + 50%) ──
// ownership input 50 입력 시 종부세 7.5억 < 12억 공제 → 종부세 0
test("B-3 공동명의 (1세대1주택 + 50%) → ownership-applied + warning notice", async ({ page }) => {
  await page.goto("/tools/property-tax");
  await fillBaseInputs(page, {
    publishedManwon: 150_000, houses: 1, isSingleHouseEligible: true,
  });
  await page.getByText(/고급 옵션.*합산배제.*공동명의.*법인/).click();
  // ownership 50% 입력
  await page.getByLabel(/공동명의 본인 지분/).fill("50");
  // Notices 라벨 (고유 단어 "공동명의 본인 지분 반영")
  await expect(page.getByText(/공동명의 본인 지분 반영/)).toBeVisible();
  // single-house-warning 도 표시
  await expect(page.getByText(/공동명의.*1세대1주택 자격.*명의자별 독립 자격/)).toBeVisible();
});

// ── 케이스 9: B-4 법인 (2주택 단일세율 2.7%) ──
test("B-4 법인 (2주택 단일세율) → corporation 분기 + 단일세율 라벨", async ({ page }) => {
  await page.goto("/tools/property-tax");
  await fillBaseInputs(page, { publishedManwon: 150_000, houses: 2 });
  await page.getByText(/고급 옵션.*합산배제.*공동명의.*법인/).click();
  // 법인 토글 켜기 (Advanced 영역 안의 체크박스)
  await page.getByRole("checkbox", { name: /법인 보유.*단일세율.*공제.*차단/ }).check();
  // ResultCard BRANCH_TEXT["corporation"] 라벨 (strict mode prefix "분기:" 한정)
  await expect(page.getByText(/분기: 법인 보유.*단일세율 2\.7%.*5\.0%.*공제 없음/)).toBeVisible();
  // Notices "법인 단일세율 적용"
  await expect(page.getByText(/법인 단일세율 적용/)).toBeVisible();
});

// ── 케이스 10: B-5 부부 공동명의 1주택자 특례 (12억 공제 + 세액공제 80%) ──
// 공시 15억 + 1주택 + 1세대1주택자 + 부부 토글 ON + 70세 + 15년 → 1.8억 과표 + 80% 세액공제
test("B-5 부부 공동명의 1주택자 특례 (15억 + 70세 + 15년) → single-house 분기 + 12억 공제 + 1인 합산 + 세액공제 표시", async ({ page }) => {
  await page.goto("/tools/property-tax");
  await fillBaseInputs(page, {
    publishedManwon: 150_000,
    houses: 1,
    isSingleHouseEligible: true,
    ageYears: 70,
    holdYears: 15,
  });
  await page.getByText(/고급 옵션.*합산배제.*공동명의.*법인/).click();
  // 부부 공동명의 1주택자 특례 토글 켜기
  await page.getByRole("checkbox", { name: /부부 공동명의 1주택자 특례/ }).check();
  // strict mode 회피: "분기:" prefix 로 ResultCard 분기 라벨만 한정 (세션 100 답습)
  await expect(page.getByText(/분기: 1세대1주택자.*공제 12억/)).toBeVisible();
  // 입력값 표시 행 (B2 ResultCard) — 토글 라벨 "특례 신청" 과 충돌 회피로 "적용 \(1인 합산 12억 공제\)" 정확 매칭
  await expect(page.getByText("부부 공동명의 1주택자 특례 적용 (1인 합산 12억 공제)")).toBeVisible();
  // Notices 신규 키 title 정확 매칭 (ResultCard 표시 행 "...특례 적용 (1인 합산 12억 공제)" 와 분리)
  await expect(page.getByText("부부 공동명의 1주택자 특례 적용", { exact: true })).toBeVisible();
  // 세액공제 행 표시 (80% = 72만)
  await expect(page.getByText(/세액공제 \(연령\+보유\)/)).toBeVisible();
});

// ── 케이스 11: PDF #12 5종 특례주택 (1주택 15억 + 일시적2주택 5억 → 안분 0.75) ──
// 공시 15억 + 1주택 + 1세대1주택자 + 일시적2주택 1채(5억) → 12억 공제 + 안분 비율 적용
test("PDF #12 5종 특례주택 (1주택 15억 + 일시적2주택 1채 5억) → 12억 공제 + 안분 비율 + ResultCard 표시", async ({ page }) => {
  await page.goto("/tools/property-tax");
  await fillBaseInputs(page, {
    publishedManwon: 150_000,
    houses: 1,
    isSingleHouseEligible: true,
    ageYears: 65,
    holdYears: 10,
  });
  await page.getByText(/고급 옵션.*합산배제.*공동명의.*법인/).click();
  // 5종 자격 안내 nested details 펼치기 (R1 답습 — strict mode 회피로 정확 라벨 매칭)
  await page.getByText(/5종 자격 안내 펼치기/).click();
  // PDF 본문 인용 노출 검증
  await expect(page.getByText(/① 일시적2주택.*신규주택 취득일 ≤3년/)).toBeVisible();
  // 일시적2주택 채수 select = 1
  await page.getByLabel("① 일시적2주택 (신규주택) 채수").selectOption("1");
  // 일시적2주택 합계 공시가 = 50,000만원 (5억)
  await page.getByLabel("① 일시적2주택 (신규주택) 합계 공시가 (만원)").fill("50000");
  // ResultCard 표시 행: "1세대1주택 5종 특례주택 적용:" + 카테고리 표시
  await expect(page.getByText(/1세대1주택 5종 특례주택 적용:/)).toBeVisible();
  await expect(page.getByText(/① 일시적2주택: 1채 \/ 합계 공시가 50,000만원/)).toBeVisible();
  // 안분 비율 안내
  await expect(page.getByText(/안분 비율 적용.*산출세액.*1주택 비율.*공제율/)).toBeVisible();
  // Notices 신규 special-houses-applied title 표시
  await expect(page.getByText("1세대1주택 5종 특례주택 자격 적용", { exact: true })).toBeVisible();
});
