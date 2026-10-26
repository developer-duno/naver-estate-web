/** 담보 여력 참고 계산 경계(세션 482 PR 1b, 설계 L3·S4) */
import { describe, expect, it } from "vitest";
import { maxPrincipalForAnnualPayment } from "../loanRules";
import { secondLienLimit } from "../secondLien";

const base = { price: 15700, zone: "normal" as const, sido: "대전" };

describe("secondLienLimit", () => {
  it("설계 예시 — 유성구 비규제 70% = 1억 990만 · 선순위 5,000만 → 약 5,990만", () => {
    const r = secondLienLimit({ ...base, firstLien: 5000 });
    expect(r.regionLimit).toBe(10990);
    expect(r.afterLiens).toBe(5990);
    expect(r.loan).toBe(5990);
    expect(r.incomeSkip).toBe("no-income");
    expect(r.monthly).toBeNull();
  });

  it("선순위가 한도보다 크면 추가 가능 0", () => {
    const r = secondLienLimit({ ...base, firstLien: 20000 });
    expect(r.afterLiens).toBe(0);
    expect(r.loan).toBe(0);
  });

  it("임차보증금도 뺀다", () => {
    expect(secondLienLimit({ ...base, firstLien: 5000, deposit: 3000 }).afterLiens).toBe(2990);
  });

  it("규제 16억 — 캡 4억, 수도권 서울특별시 표기여도", () => {
    const r = secondLienLimit({ price: 160000, zone: "overheated", sido: "서울특별시" });
    expect(r.regionLimit).toBe(40000);
  });

  it("구역 모름(null) = 비규제로 셈", () => {
    expect(secondLienLimit({ ...base, zone: null }).regionLimit).toBe(10990);
  });

  it("수도권 비규제 — 서울시 표기도 6억 캡", () => {
    expect(secondLienLimit({ price: 100000, zone: "normal", sido: "경기도" }).regionLimit).toBe(60000);
  });

  it("소득 없음 skip · 금리 없음 skip", () => {
    expect(secondLienLimit({ ...base, ratePct: 4 }).incomeSkip).toBe("no-income");
    const r = secondLienLimit({ ...base, income: 5000 });
    expect(r.incomeSkip).toBe("no-rate");
    expect(r.incomeLimit).toBeNull();
    expect(r.stressRate).toBeNull();
  });

  it("소득 기준이 더 작으면 그 값 — 지방 비규제 가산 0.75 · 기존 상환 뺌", () => {
    const r = secondLienLimit({ ...base, income: 1000, existingMonthly: 10, ratePct: 4 });
    expect(r.stressRate).toBe(4.75);
    const want = maxPrincipalForAnnualPayment(1000 * 0.4 - 120, 4.75, 30);
    expect(r.incomeLimit).toBe(want);
    expect(want).toBeLessThan(10990);
    expect(r.loan).toBe(want);
    expect(r.monthly).toBeGreaterThan(0);
  });

  it("담보 기준이 더 작으면 그 값 — 수도권 가산 3.0", () => {
    const r = secondLienLimit({ price: 50000, zone: "normal", sido: "인천", firstLien: 30000, income: 20000, ratePct: 4 });
    expect(r.stressRate).toBe(7);
    expect(r.afterLiens).toBe(5000);
    expect(r.loan).toBe(5000);
  });

  it("0 이하·NaN 입력은 입력 안 함", () => {
    const r = secondLienLimit({ ...base, firstLien: -1, deposit: Number.NaN, income: 0, ratePct: -2 });
    expect(r.afterLiens).toBe(10990);
    expect(r.incomeSkip).toBe("no-income");
  });
});
