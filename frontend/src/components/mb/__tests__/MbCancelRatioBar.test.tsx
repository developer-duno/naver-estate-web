import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MbCancelRatioBar } from "../MbCancelRatioBar";

function getInnerBar(container: HTMLElement) {
  return container.querySelector('[role="progressbar"] > div') as HTMLElement;
}

describe("MbCancelRatioBar", () => {
  it("null 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbCancelRatioBar value={null} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("undefined 시 '-' 표시", () => {
    const { container } = render(<MbCancelRatioBar value={undefined} />);
    expect(container.textContent).toContain("-");
  });
  it("NaN 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbCancelRatioBar value={NaN} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("0.0% (최솟값 안전)", () => {
    const { container } = render(<MbCancelRatioBar value={0} />);
    expect(screen.getByText("0.0%")).toBeInTheDocument();
    expect(screen.getByText("안전")).toBeInTheDocument();
    expect(getInnerBar(container).style.width).toBe("0%");
  });
  it("음수(-1.0) 시 widthPct 0% 클램프 (안전 라벨)", () => {
    const { container } = render(<MbCancelRatioBar value={-1.0} />);
    expect(getInnerBar(container).style.width).toBe("0%");
    expect(screen.getByText("안전")).toBeInTheDocument();
  });
  it("1.4% (안전 상한, p50 1.50% 미만)", () => {
    render(<MbCancelRatioBar value={1.4} />);
    expect(screen.getByText("안전")).toBeInTheDocument();
  });
  it("1.5% (경계 → 주의, p50)", () => {
    render(<MbCancelRatioBar value={1.5} />);
    expect(screen.getByText("주의")).toBeInTheDocument();
  });
  it("2.9% (주의 상한, p90 3.10% 미만)", () => {
    render(<MbCancelRatioBar value={2.9} />);
    expect(screen.getByText("주의")).toBeInTheDocument();
  });
  it("3.0% (경계 → 위험, p90 부근)", () => {
    render(<MbCancelRatioBar value={3.0} />);
    expect(screen.getByText("위험")).toBeInTheDocument();
  });
  it("12.0% (위험) → widthPct 60%", () => {
    const { container } = render(<MbCancelRatioBar value={12.0} />);
    expect(getInnerBar(container).style.width).toBe("60%");
  });
  it("20.0% (캡 경계) → widthPct 100%", () => {
    const { container } = render(<MbCancelRatioBar value={20.0} />);
    expect(getInnerBar(container).style.width).toBe("100%");
  });
  it("25.0% (캡 초과) → widthPct 100% 유지 + aria-valuenow 25", () => {
    const { container } = render(<MbCancelRatioBar value={25.0} />);
    expect(getInnerBar(container).style.width).toBe("100%");
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute("aria-valuenow")).toBe("25");
    expect(bar.getAttribute("aria-valuemax")).toBe("20");
  });
});
