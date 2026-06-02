import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import TransferResultCard from "@/app/tools/transfer-tax/TransferResultCard";
import type { TransferResult } from "@/lib/transfer-tax";

// CopyButton 이 쓰는 sonner 토스트 모킹 (Toaster 미마운트)
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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

describe("TransferResultCard R15: 비과세/양도차손 본세 라벨 명확화", () => {
  it("비과세 (single-house-exempt) → '본세 (비과세)' (rate% 표시 안 함)", () => {
    render(<TransferResultCard result={buildTestResult({
      branch: "single-house-exempt", gain: 100_000_000, taxableGain: 0, taxBase: 0,
      baseTax: 0, totalTax: 0, appliedRate: 0,
      notes: ["disclaimer", "single-house-exempt-met"],
    })} />);
    expect(screen.getByText("본세 (비과세)")).toBeInTheDocument();
    expect(screen.queryByText(/본세 \(0%\)/)).not.toBeInTheDocument();
  });

  it("양도차손 (loss) → '본세 (양도차손)' (rate% 표시 안 함)", () => {
    render(<TransferResultCard result={buildTestResult({
      branch: "loss", gain: -50_000_000, taxableGain: 0, taxBase: 0,
      baseTax: 0, totalTax: 0, appliedRate: 0,
      notes: ["disclaimer", "out-of-scope", "loss-no-tax"],
    })} />);
    expect(screen.getByText("본세 (양도차손)")).toBeInTheDocument();
    expect(screen.queryByText(/본세 \(0%\)/)).not.toBeInTheDocument();
  });
});

describe("TransferResultCard R13: 단기+중과 동시 케이스 가산세 별도 행", () => {
  it("surchargeTax > 0 → '가산세 (중과 분)' 행 표시", () => {
    render(<TransferResultCard result={buildTestResult({
      appliedRate: 0.70, baseTax: 341_600_000, surchargeTax: 146_400_000, totalTax: 341_600_000,
      notes: ["disclaimer", "short-term-70", "multi-heavy-applied"],
    })} />);
    expect(screen.getByText("가산세 (중과 분)")).toBeInTheDocument();
    expect(screen.getByText("146,400,000원")).toBeInTheDocument();
  });

  it("surchargeTax = 0 → 가산세 행 숨김 (일반 누진 케이스)", () => {
    render(<TransferResultCard result={buildTestResult({ surchargeTax: 0 })} />);
    expect(screen.queryByText("가산세 (중과 분)")).not.toBeInTheDocument();
  });
});

describe("TransferResultCard 결과 복사 버튼 (세션 265)", () => {
  it("복사 버튼이 렌더되고 클릭 시 산출세액 + 참고용 면책을 복사한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true, writable: true });
    render(<TransferResultCard result={buildTestResult({ totalTax: 1_000_000 })} />);

    const btn = screen.getByRole("button", { name: "양도세 결과 복사" });
    fireEvent.click(btn);

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain("1,000,000원");
    // 면책 문구 누락 방지 가드 (사용자 명시 요구)
    expect(copied).toContain("참고용");
  });
});
