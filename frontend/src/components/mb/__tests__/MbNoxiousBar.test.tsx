import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MbNoxiousBar } from "../MbNoxiousBar";

// 유해시설 거리 진행바 — null/0/음수 가드 + 임계(멀음>700/보통>300/가까움<=300) + MAX_M=1500 캡 검증
// 학교 도보 진행바와 색 방향 반대: 멀수록 좋음(safe).
function getInnerBar(container: HTMLElement) {
  return container.querySelector('[role="progressbar"] > div') as HTMLElement;
}

describe("MbNoxiousBar", () => {
  it("null 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbNoxiousBar value={null} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("undefined 시 '-' 표시", () => {
    const { container } = render(<MbNoxiousBar value={undefined} />);
    expect(container.textContent).toContain("-");
  });
  it("NaN 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbNoxiousBar value={NaN} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("0(미입력 노이즈) 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbNoxiousBar value={0} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("음수(-50) 시 '-' 표시 (0 이하 가드)", () => {
    const { container } = render(<MbNoxiousBar value={-50} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("300m (가까움 상한 — danger 경계)", () => {
    render(<MbNoxiousBar value={300} />);
    expect(screen.getByText("300m")).toBeInTheDocument();
    expect(screen.getByText("가까움")).toBeInTheDocument();
  });
  it("301m (가까움→보통 경계 직후)", () => {
    render(<MbNoxiousBar value={301} />);
    expect(screen.getByText("보통")).toBeInTheDocument();
  });
  it("700m (보통 상한 — warn 경계)", () => {
    render(<MbNoxiousBar value={700} />);
    expect(screen.getByText("700m")).toBeInTheDocument();
    expect(screen.getByText("보통")).toBeInTheDocument();
  });
  it("701m (보통→멀음 경계 직후)", () => {
    render(<MbNoxiousBar value={701} />);
    expect(screen.getByText("멀음")).toBeInTheDocument();
  });
  it("488m (DB p50, 보통)", () => {
    render(<MbNoxiousBar value={488} />);
    expect(screen.getByText("488m")).toBeInTheDocument();
    expect(screen.getByText("보통")).toBeInTheDocument();
  });
  it("1444m (DB p95, 멀음) → km 표기", () => {
    render(<MbNoxiousBar value={1444} />);
    expect(screen.getByText("1.4km")).toBeInTheDocument();
    expect(screen.getByText("멀음")).toBeInTheDocument();
  });
  it("1500m (캡 경계) → widthPct 100% + km 표기", () => {
    const { container } = render(<MbNoxiousBar value={1500} />);
    expect(getInnerBar(container).style.width).toBe("100%");
    expect(screen.getByText("1.5km")).toBeInTheDocument();
  });
  it("1600m (캡 초과) → widthPct 100% 유지 + aria-valuenow 1600 + aria-valuemax 1500", () => {
    const { container } = render(<MbNoxiousBar value={1600} />);
    expect(getInnerBar(container).style.width).toBe("100%");
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute("aria-valuenow")).toBe("1600");
    expect(bar.getAttribute("aria-valuemax")).toBe("1500");
  });
});
