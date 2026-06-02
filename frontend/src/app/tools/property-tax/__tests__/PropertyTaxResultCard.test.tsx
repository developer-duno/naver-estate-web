import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import PropertyTaxResultCard from "@/app/tools/property-tax/PropertyTaxResultCard";
import type { PropertyTaxResult } from "@/lib/property-tax-types";

// CopyButton 이 쓰는 sonner 토스트 모킹 (Toaster 미마운트)
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// 테스트 데이터 팩토리 (testing.md 룰 — 하드코딩 금지)
function buildTestResult(over: Partial<PropertyTaxResult>): PropertyTaxResult {
  return {
    branch: "single-house",
    propertyTaxBase: 600_000_000, propertyTax: 1_000_000,
    comprehensiveDeduction: 1_200_000_000, comprehensiveTaxBase: 0,
    comprehensiveTaxBeforeDeduction: 0, comprehensivePropertyTaxCredit: 0, comprehensiveTaxCredit: 0, comprehensiveTax: 0,
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
    expect(screen.getByText(/재산세 \(공정시장 60% × 0.1%\)/)).toBeInTheDocument();
  });

  it("single-house 분기 + 세액공제 → 세액공제 행 표시 + grandTotal 강조", () => {
    render(<PropertyTaxResultCard result={buildTestResult({
      branch: "single-house",
      comprehensiveTaxBeforeDeduction: 5_000_000, comprehensivePropertyTaxCredit: 0,
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
    expect(screen.getByText(/재산세 \(공정시장 60% × 0.4%\)/)).toBeInTheDocument();
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

  // 세션 264 검증 갭 보강: 법인 분기 종부세 5.0% 라벨 렌더 (단일세율 상한). 기존엔 multi-house 2.7% 만 검증됨.
  it("corporation 분기 + 종부세 5.0% → '종부세 (5%)' 라벨 + 법인 분기 텍스트", () => {
    render(<PropertyTaxResultCard result={buildTestResult({
      branch: "corporation",
      propertyTax: 5_000_000,
      comprehensiveTaxBeforeDeduction: 50_000_000,
      comprehensiveTax: 50_000_000, ruralTax: 10_000_000,
      totalTax: 55_000_000, grandTotal: 65_000_000,
      // 법인 3주택+ 단일세율 5.0% (재산세 일반 0.4% × FMR 60%)
      appliedRate: { property: 0.004, comprehensive: 0.05, propertyFairMarketRatio: 0.6 },
      notes: ["disclaimer", "corporation-flat-rate-applied"],
    })} />);
    // 분기 박스 라벨 (하단 안내문 "법인 보유 주택은..." 과 충돌 회피 위해 정확 매칭)
    expect(screen.getByText("법인 보유 (단일세율 2.7% / 5.0%, 공제 없음)")).toBeInTheDocument();
    // formatPropertyRateLabel: (0.05*100).toFixed(2).replace(/\.?0+$/,"") = "5"
    expect(screen.getByText(/종부세 \(5%\)/)).toBeInTheDocument();
    expect(screen.getByText(/재산세 \(공정시장 60% × 0.4%\)/)).toBeInTheDocument();
  });

  // 세션 264 검증 갭 보강: 1세대1주택 차등 공정시장가액비율 43~45% 라벨 (§109). 기존엔 60% 만 검증됨.
  it("single-house 차등 FMR 43% → '재산세 (공정시장 43% × 0.05%)' 라벨", () => {
    render(<PropertyTaxResultCard result={buildTestResult({
      branch: "single-house",
      // 1주택 특례세율 0.05% (6천만 이하 구간) + 차등 FMR 43% (3억 이하)
      appliedRate: { property: 0.0005, comprehensive: 0, propertyFairMarketRatio: 0.43 },
    })} />);
    // Math.round(0.43*100)=43, (0.0005*100).toFixed(2).replace(/\.?0+$/,"") = "0.05"
    expect(screen.getByText(/재산세 \(공정시장 43% × 0.05%\)/)).toBeInTheDocument();
  });

  it("single-house 차등 FMR 45% → '재산세 (공정시장 45% × ...)' 라벨 (6억 초과)", () => {
    render(<PropertyTaxResultCard result={buildTestResult({
      branch: "single-house",
      appliedRate: { property: 0.0035, comprehensive: 0, propertyFairMarketRatio: 0.45 },
    })} />);
    expect(screen.getByText(/재산세 \(공정시장 45% × 0.35%\)/)).toBeInTheDocument();
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

describe("5종 특례주택 (PDF #12, 세션 112) — ResultCard 표시 행", () => {
  it("specialHouses + special-houses-applied note → '1세대1주택 5종 특례주택 적용:' 헤더 + 채수 표시", () => {
    render(<PropertyTaxResultCard
      result={buildTestResult({ notes: ["disclaimer", "special-houses-applied"] })}
      specialHouses={{ temporary2: { count: 1, publishedAverage: 50_000 } }}
    />);
    expect(screen.getByText(/1세대1주택 5종 특례주택 적용/)).toBeInTheDocument();
    expect(screen.getByText(/① 일시적2주택: 1채 × 평균 공시가 50,000만원 = 합계 50,000만원/)).toBeInTheDocument();
  });

  it("count = 0 카테고리는 미표시 (행 폭증 방지)", () => {
    render(<PropertyTaxResultCard
      result={buildTestResult({ notes: ["disclaimer", "special-houses-applied"] })}
      specialHouses={{
        temporary2: { count: 0, publishedAverage: 0 },
        inherited: { count: 1, publishedAverage: 30_000 },
      }}
    />);
    expect(screen.queryByText(/① 일시적2주택/)).not.toBeInTheDocument();
    expect(screen.getByText(/② 상속주택: 1채 × 평균 공시가 30,000만원 = 합계 30,000만원/)).toBeInTheDocument();
  });

  it("special-houses-credit-prorated note 시 안분 비율 안내 행 표시", () => {
    render(<PropertyTaxResultCard
      result={buildTestResult({ notes: ["disclaimer", "special-houses-applied", "special-houses-credit-prorated"] })}
      specialHouses={{ inherited: { count: 1, publishedAverage: 50_000 } }}
    />);
    // "안분 비율 적용" 은 ResultCard 표시 행 + Notices title 둘 다 매칭 → ResultCard 행만 정확 매칭 (parens 포함)
    expect(screen.getByText(/└ 안분 비율 적용 \(산출세액/)).toBeInTheDocument();
  });

  it("specialHouses 미입력 (회귀 보존) → 5종 표시 행 미렌더", () => {
    render(<PropertyTaxResultCard result={buildTestResult({ notes: ["disclaimer"] })} />);
    expect(screen.queryByText(/5종 특례주택 적용/)).not.toBeInTheDocument();
    expect(screen.queryByText(/① 일시적2주택/)).not.toBeInTheDocument();
  });
});

describe("PropertyTaxResultCard 결과 복사 버튼 (세션 265)", () => {
  it("복사 버튼이 렌더되고 클릭 시 총 부담 + 참고용 면책을 복사한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true, writable: true });
    render(<PropertyTaxResultCard result={buildTestResult({ grandTotal: 1_000_000 })} />);

    fireEvent.click(screen.getByRole("button", { name: "보유세 결과 복사" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain("1,000,000원");
    // 면책 문구 누락 방지 가드 (사용자 명시 요구)
    expect(copied).toContain("참고용");
  });

  it("empty 분기에서는 복사 버튼 미렌더 (결과 박스 자체 없음)", () => {
    render(<PropertyTaxResultCard result={buildTestResult({
      branch: "empty", propertyTax: 0, totalTax: 0, grandTotal: 0,
      appliedRate: { property: 0, comprehensive: 0, propertyFairMarketRatio: 0.6 },
    })} />);
    expect(screen.queryByRole("button", { name: "보유세 결과 복사" })).not.toBeInTheDocument();
  });
});
