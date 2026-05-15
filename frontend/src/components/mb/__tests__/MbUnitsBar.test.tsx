import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MbUnitsBar } from "../MbUnitsBar";

function getInnerBar(container: HTMLElement) {
  return container.querySelector('[role="progressbar"] > div') as HTMLElement;
}

describe("MbUnitsBar", () => {
  it("null 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbUnitsBar value={null} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("undefined 시 '-' 표시", () => {
    const { container } = render(<MbUnitsBar value={undefined} />);
    expect(container.textContent).toContain("-");
  });
  it("NaN 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbUnitsBar value={NaN} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("음수(-5) 시 widthPct 0% 클램프 (소규모 라벨)", () => {
    const { container } = render(<MbUnitsBar value={-5} />);
    expect(getInnerBar(container).style.width).toBe("0%");
    expect(screen.getByText("소규모 단지")).toBeInTheDocument();
  });
  it("19세대 (DB p25)", () => {
    render(<MbUnitsBar value={19} />);
    expect(screen.getByText("19세대")).toBeInTheDocument();
    expect(screen.getByText("소규모 단지")).toBeInTheDocument();
  });
  it("99세대 (소규모 상한)", () => {
    render(<MbUnitsBar value={99} />);
    expect(screen.getByText("소규모 단지")).toBeInTheDocument();
  });
  it("100세대 (소규모→중규모 경계)", () => {
    render(<MbUnitsBar value={100} />);
    expect(screen.getByText("중규모 단지")).toBeInTheDocument();
  });
  it("120세대 (중규모, DB p50)", () => {
    render(<MbUnitsBar value={120} />);
    expect(screen.getByText("120세대")).toBeInTheDocument();
    expect(screen.getByText("중규모 단지")).toBeInTheDocument();
  });
  it("499세대 (중규모 상한)", () => {
    render(<MbUnitsBar value={499} />);
    expect(screen.getByText("중규모 단지")).toBeInTheDocument();
  });
  it("500세대 (중규모→대규모 경계, DB p75=554 인접)", () => {
    render(<MbUnitsBar value={500} />);
    expect(screen.getByText("대규모 단지")).toBeInTheDocument();
  });
  it("1460세대 (DB p95) → widthPct 97.33% (1460/1500)", () => {
    const { container } = render(<MbUnitsBar value={1460} />);
    const inner = getInnerBar(container);
    expect(inner.style.width.startsWith("97")).toBe(true);
    expect(screen.getByText("대규모 단지")).toBeInTheDocument();
  });
  it("1500세대 (캡 경계) → widthPct 100%", () => {
    const { container } = render(<MbUnitsBar value={1500} />);
    expect(getInnerBar(container).style.width).toBe("100%");
  });
  it("12032세대 (DB max 캡 초과) → widthPct 100% 유지 + aria-valuenow 12032 + aria-valuemax 1500 + 천단위 콤마", () => {
    const { container } = render(<MbUnitsBar value={12032} />);
    expect(getInnerBar(container).style.width).toBe("100%");
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute("aria-valuenow")).toBe("12032");
    expect(bar.getAttribute("aria-valuemax")).toBe("1500");
    expect(screen.getByText("12,032세대")).toBeInTheDocument();
  });
});
