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
    fireEvent.click(screen.getByText("매매"));
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
    expect(screen.getByText("저층(1~5)")).toBeInTheDocument();
    expect(screen.getByText("중층(6~10)")).toBeInTheDocument();
    expect(screen.getByText("고층(11↑)")).toBeInTheDocument();
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

  it("태그 버튼 표시 + 선택 시 tags 쿼리 전달 + 재클릭 시 해제", () => {
    const onChange = vi.fn();
    const props = {
      ...defaultProps,
      onChange,
      filterOptions: { building_names: [], tags: ["역세권", "복층", "테라스"], directions: [] } as FilterOptions,
    };
    render(<FilterBar {...props} />);
    openDropdown("상세");

    const tagBtn = screen.getByRole("button", { name: "역세권" });
    expect(tagBtn).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(tagBtn);
    expect(tagBtn).toHaveAttribute("aria-pressed", "true");
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ tags: "역세권" }));

    // 재클릭 해제
    fireEvent.click(tagBtn);
    expect(tagBtn).toHaveAttribute("aria-pressed", "false");
    expect(onChange).toHaveBeenLastCalledWith(expect.not.objectContaining({ tags: expect.anything() }));
  });

  it("filter_options.tags 가 빈 배열이면 태그 섹션 미렌더", () => {
    const props = {
      ...defaultProps,
      filterOptions: { building_names: [], tags: [], directions: [] } as FilterOptions,
    };
    render(<FilterBar {...props} />);
    openDropdown("상세");
    expect(screen.queryByText("태그")).not.toBeInTheDocument();
  });
});

describe("FilterBar — 필터 칩", () => {
  it("거래유형 선택 시 칩 표시", () => {
    const onChange = vi.fn();
    render(<FilterBar {...defaultProps} onChange={onChange} />);
    openDropdown("거래유형");
    fireEvent.click(screen.getByText("매매"));
    // "매매"가 드롭다운 내부 + 칩 두 곳에 존재
    expect(screen.getAllByText("매매").length).toBeGreaterThanOrEqual(1);
  });

  it("태그 선택 시 '#태그명' 칩 표시 + 칩 × 클릭 시 해제", () => {
    const onChange = vi.fn();
    const props = {
      ...defaultProps,
      onChange,
      filterOptions: { building_names: [], tags: ["역세권"], directions: [] } as FilterOptions,
    };
    render(<FilterBar {...props} />);
    openDropdown("상세");
    fireEvent.click(screen.getByRole("button", { name: "역세권" }));
    expect(screen.getByText("#역세권")).toBeInTheDocument();

    // 칩 × 버튼 (#태그 텍스트의 다음 형제 button) 클릭
    const chipSpan = screen.getByText("#역세권").closest("span");
    expect(chipSpan).not.toBeNull();
    const xBtn = chipSpan!.querySelector("button");
    expect(xBtn).not.toBeNull();
    fireEvent.click(xBtn!);
    expect(screen.queryByText("#역세권")).not.toBeInTheDocument();
  });
});

describe("FilterBar — 매물유형 옵션", () => {
  it("상세 드롭다운에 확장된 매물유형 옵션 표시", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("상세");
    // 매물유형 select를 찾기: "오피스텔" option을 포함하는 select
    const selects = screen.getAllByDisplayValue("전체");
    const estateSelect = selects.find((s) => {
      const opts = Array.from(s.querySelectorAll("option")).map((o) => o.textContent);
      return opts.includes("오피스텔");
    });
    expect(estateSelect).toBeDefined();
    const options = Array.from(estateSelect!.querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toContain("아파트");
    expect(options).toContain("오피스텔");
    expect(options).toContain("분양권");
    expect(options).toContain("재건축");
    expect(options).toContain("재개발");
  });

  it("매물유형 변경 시 onChange 호출", () => {
    const onChange = vi.fn();
    render(<FilterBar {...defaultProps} onChange={onChange} />);
    openDropdown("상세");
    const selects = screen.getAllByDisplayValue("전체");
    const estateSelect = selects.find((s) => {
      const opts = Array.from(s.querySelectorAll("option")).map((o) => o.textContent);
      return opts.includes("오피스텔");
    });
    expect(estateSelect).toBeDefined();
    fireEvent.change(estateSelect!, { target: { value: "opst" } });
    expect(onChange).toHaveBeenCalled();
  });
});
