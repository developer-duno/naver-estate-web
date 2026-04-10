"use client";

// -- Types --

export type SortDir = "asc" | "desc" | null;

export interface SortState {
  key: string;
  dir: SortDir;
}

export interface ColumnDef {
  key: string;
  label: string;
  className?: string;
  sortable?: boolean;
  headerTitle?: string;
  getSortValue?: (art: Record<string, unknown>) => number | null;
  getSortText?: (art: Record<string, unknown>) => string;
}

// -- SortableHeader Component (정렬 전용) --

interface SortableHeaderProps {
  column: ColumnDef;
  sort: SortState;
  onSortChange: (sort: SortState) => void;
}

export default function SortableHeader({
  column,
  sort,
  onSortChange,
}: SortableHeaderProps) {
  const isSorted = sort.key === column.key && sort.dir !== null;

  const handleSortClick = () => {
    if (!column.sortable) return;
    if (sort.key !== column.key) {
      onSortChange({ key: column.key, dir: "asc" });
    } else if (sort.dir === "asc") {
      onSortChange({ key: column.key, dir: "desc" });
    } else {
      onSortChange({ key: "", dir: null });
    }
  };

  return (
    <th
      className={`px-2 py-2.5 text-xs font-semibold text-gray-700 whitespace-nowrap border-r border-gray-200 last:border-r-0 ${column.className || ""}`}
    >
      <button
        type="button"
        onClick={handleSortClick}
        className={`flex items-center gap-0.5 ${column.sortable ? "cursor-pointer hover:text-blue-600" : "cursor-default"}`}
        title={column.headerTitle ?? (column.sortable ? "클릭하여 정렬" : undefined)}
      >
        <span>{column.label}</span>
        {column.sortable && isSorted && (
          <span className="text-blue-600 text-[10px]">
            {sort.dir === "asc" ? "▲" : "▼"}
          </span>
        )}
      </button>
    </th>
  );
}
