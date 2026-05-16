import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MbSchoolWalkBar } from "../MbSchoolWalkBar";

// 학교 도보 시간 진행바 — null/0/음수 가드 + 임계(가까움<=5/보통<=10/멈>10) + MAX_MIN=15 캡 검증
function getInnerBar(container: HTMLElement) {
  return container.querySelector('[role="progressbar"] > div') as HTMLElement;
}

describe("MbSchoolWalkBar", () => {
  it("null 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbSchoolWalkBar value={null} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("undefined 시 '-' 표시", () => {
    const { container } = render(<MbSchoolWalkBar value={undefined} />);
    expect(container.textContent).toContain("-");
  });
  it("NaN 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbSchoolWalkBar value={NaN} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("0(미입력 노이즈) 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbSchoolWalkBar value={0} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("음수(-3) 시 '-' 표시 (0 이하 가드)", () => {
    const { container } = render(<MbSchoolWalkBar value={-3} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("2분 (DB p50, 가까움)", () => {
    render(<MbSchoolWalkBar value={2} />);
    expect(screen.getByText("2분")).toBeInTheDocument();
    expect(screen.getByText("가까움")).toBeInTheDocument();
  });
  it("5분 (가까움 상한)", () => {
    render(<MbSchoolWalkBar value={5} />);
    expect(screen.getByText("5분")).toBeInTheDocument();
    expect(screen.getByText("가까움")).toBeInTheDocument();
  });
  it("6분 (가까움→보통 경계 직후)", () => {
    render(<MbSchoolWalkBar value={6} />);
    expect(screen.getByText("보통")).toBeInTheDocument();
  });
  it("10분 (보통 상한)", () => {
    render(<MbSchoolWalkBar value={10} />);
    expect(screen.getByText("10분")).toBeInTheDocument();
    expect(screen.getByText("보통")).toBeInTheDocument();
  });
  it("11분 (보통→멈 경계, DB p95 근처)", () => {
    render(<MbSchoolWalkBar value={11} />);
    expect(screen.getByText("멈")).toBeInTheDocument();
  });
  it("12분 (멈)", () => {
    render(<MbSchoolWalkBar value={12} />);
    expect(screen.getByText("멈")).toBeInTheDocument();
  });
  it("7.0(real 타입 소수) 시 '7분' 정수 표시", () => {
    render(<MbSchoolWalkBar value={7.0} />);
    expect(screen.getByText("7분")).toBeInTheDocument();
  });
  it("15분 (캡 경계) → widthPct 100%", () => {
    const { container } = render(<MbSchoolWalkBar value={15} />);
    expect(getInnerBar(container).style.width).toBe("100%");
  });
  it("16분 (캡 초과) → widthPct 100% 유지 + aria-valuenow 16 + aria-valuemax 15", () => {
    const { container } = render(<MbSchoolWalkBar value={16} />);
    expect(getInnerBar(container).style.width).toBe("100%");
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute("aria-valuenow")).toBe("16");
    expect(bar.getAttribute("aria-valuemax")).toBe("15");
  });
});
