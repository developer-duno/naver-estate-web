/**
 * FilterChipsSummary 컴포넌트 테스트 — 단지 상세 매물 표 위 읽기 전용 필터 요약
 * 실행: npx vitest run src/components/__tests__/FilterChipsSummary.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FilterChipsSummary from "@/components/filter/FilterChipsSummary";
import type { ArticleFilters } from "@/types";

describe("FilterChipsSummary — 읽기 전용 필터 요약", () => {
  it("필터가 비어있으면 아무것도 렌더하지 않는다", () => {
    const { container } = render(<FilterChipsSummary filters={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it("거래유형만 적용 시 '적용된 필터:' 라벨과 칩 1개 노출", () => {
    const filters: ArticleFilters = { trade_types: "매매" };
    render(<FilterChipsSummary filters={filters} />);
    expect(screen.getByText("적용된 필터:")).toBeInTheDocument();
    expect(screen.getByText("매매")).toBeInTheDocument();
    // X 버튼이 없어야 함 (읽기 전용)
    expect(screen.queryByText("×")).not.toBeInTheDocument();
  });

  it("거래유형+가격+면적 복합 시 가격 prefix '매매가' 적용", () => {
    const filters: ArticleFilters = {
      trade_types: "매매",
      min_price: 30000,
      min_area_m2: 84,
    };
    render(<FilterChipsSummary filters={filters} />);
    expect(screen.getByText("매매")).toBeInTheDocument();
    expect(screen.getByText("매매가 30000만원~")).toBeInTheDocument();
    expect(screen.getByText("84m²~")).toBeInTheDocument();
  });

  it("태그 다중 적용 시 '#태그' 형식으로 칩 노출", () => {
    const filters: ArticleFilters = { tags: "역세권,복층" };
    render(<FilterChipsSummary filters={filters} />);
    expect(screen.getByText("#역세권")).toBeInTheDocument();
    expect(screen.getByText("#복층")).toBeInTheDocument();
  });

  it("4개 이상 필터 시 '+N 더보기' 토글 동작 (모바일 전용 클래스)", () => {
    const filters: ArticleFilters = {
      trade_types: "매매",
      min_price: 30000,
      min_area_m2: 84,
      min_rooms: 3,
      tags: "역세권",
    };
    render(<FilterChipsSummary filters={filters} />);
    // 칩 5개 + 모바일 더보기 버튼: 5 - 3 = 2개 숨김
    const moreBtn = screen.getByText(/\+2 더보기/);
    expect(moreBtn).toBeInTheDocument();
    expect(moreBtn).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(moreBtn);

    // 클릭 후 "접기" 노출
    const collapseBtn = screen.getByText("접기");
    expect(collapseBtn).toBeInTheDocument();
    expect(collapseBtn).toHaveAttribute("aria-expanded", "true");
  });
});
