/**
 * MbApartmentTable 컴포넌트 테스트 — 테이블 렌더링, 빈 상태, 행 클릭
 * 실행: npx vitest run src/components/__tests__/MbApartmentTable.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MbApartmentTable from "../mb/MbApartmentTable";
import type { MbApartment } from "@/types";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

function createMockApartment(overrides: Partial<MbApartment> = {}): MbApartment {
  return {
    id: "APT001",
    name: "래미안 테스트",
    region: "서울특별시",
    gu: "강남구",
    units: 1200,
    unsold: 50,
    unsold_rate: 4.2,
    completion: "2025.06",
    builder: "삼성물산",
    ...overrides,
  };
}

describe("MbApartmentTable 렌더링", () => {
  beforeEach(() => mockPush.mockClear());

  it("컬럼 헤더가 표시된다", () => {
    render(<MbApartmentTable apartments={[createMockApartment()]} />);
    expect(screen.getByText("단지명")).toBeInTheDocument();
    expect(screen.getByText("세대수")).toBeInTheDocument();
    expect(screen.getByText("미분양")).toBeInTheDocument();
    expect(screen.getByText("미분양률")).toBeInTheDocument();
    expect(screen.getByText("시공사")).toBeInTheDocument();
  });

  it("아파트 데이터가 올바르게 표시된다", () => {
    render(<MbApartmentTable apartments={[createMockApartment()]} />);
    expect(screen.getByText("래미안 테스트")).toBeInTheDocument();
    expect(screen.getByText("서울특별시")).toBeInTheDocument();
    expect(screen.getByText("강남구")).toBeInTheDocument();
    expect(screen.getByText("1,200")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByText("4.2%")).toBeInTheDocument();
    expect(screen.getByText("삼성물산")).toBeInTheDocument();
  });

  it("빈 데이터일 때 안내 메시지가 표시된다", () => {
    render(<MbApartmentTable apartments={[]} />);
    expect(screen.getByText("미분양 데이터가 없습니다.")).toBeInTheDocument();
  });

  it("행 클릭 시 상세 페이지로 이동한다", () => {
    render(<MbApartmentTable apartments={[createMockApartment()]} />);
    fireEvent.click(screen.getByText("래미안 테스트"));
    expect(mockPush).toHaveBeenCalledWith("/mibunyang/APT001");
  });

  it("null 필드는 '-'로 표시된다", () => {
    render(<MbApartmentTable apartments={[createMockApartment({ gu: undefined, units: undefined, builder: undefined })]} />);
    const dashes = screen.getAllByText("-");
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it("Enter 키로 행을 활성화할 수 있다", () => {
    render(<MbApartmentTable apartments={[createMockApartment()]} />);
    const row = screen.getByText("래미안 테스트").closest("tr")!;
    fireEvent.keyDown(row, { key: "Enter" });
    expect(mockPush).toHaveBeenCalledWith("/mibunyang/APT001");
  });
});
