import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MbParkingBar } from "../MbParkingBar";

function getInnerBar(container: HTMLElement) {
  return container.querySelector('[role="progressbar"] > div') as HTMLElement;
}

describe("MbParkingBar", () => {
  it("null 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbParkingBar value={null} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("undefined 시 '-' 표시", () => {
    const { container } = render(<MbParkingBar value={undefined} />);
    expect(container.textContent).toContain("-");
  });
  it("NaN 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbParkingBar value={NaN} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("0.24 대 (DB 최솟값, 부족)", () => {
    const { container } = render(<MbParkingBar value={0.24} />);
    expect(screen.getByText("0.24대")).toBeInTheDocument();
    expect(screen.getByText("부족")).toBeInTheDocument();
    expect(getInnerBar(container).style.width).toBe("12%");
  });
  it("음수(-1) 시 widthPct 0% 클램프 (부족 라벨)", () => {
    const { container } = render(<MbParkingBar value={-1} />);
    expect(getInnerBar(container).style.width).toBe("0%");
    expect(screen.getByText("부족")).toBeInTheDocument();
  });
  it("0.99 대 (부족 상한, 법정 1.0 미만)", () => {
    render(<MbParkingBar value={0.99} />);
    expect(screen.getByText("부족")).toBeInTheDocument();
  });
  it("1.0 대 (경계 → 보통, 법정 최소 충족)", () => {
    render(<MbParkingBar value={1.0} />);
    expect(screen.getByText("보통")).toBeInTheDocument();
  });
  it("1.49 대 (보통 상한, 안전 1.5 미만)", () => {
    render(<MbParkingBar value={1.49} />);
    expect(screen.getByText("보통")).toBeInTheDocument();
  });
  it("1.5 대 (경계 → 충분, 안전 임계)", () => {
    render(<MbParkingBar value={1.5} />);
    expect(screen.getByText("충분")).toBeInTheDocument();
  });
  it("1.77 대 (DB 분포 p95, 충분) → widthPct 88.5% (1.77/2.0)", () => {
    const { container } = render(<MbParkingBar value={1.77} />);
    expect(getInnerBar(container).style.width).toBe("88.5%");
  });
  it("2.0 대 (캡 경계) → widthPct 100%", () => {
    const { container } = render(<MbParkingBar value={2.0} />);
    expect(getInnerBar(container).style.width).toBe("100%");
  });
  it("3.1 대 (캡 초과, DB 최댓값) → widthPct 100% 유지 + aria-valuenow 3.1 + aria-valuemax 2", () => {
    const { container } = render(<MbParkingBar value={3.1} />);
    expect(getInnerBar(container).style.width).toBe("100%");
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute("aria-valuenow")).toBe("3.1");
    expect(bar.getAttribute("aria-valuemax")).toBe("2");
  });
});
