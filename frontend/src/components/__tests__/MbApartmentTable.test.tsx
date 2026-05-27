/**
 * MbApartmentTable 컴포넌트 테스트 — 데스크톱 테이블 + 모바일 카드뷰 동시 렌더 검증
 * 실행: npx vitest run src/components/__tests__/MbApartmentTable.test.tsx
 *
 * 주의: jsdom 은 CSS 의 hidden/md:hidden 을 적용하지 않으므로 테이블과 카드가
 * 양쪽 DOM 에 모두 존재. 텍스트 조회는 getAllByText()[0] 또는 data-testid
 * 컨테이너 한정이 필수.
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

  it("컬럼 헤더가 표시된다 (데스크톱 테이블 전용)", () => {
    render(<MbApartmentTable apartments={[createMockApartment()]} />);
    // 헤더는 테이블에만 존재 — 단일 조회 OK
    expect(screen.getByText("단지명")).toBeInTheDocument();
    expect(screen.getByText("세대수")).toBeInTheDocument();
    // "미분양" 은 모바일 카드 라벨로도 나오므로 getAllByText
    expect(screen.getAllByText("미분양").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("미분양률")).toBeInTheDocument();
    expect(screen.getByText("시공사")).toBeInTheDocument();
  });

  it("아파트 데이터가 올바르게 표시된다 (테이블 + 카드 양쪽)", () => {
    render(<MbApartmentTable apartments={[createMockApartment()]} />);
    // 테이블 + 카드 둘 다에 같은 텍스트가 있으므로 getAllByText 사용
    expect(screen.getAllByText("래미안 테스트").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("서울특별시").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("강남구").length).toBeGreaterThanOrEqual(2);
    // 세대수는 테이블 셀(1,200)과 카드(1,200세대)로 포맷이 다름
    expect(screen.getAllByText("1,200").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("1,200세대")).toBeInTheDocument();
    expect(screen.getAllByText("4.2%").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("삼성물산").length).toBeGreaterThanOrEqual(1);
  });

  it("빈 데이터일 때 EmptyState 카피가 표시된다 (early return)", () => {
    render(<MbApartmentTable apartments={[]} />);
    expect(screen.getByText("표시할 미분양 단지가 없어요")).toBeInTheDocument();
    expect(screen.queryByTestId("mb-apt-cards")).not.toBeInTheDocument();
  });

  it("테이블 행 클릭 시 상세 페이지로 이동한다", () => {
    render(<MbApartmentTable apartments={[createMockApartment()]} />);
    // 테이블 내부에 있는 "래미안 테스트" 만 선택
    const matches = screen.getAllByText("래미안 테스트");
    const tableCell = matches.find((el) => el.closest("tr") !== null);
    expect(tableCell).toBeDefined();
    const row = tableCell!.closest("tr")!;
    fireEvent.click(row);
    expect(mockPush).toHaveBeenCalledWith("/mibunyang/APT001");
  });

  it("null 필드는 '-'로 표시된다", () => {
    render(<MbApartmentTable apartments={[createMockApartment({ gu: undefined, units: undefined, builder: undefined })]} />);
    const dashes = screen.getAllByText("-");
    // 테이블 + 카드 양쪽에 "-" 가 나올 수 있으므로 >= 3
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it("Enter 키로 테이블 행을 활성화할 수 있다", () => {
    render(<MbApartmentTable apartments={[createMockApartment()]} />);
    const tableCell = screen
      .getAllByText("래미안 테스트")
      .find((el) => el.closest("tr") !== null);
    const row = tableCell!.closest("tr")!;
    fireEvent.keyDown(row, { key: "Enter" });
    expect(mockPush).toHaveBeenCalledWith("/mibunyang/APT001");
  });

  /** 모바일 카드뷰 섹션 렌더 + 카드 클릭 → 라우팅 (GATE 8 추가 케이스) */
  it("모바일 카드뷰가 렌더되고 카드 클릭 시 상세로 이동한다", () => {
    render(<MbApartmentTable apartments={[createMockApartment()]} />);
    expect(screen.getByTestId("mb-apt-cards")).toBeInTheDocument();
    const card = screen.getByTestId("mb-apt-card-APT001");
    fireEvent.click(card);
    expect(mockPush).toHaveBeenCalledWith("/mibunyang/APT001");
  });

  /** 모바일 카드 Enter 키 접근성 */
  it("모바일 카드에서 Enter 키로 상세 이동이 가능하다", () => {
    render(<MbApartmentTable apartments={[createMockApartment()]} />);
    const card = screen.getByTestId("mb-apt-card-APT001");
    fireEvent.keyDown(card, { key: "Enter" });
    expect(mockPush).toHaveBeenCalledWith("/mibunyang/APT001");
  });
});
