import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MbUnsoldRateBar } from "../MbUnsoldRateBar";

function getInnerBar(container: HTMLElement) {
  return container.querySelector('[role="progressbar"] > div') as HTMLElement;
}

describe("MbUnsoldRateBar", () => {
  it("null 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbUnsoldRateBar value={null} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("undefined 시 '-' 표시", () => {
    const { container } = render(<MbUnsoldRateBar value={undefined} />);
    expect(container.textContent).toContain("-");
  });
  it("NaN 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbUnsoldRateBar value={NaN} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("0% (DB 최솟값, 양호)", () => {
    const { container } = render(<MbUnsoldRateBar value={0} />);
    expect(screen.getByText("0.0%")).toBeInTheDocument();
    expect(screen.getByText("양호")).toBeInTheDocument();
    expect(getInnerBar(container).style.width).toBe("0%");
  });
  it("음수(-5) 시 widthPct 0% 클램프 (양호)", () => {
    const { container } = render(<MbUnsoldRateBar value={-5} />);
    expect(getInnerBar(container).style.width).toBe("0%");
    expect(screen.getByText("양호")).toBeInTheDocument();
  });
  it("10% (경계 → 양호, p50 근처)", () => {
    render(<MbUnsoldRateBar value={10} />);
    expect(screen.getByText("양호")).toBeInTheDocument();
  });
  it("10.1% (경계 → 주의)", () => {
    render(<MbUnsoldRateBar value={10.1} />);
    expect(screen.getByText("주의")).toBeInTheDocument();
  });
  it("30% (경계 → 주의, 업계 관례 30% 상한)", () => {
    render(<MbUnsoldRateBar value={30} />);
    expect(screen.getByText("주의")).toBeInTheDocument();
  });
  it("30.1% (경계 → 위험)", () => {
    render(<MbUnsoldRateBar value={30.1} />);
    expect(screen.getByText("위험")).toBeInTheDocument();
  });
  it("80% (DB 분포 p95, 위험) → widthPct 80%", () => {
    const { container } = render(<MbUnsoldRateBar value={80} />);
    expect(screen.getByText("위험")).toBeInTheDocument();
    expect(getInnerBar(container).style.width).toBe("80%");
  });
  it("100% (캡 경계) → widthPct 100% + aria-label 상한 초과 없음", () => {
    const { container } = render(<MbUnsoldRateBar value={100} />);
    expect(getInnerBar(container).style.width).toBe("100%");
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute("aria-label")).not.toContain("상한 초과");
  });
  it("2300% (DB max outlier) → widthPct 100% + aria-label 상한 초과 표시", () => {
    const { container } = render(<MbUnsoldRateBar value={2300} />);
    expect(getInnerBar(container).style.width).toBe("100%");
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute("aria-label")).toContain("상한 초과");
    expect(bar.getAttribute("aria-valuenow")).toBe("2300");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
  });
});
