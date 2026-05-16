import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MbPirBar } from "../MbPirBar";

// PIR(연소득 대비 주택가격 배수) 진행바 — null/0/음수 가드 + 임계(저부담<15/적정<25/고부담) + MAX_PCT=60 캡 검증
function getInnerBar(container: HTMLElement) {
  return container.querySelector('[role="progressbar"] > div') as HTMLElement;
}

describe("MbPirBar", () => {
  it("null 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbPirBar value={null} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("undefined 시 '-' 표시", () => {
    const { container } = render(<MbPirBar value={undefined} />);
    expect(container.textContent).toContain("-");
  });
  it("NaN 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbPirBar value={NaN} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("0(미입력 노이즈) 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbPirBar value={0} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("음수(-5) 시 '-' 표시 (0 이하 가드)", () => {
    const { container } = render(<MbPirBar value={-5} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("14.9배 (저부담 상한)", () => {
    render(<MbPirBar value={14.9} />);
    expect(screen.getByText("14.9배")).toBeInTheDocument();
    expect(screen.getByText("저부담")).toBeInTheDocument();
  });
  it("15배 (저부담→적정 경계)", () => {
    render(<MbPirBar value={15} />);
    expect(screen.getByText("적정")).toBeInTheDocument();
  });
  it("16.8배 (DB p50, 적정)", () => {
    render(<MbPirBar value={16.8} />);
    expect(screen.getByText("적정")).toBeInTheDocument();
  });
  it("24.9배 (적정 상한)", () => {
    render(<MbPirBar value={24.9} />);
    expect(screen.getByText("적정")).toBeInTheDocument();
  });
  it("25배 (적정→고부담 경계)", () => {
    render(<MbPirBar value={25} />);
    expect(screen.getByText("고부담")).toBeInTheDocument();
  });
  it("35.2배 (DB p95) → widthPct 58.667% (35.2/60), 고부담", () => {
    const { container } = render(<MbPirBar value={35.2} />);
    expect(getInnerBar(container).style.width).toBe("58.666666666666664%");
    expect(screen.getByText("고부담")).toBeInTheDocument();
  });
  it("60배 (캡 경계) → widthPct 100%", () => {
    const { container } = render(<MbPirBar value={60} />);
    expect(getInnerBar(container).style.width).toBe("100%");
  });
  it("174배 (캡 초과) → widthPct 100% 유지 + aria-valuenow 174 + aria-valuemax 60", () => {
    const { container } = render(<MbPirBar value={174} />);
    expect(getInnerBar(container).style.width).toBe("100%");
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute("aria-valuenow")).toBe("174");
    expect(bar.getAttribute("aria-valuemax")).toBe("60");
  });
});
