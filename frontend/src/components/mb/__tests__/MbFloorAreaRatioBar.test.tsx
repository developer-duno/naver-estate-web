import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MbFloorAreaRatioBar } from "../MbFloorAreaRatioBar";

// 용적률 진행바 — null/0/음수 가드 + 임계(저밀<200/중밀<300/고밀) + MAX_PCT=800 캡 검증
function getInnerBar(container: HTMLElement) {
  return container.querySelector('[role="progressbar"] > div') as HTMLElement;
}

describe("MbFloorAreaRatioBar", () => {
  it("null 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbFloorAreaRatioBar value={null} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("undefined 시 '-' 표시", () => {
    const { container } = render(<MbFloorAreaRatioBar value={undefined} />);
    expect(container.textContent).toContain("-");
  });
  it("NaN 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbFloorAreaRatioBar value={NaN} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("0(미입력 노이즈) 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbFloorAreaRatioBar value={0} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("음수(-5) 시 '-' 표시 (0 이하 가드)", () => {
    const { container } = render(<MbFloorAreaRatioBar value={-5} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("199% (저밀 상한)", () => {
    render(<MbFloorAreaRatioBar value={199} />);
    expect(screen.getByText("199%")).toBeInTheDocument();
    expect(screen.getByText("저밀")).toBeInTheDocument();
  });
  it("200% (저밀→중밀 경계)", () => {
    render(<MbFloorAreaRatioBar value={200} />);
    expect(screen.getByText("중밀")).toBeInTheDocument();
  });
  it("296% (DB p50, 중밀)", () => {
    render(<MbFloorAreaRatioBar value={296} />);
    expect(screen.getByText("중밀")).toBeInTheDocument();
  });
  it("299% (중밀 상한)", () => {
    render(<MbFloorAreaRatioBar value={299} />);
    expect(screen.getByText("중밀")).toBeInTheDocument();
  });
  it("300% (중밀→고밀 경계)", () => {
    render(<MbFloorAreaRatioBar value={300} />);
    expect(screen.getByText("고밀")).toBeInTheDocument();
  });
  it("799% (DB p95) → widthPct 99.875% (799/800), 고밀", () => {
    const { container } = render(<MbFloorAreaRatioBar value={799} />);
    expect(getInnerBar(container).style.width).toBe("99.875%");
    expect(screen.getByText("고밀")).toBeInTheDocument();
  });
  it("800% (캡 경계) → widthPct 100%", () => {
    const { container } = render(<MbFloorAreaRatioBar value={800} />);
    expect(getInnerBar(container).style.width).toBe("100%");
  });
  it("1000% (캡 초과) → widthPct 100% 유지 + aria-valuenow 1000 + aria-valuemax 800", () => {
    const { container } = render(<MbFloorAreaRatioBar value={1000} />);
    expect(getInnerBar(container).style.width).toBe("100%");
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute("aria-valuenow")).toBe("1000");
    expect(bar.getAttribute("aria-valuemax")).toBe("800");
  });
});
