import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import PropertyTaxResultCard from "@/app/tools/property-tax/PropertyTaxResultCard";
import type { PropertyTaxResult } from "@/lib/property-tax-types";

// 테스트 데이터 팩토리 (testing.md 룰 — 하드코딩 금지)
function buildTestResult(over: Partial<PropertyTaxResult>): PropertyTaxResult {
  return {
    branch: "single-house",
    propertyTaxBase: 600_000_000, propertyTax: 1_000_000,
    comprehensiveDeduction: 1_200_000_000, comprehensiveTaxBase: 0,
    comprehensiveTaxBeforeDeduction: 0, comprehensiveTaxCredit: 0, comprehensiveTax: 0,
    totalTax: 1_000_000, ruralTax: 0, grandTotal: 1_000_000,
    uncappedGrandTotal: 1_000_000, wasCapped: false,
    effectiveRate: 0.001,
    appliedRate: { property: 0.0035, comprehensive: 0, propertyFairMarketRatio: 0.6 },
    notes: ["disclaimer"], ...over,
  };
}

describe("PropertyTaxResultCard 분기별 라벨 (4분기 × 누진세율 표기)", () => {
  it("empty 분기 → 표 미렌더 + 안내문만 (공시가격을 입력하세요)", () => {
    render(<PropertyTaxResultCard result={buildTestResult({
      branch: "empty",
      propertyTaxBase: 0, propertyTax: 0, comprehensiveDeduction: 0,
      totalTax: 0, grandTotal: 0,
      appliedRate: { property: 0, comprehensive: 0, propertyFairMarketRatio: 0.6 },
    })} />);
    expect(screen.getByText(/공시가격을 입력하세요/)).toBeInTheDocument();
    // 표 자체 미렌더 — 재산세 라벨 0건
    expect(screen.queryByText(/재산세 \(/)).not.toBeInTheDocument();
  });

  it("below-threshold 분기 → 종부세 (공제 미만) 회색 표기", () => {
    render(<PropertyTaxResultCard result={buildTestResult({
      branch: "below-threshold",
      appliedRate: { property: 0.001, comprehensive: 0, propertyFairMarketRatio: 0.6 },
    })} />);
    expect(screen.getByText(/종부세 과세표준 0/)).toBeInTheDocument();
    expect(screen.getByText(/종부세 \(공제 미만\)/)).toBeInTheDocument();
    expect(screen.getByText(/재산세 \(0.1%\)/)).toBeInTheDocument();
  });

  it("single-house 분기 + 세액공제 → 세액공제 행 표시 + grandTotal 강조", () => {
    render(<PropertyTaxResultCard result={buildTestResult({
      branch: "single-house",
      comprehensiveTaxBeforeDeduction: 5_000_000,
      comprehensiveTaxCredit: 2_000_000,
      comprehensiveTax: 3_000_000,
      ruralTax: 600_000,
      totalTax: 4_000_000, grandTotal: 4_600_000,
      appliedRate: { property: 0.0035, comprehensive: 0.005, propertyFairMarketRatio: 0.6 },
    })} />);
    expect(screen.getByText(/1세대1주택자/)).toBeInTheDocument();
    expect(screen.getByText(/세액공제 \(연령\+보유\)/)).toBeInTheDocument();
    expect(screen.getByText(/-2,000,000원/)).toBeInTheDocument();
    expect(screen.getByText(/4,600,000원/)).toBeInTheDocument();
    expect(screen.getByText(/농특세 \(종부세 × 20%\)/)).toBeInTheDocument();
  });

  it("multi-house 분기 + 농특세 표시 (3주택+ 25억 초과 중과)", () => {
    render(<PropertyTaxResultCard result={buildTestResult({
      branch: "multi-house",
      propertyTax: 5_000_000,
      comprehensiveTax: 30_000_000, ruralTax: 6_000_000,
      totalTax: 35_000_000, grandTotal: 41_000_000,
      appliedRate: { property: 0.004, comprehensive: 0.027, propertyFairMarketRatio: 0.6 },
      notes: ["disclaimer", "general-deduction-9e", "multi-heavy-25e"],
    })} />);
    expect(screen.getByText(/다주택자/)).toBeInTheDocument();
    expect(screen.getByText(/재산세 \(0.4%\)/)).toBeInTheDocument();
    expect(screen.getByText(/종부세 \(2.7%\)/)).toBeInTheDocument();
    expect(screen.getByText(/41,000,000원/)).toBeInTheDocument();
    expect(screen.getByText(/3주택 이상.*25억 초과.*중과/)).toBeInTheDocument();
  });

  it("ruralTax === 0 시 농특세 행 hidden (4행 → 3행)", () => {
    render(<PropertyTaxResultCard result={buildTestResult({
      branch: "below-threshold", ruralTax: 0,
    })} />);
    expect(screen.queryByText(/농특세 \(종부세 × 20%\)/)).not.toBeInTheDocument();
  });

  it("comprehensiveTaxCredit === 0 시 세액공제 행 hidden", () => {
    render(<PropertyTaxResultCard result={buildTestResult({
      comprehensiveTaxCredit: 0,
    })} />);
    expect(screen.queryByText(/세액공제 \(연령\+보유\)/)).not.toBeInTheDocument();
  });

  it("R12 답습 — appliedRate 0 fallback 정상 (NaN 회피)", () => {
    render(<PropertyTaxResultCard result={buildTestResult({
      appliedRate: { property: 0, comprehensive: 0, propertyFairMarketRatio: 0.6 },
    })} />);
    expect(screen.getByText(/재산세 \(공제 미만\)/)).toBeInTheDocument();
    expect(screen.getByText(/종부세 \(공제 미만\)/)).toBeInTheDocument();
  });

  it("세부담 상한 150% 미반영 안내 — Notices 통해 표시 (notes 에 키 포함 시)", () => {
    // 황색 박스는 ResultCard 본체에서 빠지고 Notices 컴포넌트로 위임됨
    render(<PropertyTaxResultCard result={buildTestResult({
      notes: ["disclaimer", "tax-burden-cap-150"],
    })} />);
    expect(screen.getByText(/세부담 상한 150% 미반영/)).toBeInTheDocument();
  });

  it("wasCapped=true → 총 부담 박스에 'cap 적용' + 원본 표시", () => {
    render(<PropertyTaxResultCard result={buildTestResult({
      branch: "single-house",
      grandTotal: 1_500_000,
      uncappedGrandTotal: 5_000_000,
      wasCapped: true,
      notes: ["disclaimer", "tax-burden-cap-applied"],
    })} />);
    expect(screen.getByText(/세부담 상한 150% cap 적용/)).toBeInTheDocument();
    expect(screen.getByText(/5,000,000원/)).toBeInTheDocument(); // 원본
  });

  it("wasCapped=false → 'cap 적용' 표시 미렌더 (cap 발동 안 함)", () => {
    render(<PropertyTaxResultCard result={buildTestResult({
      branch: "single-house",
      grandTotal: 1_000_000,
      uncappedGrandTotal: 1_000_000,
      wasCapped: false,
    })} />);
    expect(screen.queryByText(/세부담 상한 150% cap 적용/)).not.toBeInTheDocument();
  });
});
