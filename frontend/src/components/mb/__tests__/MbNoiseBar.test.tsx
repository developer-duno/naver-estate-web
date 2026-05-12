import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MbNoiseBar } from "../MbNoiseBar";

function getInnerBar(container: HTMLElement) {
  return container.querySelector('[role="progressbar"] > div') as HTMLElement;
}

describe("MbNoiseBar", () => {
  it("null 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbNoiseBar value={null} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("undefined 시 '-' 표시", () => {
    const { container } = render(<MbNoiseBar value={undefined} />);
    expect(container.textContent).toContain("-");
  });
  it("NaN 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbNoiseBar value={NaN} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("40 dB (DB 최솟값, 조용함)", () => {
    const { container } = render(<MbNoiseBar value={40} />);
    expect(screen.getByText("40 dB")).toBeInTheDocument();
    expect(screen.getByText("조용함")).toBeInTheDocument();
    expect(getInnerBar(container).style.width).toBe("57.14285714285714%");
  });
  it("음수(-1) 시 widthPct 0% 클램프 (조용함 라벨)", () => {
    const { container } = render(<MbNoiseBar value={-1} />);
    expect(getInnerBar(container).style.width).toBe("0%");
    expect(screen.getByText("조용함")).toBeInTheDocument();
  });
  it("49 dB (조용함 상한, 환경부 야간 50dB 미만)", () => {
    render(<MbNoiseBar value={49} />);
    expect(screen.getByText("조용함")).toBeInTheDocument();
  });
  it("50 dB (경계 → 보통, 환경부 야간 기준)", () => {
    render(<MbNoiseBar value={50} />);
    expect(screen.getByText("보통")).toBeInTheDocument();
  });
  it("59 dB (보통 상한, 환경부 아침저녁 60dB 미만)", () => {
    render(<MbNoiseBar value={59} />);
    expect(screen.getByText("보통")).toBeInTheDocument();
  });
  it("60 dB (경계 → 시끄러움, 환경부 아침저녁 기준)", () => {
    render(<MbNoiseBar value={60} />);
    expect(screen.getByText("시끄러움")).toBeInTheDocument();
  });
  it("65 dB (DB 분포 p95, 시끄러움) → widthPct 92.85% (65/70)", () => {
    const { container } = render(<MbNoiseBar value={65} />);
    expect(getInnerBar(container).style.width).toBe("92.85714285714286%");
  });
  it("70 dB (캡 경계, DB 최댓값) → widthPct 100%", () => {
    const { container } = render(<MbNoiseBar value={70} />);
    expect(getInnerBar(container).style.width).toBe("100%");
  });
  it("80 dB (캡 초과) → widthPct 100% 유지 + aria-valuenow 80 + aria-valuemax 70", () => {
    const { container } = render(<MbNoiseBar value={80} />);
    expect(getInnerBar(container).style.width).toBe("100%");
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute("aria-valuenow")).toBe("80");
    expect(bar.getAttribute("aria-valuemax")).toBe("70");
  });
});
