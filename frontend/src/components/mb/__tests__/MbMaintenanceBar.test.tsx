import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MbMaintenanceBar } from "../MbMaintenanceBar";

// 진행바 안쪽 채움 div (너비 % 검증용)
function getInnerBar(container: HTMLElement) {
  return container.querySelector('[role="progressbar"] > div') as HTMLElement;
}

describe("MbMaintenanceBar", () => {
  it("null 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbMaintenanceBar value={null} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("undefined 시 '-' 표시", () => {
    const { container } = render(<MbMaintenanceBar value={undefined} />);
    expect(container.textContent).toContain("-");
  });
  it("NaN 시 '-' 표시 + progressbar 미렌더", () => {
    const { container } = render(<MbMaintenanceBar value={NaN} />);
    expect(container.textContent).toContain("-");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("0만원 (DB 최솟값, 저렴) → widthPct 0%", () => {
    const { container } = render(<MbMaintenanceBar value={0} />);
    expect(screen.getByText("0만원")).toBeInTheDocument();
    expect(screen.getByText("저렴")).toBeInTheDocument();
    expect(getInnerBar(container).style.width).toBe("0%");
  });
  it("음수(-5) 시 widthPct 0% 클램프 (저렴 라벨)", () => {
    const { container } = render(<MbMaintenanceBar value={-5} />);
    expect(getInnerBar(container).style.width).toBe("0%");
    expect(screen.getByText("저렴")).toBeInTheDocument();
  });
  it("6만원 (DB 분포 p25, 저렴)", () => {
    render(<MbMaintenanceBar value={6} />);
    expect(screen.getByText("저렴")).toBeInTheDocument();
  });
  it("8만원 (DB 분포 p50, 저렴)", () => {
    render(<MbMaintenanceBar value={8} />);
    expect(screen.getByText("저렴")).toBeInTheDocument();
  });
  it("10만원 (경계 → 저렴)", () => {
    render(<MbMaintenanceBar value={10} />);
    expect(screen.getByText("저렴")).toBeInTheDocument();
  });
  it("10.1만원 (경계 → 보통)", () => {
    render(<MbMaintenanceBar value={10.1} />);
    expect(screen.getByText("보통")).toBeInTheDocument();
  });
  it("21만원 (DB 분포 p75, 보통)", () => {
    render(<MbMaintenanceBar value={21} />);
    expect(screen.getByText("보통")).toBeInTheDocument();
  });
  it("25만원 (경계 → 보통)", () => {
    render(<MbMaintenanceBar value={25} />);
    expect(screen.getByText("보통")).toBeInTheDocument();
  });
  it("25.1만원 (경계 → 높음)", () => {
    render(<MbMaintenanceBar value={25.1} />);
    expect(screen.getByText("높음")).toBeInTheDocument();
  });
  it("30만원 (DB 분포 p95, 높음) → widthPct 50%", () => {
    const { container } = render(<MbMaintenanceBar value={30} />);
    expect(screen.getByText("높음")).toBeInTheDocument();
    expect(getInnerBar(container).style.width).toBe("50%");
  });
  it("60만원 (캡 경계) → widthPct 100%", () => {
    const { container } = render(<MbMaintenanceBar value={60} />);
    expect(getInnerBar(container).style.width).toBe("100%");
  });
  it("265만원 (DB max, 캡 초과) → widthPct 100% + aria-valuenow 265 + aria-valuemax 60", () => {
    const { container } = render(<MbMaintenanceBar value={265} />);
    expect(getInnerBar(container).style.width).toBe("100%");
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute("aria-valuenow")).toBe("265");
    expect(bar.getAttribute("aria-valuemax")).toBe("60");
  });
});
