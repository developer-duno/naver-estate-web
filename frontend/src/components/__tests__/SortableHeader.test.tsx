/**
 * SortableHeader 컴포넌트 테스트 — 정렬 가능 테이블 헤더
 * 실행: npx vitest run src/components/__tests__/SortableHeader.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SortableHeader from "../SortableHeader";
import type { ColumnDef, SortState } from "../SortableHeader";

const sortableColumn: ColumnDef = {
  key: "price",
  label: "가격",
  sortable: true,
};

const nonSortableColumn: ColumnDef = {
  key: "name",
  label: "이름",
  sortable: false,
};

/** 테이블 래퍼 — <th>는 <table> 내부에 있어야 함 */
function renderInTable(ui: React.ReactElement) {
  return render(
    <table>
      <thead>
        <tr>{ui}</tr>
      </thead>
    </table>,
  );
}

describe("SortableHeader 컴포넌트", () => {
  /** 라벨 표시 */
  it("컬럼 라벨이 표시된다", () => {
    renderInTable(
      <SortableHeader
        column={sortableColumn}
        sort={{ key: "", dir: null }}
        onSortChange={vi.fn()}
      />,
    );
    expect(screen.getByText("가격")).toBeInTheDocument();
  });

  /** 클릭 → asc 정렬 */
  it("정렬 가능한 컬럼 클릭 시 asc로 정렬된다", () => {
    const onSortChange = vi.fn();
    renderInTable(
      <SortableHeader
        column={sortableColumn}
        sort={{ key: "", dir: null }}
        onSortChange={onSortChange}
      />,
    );

    fireEvent.click(screen.getByText("가격"));
    expect(onSortChange).toHaveBeenCalledWith({ key: "price", dir: "asc" });
  });

  /** asc → desc */
  it("asc 상태에서 클릭하면 desc로 변경된다", () => {
    const onSortChange = vi.fn();
    renderInTable(
      <SortableHeader
        column={sortableColumn}
        sort={{ key: "price", dir: "asc" }}
        onSortChange={onSortChange}
      />,
    );

    fireEvent.click(screen.getByText("가격"));
    expect(onSortChange).toHaveBeenCalledWith({ key: "price", dir: "desc" });
  });

  /** desc → 정렬 해제 */
  it("desc 상태에서 클릭하면 정렬이 해제된다", () => {
    const onSortChange = vi.fn();
    renderInTable(
      <SortableHeader
        column={sortableColumn}
        sort={{ key: "price", dir: "desc" }}
        onSortChange={onSortChange}
      />,
    );

    fireEvent.click(screen.getByText("가격"));
    expect(onSortChange).toHaveBeenCalledWith({ key: "", dir: null });
  });

  /** 정렬 불가능 컬럼 — 클릭해도 콜백 미호출 */
  it("정렬 불가능한 컬럼 클릭 시 onSortChange가 호출되지 않는다", () => {
    const onSortChange = vi.fn();
    renderInTable(
      <SortableHeader
        column={nonSortableColumn}
        sort={{ key: "", dir: null }}
        onSortChange={onSortChange}
      />,
    );

    fireEvent.click(screen.getByText("이름"));
    expect(onSortChange).not.toHaveBeenCalled();
  });

  /** asc 정렬 시 ▲ 표시 */
  it("asc 정렬 시 ▲ 인디케이터가 표시된다", () => {
    renderInTable(
      <SortableHeader
        column={sortableColumn}
        sort={{ key: "price", dir: "asc" }}
        onSortChange={vi.fn()}
      />,
    );

    expect(screen.getByText("▲")).toBeInTheDocument();
  });

  /** desc 정렬 시 ▼ 표시 */
  it("desc 정렬 시 ▼ 인디케이터가 표시된다", () => {
    renderInTable(
      <SortableHeader
        column={sortableColumn}
        sort={{ key: "price", dir: "desc" }}
        onSortChange={vi.fn()}
      />,
    );

    expect(screen.getByText("▼")).toBeInTheDocument();
  });
});
