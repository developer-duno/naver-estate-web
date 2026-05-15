import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MbMaxFloorBar } from "../MbMaxFloorBar";

function getInnerBar(container: HTMLElement) {
  return container.querySelector('[role="progressbar"] > div') as HTMLElement;
}

describe("MbMaxFloorBar", () => {
  it("null 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbMaxFloorBar value={null} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("undefined 시 '-' 표시", () => {
    const { container } = render(<MbMaxFloorBar value={undefined} />);
    expect(container.textContent).toContain("-");
  });
  it("NaN 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbMaxFloorBar value={NaN} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("음수(-5) 시 widthPct 0% 클램프 (저층 라벨)", () => {
    const { container } = render(<MbMaxFloorBar value={-5} />);
    expect(getInnerBar(container).style.width).toBe("0%");
    expect(screen.getByText("저층")).toBeInTheDocument();
  });
  it("14층 (저층 상한, DB p25=17 인접)", () => {
    render(<MbMaxFloorBar value={14} />);
    expect(screen.getByText("14층")).toBeInTheDocument();
    expect(screen.getByText("저층")).toBeInTheDocument();
  });
  it("15층 (저층→중층 경계)", () => {
    render(<MbMaxFloorBar value={15} />);
    expect(screen.getByText("중층")).toBeInTheDocument();
  });
  it("24층 (중층, DB p50=24)", () => {
    render(<MbMaxFloorBar value={24} />);
    expect(screen.getByText("중층")).toBeInTheDocument();
  });
  it("29층 (중층 상한, DB p75=29)", () => {
    render(<MbMaxFloorBar value={29} />);
    expect(screen.getByText("중층")).toBeInTheDocument();
  });
  it("30층 (중층→고층 경계)", () => {
    render(<MbMaxFloorBar value={30} />);
    expect(screen.getByText("고층")).toBeInTheDocument();
  });
  it("43층 (DB p95) → widthPct 86% (43/50=86%)", () => {
    const { container } = render(<MbMaxFloorBar value={43} />);
    expect(getInnerBar(container).style.width).toBe("86%");
    expect(screen.getByText("고층")).toBeInTheDocument();
  });
  it("50층 (캡 경계) → widthPct 100%", () => {
    const { container } = render(<MbMaxFloorBar value={50} />);
    expect(getInnerBar(container).style.width).toBe("100%");
  });
  it("70층 (캡 초과) → widthPct 100% 유지 + aria-valuenow 70 + aria-valuemax 50", () => {
    const { container } = render(<MbMaxFloorBar value={70} />);
    expect(getInnerBar(container).style.width).toBe("100%");
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute("aria-valuenow")).toBe("70");
    expect(bar.getAttribute("aria-valuemax")).toBe("50");
  });
});
