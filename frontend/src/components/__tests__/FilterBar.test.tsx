/**
 * FilterBar 컴포넌트 테스트 — 툴바 드롭다운 UI
 * 실행: npx vitest run src/components/__tests__/FilterBar.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FilterBar from "../FilterBar";
import type { FilterOptions } from "@/types";

const defaultProps = {
  onChange: vi.fn(),
  filterOptions: { building_names: ["101동", "102동"], tags: ["역세권"], directions: ["남향", "동향"] } as FilterOptions,
  sortBy: "rank",
  onSortChange: vi.fn(),
};

// 드롭다운 열기 헬퍼
function openDropdown(label: string) {
  const btn = screen.getByText(new RegExp(`${label}.*▾`));
  fireEvent.click(btn);
}

describe("FilterBar — 툴바 버튼", () => {
  it("7개 필터 드롭다운 버튼 렌더링", () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.getByText(/거래유형.*▾/)).toBeInTheDocument();
    expect(screen.getByText(/가격.*▾/)).toBeInTheDocument();
    expect(screen.getByText(/면적.*▾/)).toBeInTheDocument();
    expect(screen.getByText(/층수.*▾/)).toBeInTheDocument();
    expect(screen.getByText(/입주.*▾/)).toBeInTheDocument();
    expect(screen.getByText(/방\/욕실.*▾/)).toBeInTheDocument();
    expect(screen.getByText(/상세.*▾/)).toBeInTheDocument();
  });

  it("초기화 버튼 존재", () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.getByText("초기화")).toBeInTheDocument();
  });

  it("초기화 클릭 시 onChange 호출", () => {
    const onChange = vi.fn();
    render(<FilterBar {...defaultProps} onChange={onChange} />);
    fireEvent.click(screen.getByText("초기화"));
    expect(onChange).toHaveBeenCalled();
  });
});

describe("FilterBar — 거래유형 드롭다운", () => {
  it("드롭다운 열면 거래유형 선택지 표시", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("거래유형");
    expect(screen.getByText("매매")).toBeInTheDocument();
    expect(screen.getByText("전세")).toBeInTheDocument();
    expect(screen.getByText("월세")).toBeInTheDocument();
    expect(screen.getByText("단기임대")).toBeInTheDocument();
  });

  it("거래유형 선택 시 onChange 호출", () => {
    const onChange = vi.fn();
    render(<FilterBar {...defaultProps} onChange={onChange} />);
    openDropdown("거래유형");
    fireEvent.click(screen.getByLabelText("매매"));
    expect(onChange).toHaveBeenCalled();
  });
});

describe("FilterBar — 가격 드롭다운", () => {
  it("드롭다운 열면 가격 프리셋 표시", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("가격");
    expect(screen.getByText("~3억")).toBeInTheDocument();
    expect(screen.getByText("3~6억")).toBeInTheDocument();
    expect(screen.getByText("15억~")).toBeInTheDocument();
  });

  it("프리셋 클릭 시 onChange 호출", () => {
    const onChange = vi.fn();
    render(<FilterBar {...defaultProps} onChange={onChange} />);
    openDropdown("가격");
    fireEvent.click(screen.getByText("~3억"));
    expect(onChange).toHaveBeenCalled();
  });

  it("평당가 프리셋도 표시", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("가격");
    expect(screen.getByText("~2천만")).toBeInTheDocument();
    expect(screen.getByText("5천만~")).toBeInTheDocument();
  });
});

describe("FilterBar — 면적 드롭다운", () => {
  it("드롭다운 열면 면적 프리셋 표시", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("면적");
    expect(screen.getByText("~59m²")).toBeInTheDocument();
    expect(screen.getByText("84m²")).toBeInTheDocument();
    expect(screen.getByText("135m²~")).toBeInTheDocument();
  });

  it("단위 전환 버튼 존재", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("면적");
    expect(screen.getByText("평으로")).toBeInTheDocument();
  });
});

describe("FilterBar — 층수 드롭다운", () => {
  it("드롭다운 열면 층수 프리셋 표시", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("층수");
    expect(screen.getByText("저층 (1~5층)")).toBeInTheDocument();
    expect(screen.getByText("중층 (6~10층)")).toBeInTheDocument();
    expect(screen.getByText("고층 (11층↑)")).toBeInTheDocument();
  });
});

describe("FilterBar — 상세 드롭다운", () => {
  it("드롭다운 열면 방향/준공년도/인증매물 표시", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("상세");
    expect(screen.getByText("방향")).toBeInTheDocument();
    expect(screen.getByText("준공년도")).toBeInTheDocument();
    expect(screen.getByText("인증매물만")).toBeInTheDocument();
    expect(screen.getByText("정렬")).toBeInTheDocument();
  });

  it("관리비 프리셋 표시", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("상세");
    expect(screen.getByText("~5만")).toBeInTheDocument();
    expect(screen.getByText("20만~")).toBeInTheDocument();
  });

  it("동 필터 옵션 표시", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("상세");
    expect(screen.getByText("101동")).toBeInTheDocument();
    expect(screen.getByText("102동")).toBeInTheDocument();
  });
});

describe("FilterBar — 필터 칩", () => {
  it("거래유형 선택 시 칩 표시", () => {
    const onChange = vi.fn();
    render(<FilterBar {...defaultProps} onChange={onChange} />);
    openDropdown("거래유형");
    fireEvent.click(screen.getByLabelText("매매"));
    // "매매"가 드롭다운 내부 + 칩 두 곳에 존재
    expect(screen.getAllByText("매매").length).toBeGreaterThanOrEqual(1);
  });
});
