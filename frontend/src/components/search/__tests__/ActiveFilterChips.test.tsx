/**
 * ActiveFilterChips 테스트 (세션 314 F3) — 적용 조건 한글 칩 + 개별 해제.
 * 실행: npx vitest run src/components/search/__tests__/ActiveFilterChips.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ArticleFilters } from "@/types";
import ActiveFilterChips from "../ActiveFilterChips";

function renderChips(filters: ArticleFilters, estateTypeLabels: string[] = []) {
  const onRemoveFilter = vi.fn();
  const onResetEstateTypes = vi.fn();
  render(
    <ActiveFilterChips
      filters={filters}
      estateTypeLabels={estateTypeLabels}
      onRemoveFilter={onRemoveFilter}
      onResetEstateTypes={onResetEstateTypes}
    />,
  );
  return { onRemoveFilter, onResetEstateTypes };
}

describe("ActiveFilterChips — 적용 조건 칩", () => {
  it("필터·매물유형 모두 비면 아무것도 렌더 안 함 (null)", () => {
    const { onRemoveFilter } = renderChips({});
    expect(screen.queryByTestId("active-filter-chips")).not.toBeInTheDocument();
    expect(onRemoveFilter).not.toHaveBeenCalled();
  });

  it("거래유형 칩 (한글값 그대로)", () => {
    renderChips({ trade_types: "매매" });
    expect(screen.getByText("매매")).toBeInTheDocument();
  });

  it("가격 범위 → 억 단위 한글 칩", () => {
    renderChips({ min_price: 50000, max_price: 100000 });
    // 5억 ~ 10억
    expect(screen.getByText(/가격 5억~10억/)).toBeInTheDocument();
  });

  it("면적 범위 → ㎡ 칩", () => {
    renderChips({ min_area_m2: 60, max_area_m2: 85 });
    expect(screen.getByText(/면적 60㎡~85㎡/)).toBeInTheDocument();
  });

  it("매물유형 narrowing 칩", () => {
    renderChips({}, ["아파트", "오피스텔"]);
    expect(screen.getByText("유형: 아파트·오피스텔")).toBeInTheDocument();
  });

  it("거래유형 칩 ✕ 클릭 → onRemoveFilter('trade_types')", () => {
    const { onRemoveFilter } = renderChips({ trade_types: "전세" });
    fireEvent.click(screen.getByRole("button", { name: /전세 조건 해제/ }));
    expect(onRemoveFilter).toHaveBeenCalledWith("trade_types");
  });

  it("가격 칩 ✕ → min_price·max_price 둘 다 해제", () => {
    const { onRemoveFilter } = renderChips({ min_price: 30000, max_price: 60000 });
    fireEvent.click(screen.getByRole("button", { name: /가격.*조건 해제/ }));
    expect(onRemoveFilter).toHaveBeenCalledWith("min_price");
    expect(onRemoveFilter).toHaveBeenCalledWith("max_price");
  });

  it("매물유형 칩 ✕ → onResetEstateTypes", () => {
    const { onResetEstateTypes } = renderChips({}, ["아파트"]);
    fireEvent.click(screen.getByRole("button", { name: /유형.*조건 해제/ }));
    expect(onResetEstateTypes).toHaveBeenCalled();
  });

  it("방·욕실·인증매물 칩", () => {
    renderChips({ min_rooms: 3, min_baths: 2, verified_only: true });
    expect(screen.getByText("방 3개 이상")).toBeInTheDocument();
    expect(screen.getByText("욕실 2개 이상")).toBeInTheDocument();
    expect(screen.getByText("인증매물만")).toBeInTheDocument();
  });

  it("층수·관리비·준공·수익률·입주·동명·태그 칩 (세션 314 누락 키 보강)", () => {
    renderChips({
      min_floor: 5, max_floor: 15, min_maintenance: 10, max_maintenance: 30,
      max_building_age: 10, min_yield: 4, max_yield: 8,
      move_in_type: "즉시입주", building_name: "101동", tags: "역세권",
    });
    expect(screen.getByText("층수 5층~15층")).toBeInTheDocument();
    expect(screen.getByText("관리비 10만~30만")).toBeInTheDocument();
    expect(screen.getByText("10년 이내")).toBeInTheDocument();
    expect(screen.getByText("수익률 4%~8%")).toBeInTheDocument();
    expect(screen.getByText("즉시입주")).toBeInTheDocument();
    expect(screen.getByText("동 101동")).toBeInTheDocument();
    expect(screen.getByText("역세권")).toBeInTheDocument();
  });

  it("층수 칩 ✕ → min_floor·max_floor 둘 다 해제", () => {
    const { onRemoveFilter } = renderChips({ min_floor: 5, max_floor: 15 });
    fireEvent.click(screen.getByRole("button", { name: /층수.*조건 해제/ }));
    expect(onRemoveFilter).toHaveBeenCalledWith("min_floor");
    expect(onRemoveFilter).toHaveBeenCalledWith("max_floor");
  });
});
