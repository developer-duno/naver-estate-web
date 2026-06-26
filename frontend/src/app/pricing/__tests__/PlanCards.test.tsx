/**
 * PlanCards 가격 표시 + BE 금액 정합 가드 (세션 326).
 *
 * 사장님 확정 가격: 월 10,000원(원가 100,000 90%↓) / 연 100,000원(원가 1,000,000 90%↓) / 기본=무료체험.
 *
 * ⚠ 정합 SSOT: FE 표시 할인가(price) 는 BE config/plans.py PLAN_PRICES[planKey].amount 와 일치해야 한다
 * (사용자가 보는 가격 = 실제 청구가). BE-FE 물리 분리라 자동 import 불가 → 아래 EXPECTED 상수에 BE 값을
 * 박제하고 화면 렌더 결과와 대조한다. plans.py amount 변경 시 본 테스트 EXPECTED + PlanCards price 양쪽 갱신.
 * (domain-mapping-ssot.md 짝꿍 패턴 답습)
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// CheckoutButton 은 useCheckout(useQueryClient)·useSessionToken 의존 — 가격 표시 테스트엔 불필요.
// 버튼 자체 동작은 CheckoutButton.test.tsx 가 담당하므로 여기선 free 여부만 확인 가능한 stub 으로 대체.
vi.mock("../CheckoutButton", () => ({
  default: ({ free }: { free?: boolean }) => (
    <a href="/signup">{free ? "무료 체험 시작" : "결제하고 시작"}</a>
  ),
}));

import PlanCards from "../PlanCards";

// BE config/plans.py PLAN_PRICES amount 와 짝꿍 (수동 동기화 — 변경 시 양쪽).
const EXPECTED = {
  pro_30d: { amount: 10_000, original: 100_000 },
  pro_365d: { amount: 100_000, original: 1_000_000 },
};

describe("PlanCards 가격 표시", () => {
  it("기본 플랜은 '무료' + 7일 무료 안내 + 무료 체험 버튼", () => {
    render(<PlanCards />);
    expect(screen.getByText("기본")).toBeInTheDocument();
    expect(screen.getByText("무료")).toBeInTheDocument();
    expect(screen.getByText(/카드 등록 시 7일 무료/)).toBeInTheDocument();
  });

  it("월간: 할인가 ₩10,000 + 원가 줄긋기 ₩100,000 (line-through)", () => {
    const { container } = render(<PlanCards />);
    expect(screen.getByText("월간")).toBeInTheDocument();
    // 할인가 (BE amount 와 일치) — /월 라벨이 별도 span 이라 부분 매칭
    const amounts = screen.getAllByText(
      (_, el) => el?.textContent?.replace(/\s/g, "") === `₩${EXPECTED.pro_30d.amount.toLocaleString("ko-KR")}/월`,
    );
    expect(amounts.length).toBeGreaterThanOrEqual(1);
    // 원가 줄긋기 — line-through 클래스로 특정 (월간 100,000 vs 연간 할인가 100,000 충돌 회피)
    const strikethrough = container.querySelectorAll("p.line-through");
    const texts = Array.from(strikethrough).map((e) => e.textContent?.replace(/\s/g, ""));
    expect(texts).toContain(`₩${EXPECTED.pro_30d.original.toLocaleString("ko-KR")}`);
  });

  it("연간: 원가 줄긋기 ₩1,000,000 (line-through)", () => {
    const { container } = render(<PlanCards />);
    expect(screen.getByText("연간")).toBeInTheDocument();
    const strikethrough = container.querySelectorAll("p.line-through");
    const texts = Array.from(strikethrough).map((e) => e.textContent?.replace(/\s/g, ""));
    expect(texts).toContain(`₩${EXPECTED.pro_365d.original.toLocaleString("ko-KR")}`);
  });

  it("90% 할인 배지가 유료 플랜에 노출된다", () => {
    render(<PlanCards />);
    // 월간·연간 2개
    expect(screen.getAllByText("90% 할인")).toHaveLength(2);
  });

  it("연간 할인가(100,000)는 월간×12(120,000)보다 저렴해 연간 유인이 있다", () => {
    // 가격 정책 회귀 가드 — 연간이 월간 12개월보다 비싸지면 안 됨
    expect(EXPECTED.pro_365d.amount).toBeLessThan(EXPECTED.pro_30d.amount * 12);
  });
});
