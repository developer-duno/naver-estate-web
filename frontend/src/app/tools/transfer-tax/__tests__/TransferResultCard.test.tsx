import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import TransferResultCard from "@/app/tools/transfer-tax/TransferResultCard";
import type { TransferResult } from "@/lib/transfer-tax";

function buildTestResult(over: Partial<TransferResult>): TransferResult {
  return {
    branch: "general", gain: 100_000_000, taxableGain: 100_000_000,
    longTermDeduction: 0, taxBase: 100_000_000,
    baseTax: 1_000_000, surchargeTax: 0, totalTax: 1_000_000, effectiveRate: 0.01,
    appliedTable: "none", appliedRate: 0.06, notes: ["disclaimer"], ...over,
  };
}

describe("TransferResultCard 본세 라벨 사유 prefix (R11+R12 정정)", () => {
  it("R11 미등기 → '본세 (미등기 70%)'", () => {
    render(<TransferResultCard result={buildTestResult({
      branch: "unregistered", appliedRate: 0.70, notes: ["disclaimer", "unregistered-70"],
    })} />);
    expect(screen.getByText(/본세 \(미등기 70%\)/)).toBeInTheDocument();
  });

  it("R11 단기 1년 미만 → '본세 (단기 70%)'", () => {
    render(<TransferResultCard result={buildTestResult({
      appliedRate: 0.70, notes: ["disclaimer", "short-term-70"],
    })} />);
    expect(screen.getByText(/본세 \(단기 70%\)/)).toBeInTheDocument();
  });

  it("R11 단기 1~2년 → '본세 (단기 60%)'", () => {
    render(<TransferResultCard result={buildTestResult({
      appliedRate: 0.60, notes: ["disclaimer", "short-term-60"],
    })} />);
    expect(screen.getByText(/본세 \(단기 60%\)/)).toBeInTheDocument();
  });

  it("R11 다주택 중과 → '본세 (중과 30%)'", () => {
    render(<TransferResultCard result={buildTestResult({
      appliedRate: 0.30, notes: ["disclaimer", "multi-heavy-applied"],
    })} />);
    expect(screen.getByText(/본세 \(중과 30%\)/)).toBeInTheDocument();
  });

  it("R12 누진 일반 24% → '본세 (24%)' (정수 % 생략)", () => {
    render(<TransferResultCard result={buildTestResult({ appliedRate: 0.24 })} />);
    expect(screen.getByText(/본세 \(24%\)/)).toBeInTheDocument();
  });

  it("R12 누진 일반 42% → '본세 (42%)' (R12 fix 핵심 케이스)", () => {
    render(<TransferResultCard result={buildTestResult({ appliedRate: 0.42 })} />);
    expect(screen.getByText(/본세 \(42%\)/)).toBeInTheDocument();
  });

  it("R11 단기+중과 동시 (#8) → '본세 (단기 70%)' (단기 prefix 우선)", () => {
    render(<TransferResultCard result={buildTestResult({
      appliedRate: 0.70, notes: ["disclaimer", "short-term-70", "multi-heavy-applied"],
    })} />);
    expect(screen.getByText(/본세 \(단기 70%\)/)).toBeInTheDocument();
    expect(screen.queryByText(/본세 \(중과/)).not.toBeInTheDocument();
  });
});
