/**
 * MbTradeTable 테스트 — SortableTh 허용 방향 (backend mb.py MbTradeSortBy Literal 동기화, 422 방지)
 * 실행: npx vitest run src/components/mb/__tests__/MbTradeTable.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { MbTrade } from "@/types";

import MbTradeTable from "../MbTradeTable";

function makeTrade(overrides: Partial<MbTrade> & { id: number }): MbTrade {
  return {
    region: "서울",
    apt_name: "테스트아파트",
    deal_month: "202603",
    area: 84.9,
    price: 50000,
    floor: 10,
    ...overrides,
  };
}

describe("MbTradeTable — SortableTh 허용 방향", () => {
  const trades = [makeTrade({ id: 1 })];

  it("'면적'(asc 미지원) — desc 상태에서 재클릭 시 area_asc 대신 해제('')", () => {
    const onSortChange = vi.fn();
    render(<MbTradeTable trades={trades} sort="area_desc" onSortChange={onSortChange} />);
    const table = screen.getByRole("table");
    fireEvent.click(within(table).getByText("면적(㎡)"));
    expect(onSortChange).toHaveBeenCalledWith("");
    expect(onSortChange).not.toHaveBeenCalledWith("area_asc");
  });

  it("'거래월'(asc 지원) — desc 상태에서 재클릭 시 deal_month_asc 3단 사이클 유지", () => {
    const onSortChange = vi.fn();
    render(<MbTradeTable trades={trades} sort="deal_month_desc" onSortChange={onSortChange} />);
    const table = screen.getByRole("table");
    fireEvent.click(within(table).getByText("거래월"));
    expect(onSortChange).toHaveBeenCalledWith("deal_month_asc");
  });

  it("빈 배열이면 EmptyState 카피 ('표시할 실거래가 없어요') 표시", () => {
    render(<MbTradeTable trades={[]} />);
    expect(screen.getByText("표시할 실거래가 없어요")).toBeInTheDocument();
  });
});
