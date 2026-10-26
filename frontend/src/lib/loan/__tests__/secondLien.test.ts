/**
 * 담보 여력 참고 계산 경계(세션 482 PR 1b, 설계 L3·S4 · 보완 F1 두 모드)
 * - own(이미 가진 집 · 생활안정자금): LTV 70/40% × 담보 − 선순위 − 보증금, 수도권·규제지역이면 최대 1억, 지방은 상한 없음,
 *   15억·25억 가격별 한도와 수도권 구입 6억은 쓰지 않음(금융위 2025-06-28 시행 · 10·15 FAQ 3-1)
 * - buy(무주택 구입): calcLTV(6·4·2억 캡) − 보증금, 선순위는 빼지 않음
 */
import { describe, expect, it } from "vitest";
import { LIVING_FUND_CAP_METRO, maxPrincipalForAnnualPayment } from "../loanRules";
import { livingFundCapApplies, secondLienLimit } from "../secondLien";

const own = { mode: "own" as const, price: 15700, zone: "normal" as const, sido: "대전" };
const buy = { ...own, mode: "buy" as const };

describe("secondLienLimit — 이미 가진 집(own)", () => {
  it("설계 예시 — 6139 59㎡ 유성구 비규제·지방 70% = 1억 990만 · 선순위 5,000만 → 약 5,990만(1억 상한 없음)", () => {
    const r = secondLienLimit({ ...own, firstLien: 5000 });
    expect(r.regionLimit).toBe(10990);
    expect(r.afterLiens).toBe(5990);
    expect(r.livingFundCap).toBeNull();
    expect(r.available).toBe(5990);
    expect(r.loan).toBe(5990);
    expect(r.incomeSkip).toBe("no-income");
    expect(r.monthly).toBeNull();
  });

  it("설계 예시 — 서울 규제 집값 10억 · 40% = 4억 − 선순위 2억 = 2억 → 1억 상한 → 1억", () => {
    const r = secondLienLimit({ mode: "own", price: 100000, zone: "overheated", sido: "서울특별시", firstLien: 20000 });
    expect(r.regionLimit).toBe(40000);
    expect(r.afterLiens).toBe(20000);
    expect(r.livingFundCap).toBe(LIVING_FUND_CAP_METRO);
    expect(LIVING_FUND_CAP_METRO).toBe(10000);
    expect(r.available).toBe(10000);
    expect(r.loan).toBe(10000);
  });

  it("상한 아래면 그대로 — 서울 규제 3억 · 40% = 1억 2,000만 − 선순위 5,000만 = 7,000만", () => {
    expect(secondLienLimit({ mode: "own", price: 30000, zone: "overheated", sido: "서울", firstLien: 5000 }).available).toBe(7000);
  });

  it("가격별 한도(15억 초과 4억)는 쓰지 않는다 — 서울 16억 규제 40% = 6억 4,000만, 상한 1억", () => {
    const r = secondLienLimit({ mode: "own", price: 160000, zone: "overheated", sido: "서울" });
    expect(r.regionLimit).toBe(64000);
    expect(r.available).toBe(10000);
  });

  it("수도권 비규제도 1억 상한 · 구입 6억 캡은 쓰지 않는다 — 경기도 10억 70% = 7억 → 1억", () => {
    const r = secondLienLimit({ mode: "own", price: 100000, zone: "normal", sido: "경기도" });
    expect(r.regionLimit).toBe(70000);
    expect(r.livingFundCap).toBe(10000);
    expect(r.available).toBe(10000);
  });

  it("지방은 상한 없음 — 부산 10억 비규제 70% = 7억 그대로", () => {
    const r = secondLienLimit({ mode: "own", price: 100000, zone: "normal", sido: "부산광역시" });
    expect(r.livingFundCap).toBeNull();
    expect(r.available).toBe(70000);
  });

  it("상한 판정 — 수도권이거나 규제지역이면 걸린다 · 지방 구역 모름은 안 걸린다", () => {
    expect(livingFundCapApplies("overheated", "대전")).toBe(true);
    expect(livingFundCapApplies("normal", "인천광역시")).toBe(true);
    expect(livingFundCapApplies(null, "서울시")).toBe(true);
    expect(livingFundCapApplies("normal", "대전")).toBe(false);
    expect(livingFundCapApplies(null, "대전")).toBe(false);
  });

  it("선순위가 한도보다 크면 추가 가능 0 · 임차보증금도 뺀다", () => {
    expect(secondLienLimit({ ...own, firstLien: 20000 }).available).toBe(0);
    expect(secondLienLimit({ ...own, firstLien: 5000, deposit: 3000 }).available).toBe(2990);
  });

  it("구역 모름(null) = 비규제로 셈", () => {
    expect(secondLienLimit({ ...own, zone: null }).regionLimit).toBe(10990);
  });
});

describe("secondLienLimit — 이 집을 사려고(buy)", () => {
  it("6139 사려는 집 — 1억 990만 · 선순위는 빼지 않는다", () => {
    const r = secondLienLimit({ ...buy, firstLien: 5000 });
    expect(r.regionLimit).toBe(10990);
    expect(r.available).toBe(10990);
    expect(r.livingFundCap).toBeNull();
  });

  it("세낀 매매 — 임차보증금은 뺀다", () => {
    expect(secondLienLimit({ ...buy, deposit: 3000 }).available).toBe(7990);
  });

  it("규제 16억 — 캡 4억, 수도권 서울특별시 표기여도 · 1억 상한 없음", () => {
    const r = secondLienLimit({ mode: "buy", price: 160000, zone: "overheated", sido: "서울특별시" });
    expect(r.regionLimit).toBe(40000);
    expect(r.available).toBe(40000);
  });

  it("수도권 비규제 — 경기도 표기도 6억 캡", () => {
    expect(secondLienLimit({ mode: "buy", price: 100000, zone: "normal", sido: "경기도" }).regionLimit).toBe(60000);
  });
});

describe("secondLienLimit — 소득 기준(두 모드 공통)", () => {
  it("소득 없음 skip · 금리 없음 skip", () => {
    expect(secondLienLimit({ ...own, ratePct: 4 }).incomeSkip).toBe("no-income");
    const r = secondLienLimit({ ...own, income: 5000 });
    expect(r.incomeSkip).toBe("no-rate");
    expect(r.incomeLimit).toBeNull();
    expect(r.stressRate).toBeNull();
  });

  it("소득 기준이 더 작으면 그 값 — 지방 비규제 가산 0.75 · 기존 상환 뺌", () => {
    const r = secondLienLimit({ ...own, income: 1000, existingMonthly: 10, ratePct: 4 });
    expect(r.stressRate).toBe(4.75);
    const want = maxPrincipalForAnnualPayment(1000 * 0.4 - 120, 4.75, 30);
    expect(r.incomeLimit).toBe(want);
    expect(want).toBeLessThan(10990);
    expect(r.loan).toBe(want);
    expect(r.monthly).toBeGreaterThan(0);
  });

  it("담보 기준이 더 작으면 그 값 — 수도권 가산 3.0", () => {
    const r = secondLienLimit({ mode: "own", price: 50000, zone: "normal", sido: "인천", firstLien: 30000, income: 20000, ratePct: 4 });
    expect(r.stressRate).toBe(7);
    expect(r.available).toBe(5000);
    expect(r.loan).toBe(5000);
  });

  it("1억 상한 뒤 값과 소득 기준 중 작은 값 — 서울 규제 10억 · 소득 충분", () => {
    const r = secondLienLimit({ mode: "own", price: 100000, zone: "overheated", sido: "서울", income: 50000, ratePct: 4 });
    expect(r.incomeLimit).toBeGreaterThan(10000);
    expect(r.loan).toBe(10000);
  });

  it("0 이하·NaN 입력은 입력 안 함", () => {
    const r = secondLienLimit({ ...own, firstLien: -1, deposit: Number.NaN, income: 0, ratePct: -2 });
    expect(r.available).toBe(10990);
    expect(r.incomeSkip).toBe("no-income");
  });
});
