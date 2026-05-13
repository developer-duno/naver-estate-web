import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MbJeonseRateBar } from "../MbJeonseRateBar";

function getInnerBar(container: HTMLElement) {
  return container.querySelector('[role="progressbar"] > div') as HTMLElement;
}

describe("MbJeonseRateBar", () => {
  it("null 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbJeonseRateBar value={null} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("undefined 시 '-' 표시", () => {
    const { container } = render(<MbJeonseRateBar value={undefined} />);
    expect(container.textContent).toContain("-");
  });
  it("NaN 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbJeonseRateBar value={NaN} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("0.0% (최솟값 적정)", () => {
    const { container } = render(<MbJeonseRateBar value={0} />);
    expect(screen.getByText("0.0%")).toBeInTheDocument();
    expect(screen.getByText("적정")).toBeInTheDocument();
    expect(getInnerBar(container).style.width).toBe("0%");
  });
  it("음수(-1.0) 시 widthPct 0% 클램프 (적정 라벨)", () => {
    const { container } = render(<MbJeonseRateBar value={-1.0} />);
    expect(getInnerBar(container).style.width).toBe("0%");
    expect(screen.getByText("적정")).toBeInTheDocument();
  });
  it("59.9% (적정 상한, DB <60 누적 32%)", () => {
    render(<MbJeonseRateBar value={59.9} />);
    expect(screen.getByText("적정")).toBeInTheDocument();
  });
  it("60.0% (경계 → 주의, DB 60~70 mode 27%)", () => {
    render(<MbJeonseRateBar value={60.0} />);
    expect(screen.getByText("주의")).toBeInTheDocument();
  });
  it("79.9% (주의 상한)", () => {
    render(<MbJeonseRateBar value={79.9} />);
    expect(screen.getByText("주의")).toBeInTheDocument();
  });
  it("80.0% (경계 → 위험, 깡통전세 진입선)", () => {
    render(<MbJeonseRateBar value={80.0} />);
    expect(screen.getByText("위험")).toBeInTheDocument();
  });
  it("98.4% (p95, 위험) → widthPct 82% (98.4/120=82%)", () => {
    const { container } = render(<MbJeonseRateBar value={98.4} />);
    expect(getInnerBar(container).style.width).toBe("82%");
  });
  it("120.0% (캡 경계) → widthPct 100%", () => {
    const { container } = render(<MbJeonseRateBar value={120.0} />);
    expect(getInnerBar(container).style.width).toBe("100%");
  });
  it("150.0% (캡 초과) → widthPct 100% 유지 + aria-valuenow 150 + aria-valuemax 120", () => {
    const { container } = render(<MbJeonseRateBar value={150.0} />);
    expect(getInnerBar(container).style.width).toBe("100%");
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute("aria-valuenow")).toBe("150");
    expect(bar.getAttribute("aria-valuemax")).toBe("120");
  });
});
