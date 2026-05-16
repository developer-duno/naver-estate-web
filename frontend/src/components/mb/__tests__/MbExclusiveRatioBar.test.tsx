import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MbExclusiveRatioBar } from "../MbExclusiveRatioBar";

// 전용률 진행바 — null/0/음수 가드 + 임계(낮음<73/보통>=73/우수>=78) + MAX_PCT=90 캡 검증
function getInnerBar(container: HTMLElement) {
  return container.querySelector('[role="progressbar"] > div') as HTMLElement;
}

describe("MbExclusiveRatioBar", () => {
  it("null 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbExclusiveRatioBar value={null} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("undefined 시 '-' 표시", () => {
    const { container } = render(<MbExclusiveRatioBar value={undefined} />);
    expect(container.textContent).toContain("-");
  });
  it("NaN 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbExclusiveRatioBar value={NaN} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("0(미입력 노이즈) 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbExclusiveRatioBar value={0} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("음수(-5) 시 '-' 표시 (0 이하 가드)", () => {
    const { container } = render(<MbExclusiveRatioBar value={-5} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("72.9% (보통 미만 = 낮음 상한)", () => {
    render(<MbExclusiveRatioBar value={72.9} />);
    expect(screen.getByText("72.9%")).toBeInTheDocument();
    expect(screen.getByText("낮음")).toBeInTheDocument();
  });
  it("73% (낮음→보통 경계, DB p25)", () => {
    render(<MbExclusiveRatioBar value={73} />);
    expect(screen.getByText("보통")).toBeInTheDocument();
  });
  it("75% (DB p50, 보통)", () => {
    render(<MbExclusiveRatioBar value={75} />);
    expect(screen.getByText("75.0%")).toBeInTheDocument();
    expect(screen.getByText("보통")).toBeInTheDocument();
  });
  it("77.9% (보통 상한)", () => {
    render(<MbExclusiveRatioBar value={77.9} />);
    expect(screen.getByText("보통")).toBeInTheDocument();
  });
  it("78% (보통→우수 경계)", () => {
    render(<MbExclusiveRatioBar value={78} />);
    expect(screen.getByText("우수")).toBeInTheDocument();
  });
  it("84.1% (DB p95, 우수)", () => {
    render(<MbExclusiveRatioBar value={84.1} />);
    expect(screen.getByText("우수")).toBeInTheDocument();
  });
  it("90% (캡 경계) → widthPct 100%", () => {
    const { container } = render(<MbExclusiveRatioBar value={90} />);
    expect(getInnerBar(container).style.width).toBe("100%");
  });
  it("95% (캡 초과) → widthPct 100% 유지 + aria-valuenow 95 + aria-valuemax 90", () => {
    const { container } = render(<MbExclusiveRatioBar value={95} />);
    expect(getInnerBar(container).style.width).toBe("100%");
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute("aria-valuenow")).toBe("95");
    expect(bar.getAttribute("aria-valuemax")).toBe("90");
  });
});
