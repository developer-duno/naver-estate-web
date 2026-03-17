/**
 * FilterBar 컴포넌트 테스트 - 필터 렌더링, 초기화
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

describe("FilterBar", () => {
  it("거래유형 필터 렌더링", () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.getByText("거래유형")).toBeInTheDocument();
  });

describe("FilterBar — 추가", () => {
  it("방향 필터 존재", () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.getByText("방향")).toBeInTheDocument();
  });

  it("준공년도 필터 존재", () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.getByText("준공년도")).toBeInTheDocument();
  });

  it("입주가능일 필터 존재", () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.getByText("입주가능일")).toBeInTheDocument();
  });

  it("방 최소 필터 존재", () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.getByText("방")).toBeInTheDocument();
  });

  it("욕실 최소 필터 존재", () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.getByText("욕실")).toBeInTheDocument();
  });

  it("인증매물 체크박스 존재", () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.getByText("인증매물만")).toBeInTheDocument();
  });
});


  it("정렬 라벨 존재", () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.getByText("정렬")).toBeInTheDocument();
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

  it("층 필터 프리셋 옵션", () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.getByText("저층")).toBeInTheDocument();
    expect(screen.getByText("중층")).toBeInTheDocument();
    expect(screen.getByText("고층")).toBeInTheDocument();
  });

  it("면적 단위 토글 버튼", () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.getByText("m²")).toBeInTheDocument();
    expect(screen.getByText("평")).toBeInTheDocument();
  });
});
