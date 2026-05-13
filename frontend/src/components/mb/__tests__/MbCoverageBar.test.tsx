import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MbCoverageBar } from "../MbCoverageBar";

function getInnerBar(container: HTMLElement) {
  return container.querySelector('[role="progressbar"] > div') as HTMLElement;
}

describe("MbCoverageBar", () => {
  it("null 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbCoverageBar value={null} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("undefined 시 '-' 표시", () => {
    const { container } = render(<MbCoverageBar value={undefined} />);
    expect(container.textContent).toContain("-");
  });
  it("NaN 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbCoverageBar value={NaN} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("0% (DB 최솟값, 쾌적)", () => {
    const { container } = render(<MbCoverageBar value={0} />);
    expect(screen.getByText("0.0%")).toBeInTheDocument();
    expect(screen.getByText("쾌적")).toBeInTheDocument();
    expect(getInnerBar(container).style.width).toBe("0%");
  });
  it("음수(-5) 시 widthPct 0% 클램프 (쾌적 라벨)", () => {
    const { container } = render(<MbCoverageBar value={-5} />);
    expect(getInnerBar(container).style.width).toBe("0%");
    expect(screen.getByText("쾌적")).toBeInTheDocument();
  });
  it("46% (DB 분포 p50, 쾌적)", () => {
    render(<MbCoverageBar value={46} />);
    expect(screen.getByText("쾌적")).toBeInTheDocument();
  });
  it("50% (경계 → 쾌적, p50 근처 상한)", () => {
    render(<MbCoverageBar value={50} />);
    expect(screen.getByText("쾌적")).toBeInTheDocument();
  });
  it("50.1% (경계 → 보통)", () => {
    render(<MbCoverageBar value={50.1} />);
    expect(screen.getByText("보통")).toBeInTheDocument();
  });
  it("65% (경계 → 보통, p95 근처 상한)", () => {
    render(<MbCoverageBar value={65} />);
    expect(screen.getByText("보통")).toBeInTheDocument();
  });
  it("68% (DB 분포 p95, 고밀) → widthPct 85%", () => {
    const { container } = render(<MbCoverageBar value={68} />);
    expect(screen.getByText("고밀")).toBeInTheDocument();
    expect(getInnerBar(container).style.width).toBe("85%");
  });
  it("80% (캡 경계, DB max 79 + 여유) → widthPct 100%", () => {
    const { container } = render(<MbCoverageBar value={80} />);
    expect(getInnerBar(container).style.width).toBe("100%");
  });
  it("90% (캡 초과) → widthPct 100% 유지 + aria-valuenow 90 + aria-valuemax 80", () => {
    const { container } = render(<MbCoverageBar value={90} />);
    expect(getInnerBar(container).style.width).toBe("100%");
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute("aria-valuenow")).toBe("90");
    expect(bar.getAttribute("aria-valuemax")).toBe("80");
  });
});
