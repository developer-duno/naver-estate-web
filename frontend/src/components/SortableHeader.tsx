"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// -- Types --

export type SortDir = "asc" | "desc" | null;

export interface SortState {
  key: string;
  dir: SortDir;
}

export type FilterType = "categorical" | "numeric" | "text";

export interface FilterValue {
  type: FilterType;
  selected?: Set<string>;
  min?: number;
  max?: number;
  search?: string;
}

export interface ColumnDef {
  key: string;
  label: string;
  className?: string;
  sortable?: boolean;
  filterType?: FilterType;
  getFilterValue?: (art: Record<string, unknown>) => string;
  getSortValue?: (art: Record<string, unknown>) => number | null;
  getSortText?: (art: Record<string, unknown>) => string;
}

// -- SortableHeader Component --

interface SortableHeaderProps {
  column: ColumnDef;
  sort: SortState;
  onSortChange: (sort: SortState) => void;
  filter: FilterValue | undefined;
  onFilterChange: (key: string, value: FilterValue | undefined) => void;
  uniqueValues?: string[];
}

export default function SortableHeader({
  column,
  sort,
  onSortChange,
  filter,
  onFilterChange,
  uniqueValues,
}: SortableHeaderProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLTableCellElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const isSorted = sort.key === column.key && sort.dir !== null;
  const isFiltered = filter !== undefined && isFilterActive(filter);

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
      ref={ref}
      className={`relative px-2 py-2.5 text-xs font-semibold text-gray-700 whitespace-nowrap border-r border-gray-200 last:border-r-0 ${column.className || ""}`}
    >
      <div className="flex items-center gap-0.5 justify-between">
        <button
          type="button"
          onClick={handleSortClick}
          className={`flex items-center gap-0.5 ${column.sortable ? "cursor-pointer hover:text-blue-600" : "cursor-default"}`}
          title={column.sortable ? "클릭하여 정렬" : undefined}
        >
          <span>{column.label}</span>
          {column.sortable && isSorted && (
            <span className="text-blue-600 text-[10px]">
              {sort.dir === "asc" ? "▲" : "▼"}
            </span>
          )}
        </button>

        {column.filterType && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className={`relative ml-0.5 p-0.5 rounded transition-colors ${
              isFiltered
                ? "text-blue-600 bg-blue-50 hover:bg-blue-100"
                : "text-gray-400 hover:text-gray-600 hover:bg-gray-200"
            }`}
            title="필터"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>
            </svg>
            {isFiltered && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-500 rounded-full" />
            )}
          </button>
        )}
      </div>

      {open && column.filterType && (
        <FilterDropdown
          column={column}
          filter={filter}
          onFilterChange={onFilterChange}
          uniqueValues={uniqueValues}
          onClose={() => setOpen(false)}
        />
      )}
    </th>
  );
}

// -- Filter Dropdown --

function FilterDropdown({
  column,
  filter,
  onFilterChange,
  uniqueValues,
  onClose,
}: {
  column: ColumnDef;
  filter: FilterValue | undefined;
  onFilterChange: (key: string, value: FilterValue | undefined) => void;
  uniqueValues?: string[];
  onClose: () => void;
}) {
  return (
    <div
      className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 min-w-[200px] p-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-xs font-semibold text-gray-500 mb-2">{column.label} 필터</div>
      {column.filterType === "categorical" && (
        <CategoricalFilter
          columnKey={column.key}
          filter={filter}
          onFilterChange={onFilterChange}
          uniqueValues={uniqueValues || []}
        />
      )}
      {column.filterType === "numeric" && (
        <NumericFilter
          columnKey={column.key}
          filter={filter}
          onFilterChange={onFilterChange}
        />
      )}
      {column.filterType === "text" && (
        <TextFilter
          columnKey={column.key}
          filter={filter}
          onFilterChange={onFilterChange}
        />
      )}
      <div className="flex justify-between mt-3 pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={() => { onFilterChange(column.key, undefined); onClose(); }}
          className="text-xs text-gray-500 hover:text-red-500"
        >
          초기화
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          닫기
        </button>
      </div>
    </div>
  );
}

// -- Categorical Filter --

function CategoricalFilter({
  columnKey,
  filter,
  onFilterChange,
  uniqueValues,
}: {
  columnKey: string;
  filter: FilterValue | undefined;
  onFilterChange: (key: string, value: FilterValue | undefined) => void;
  uniqueValues: string[];
}) {
  const selected = filter?.selected ?? new Set(uniqueValues);
  const allSelected = !filter || selected.size === uniqueValues.length;

  const toggle = (val: string) => {
    const next = new Set(selected);
    if (next.has(val)) next.delete(val); else next.add(val);
    if (next.size === 0 || next.size === uniqueValues.length) {
      onFilterChange(columnKey, undefined);
    } else {
      onFilterChange(columnKey, { type: "categorical", selected: next });
    }
  };

  const toggleAll = () => {
    onFilterChange(columnKey, undefined);
  };

  return (
    <div className="max-h-[200px] overflow-y-auto space-y-1">
      <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
        <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
        전체
      </label>
      <div className="border-t border-gray-100 my-1" />
      {uniqueValues.map((v) => (
        <label key={v} className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
          <input type="checkbox" checked={selected.has(v)} onChange={() => toggle(v)} className="rounded" />
          {v || "(없음)"}
        </label>
      ))}
    </div>
  );
}

// -- Numeric Filter --

function NumericFilter({
  columnKey,
  filter,
  onFilterChange,
}: {
  columnKey: string;
  filter: FilterValue | undefined;
  onFilterChange: (key: string, value: FilterValue | undefined) => void;
}) {
  const [minVal, setMinVal] = useState(filter?.min?.toString() ?? "");
  const [maxVal, setMaxVal] = useState(filter?.max?.toString() ?? "");

  const apply = useCallback((mn: string, mx: string) => {
    const min = mn ? Number(mn) : undefined;
    const max = mx ? Number(mx) : undefined;
    if (min === undefined && max === undefined) {
      onFilterChange(columnKey, undefined);
    } else {
      onFilterChange(columnKey, { type: "numeric", min, max });
    }
  }, [columnKey, onFilterChange]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <input
          type="number"
          placeholder="최소"
          value={minVal}
          onChange={(e) => { setMinVal(e.target.value); apply(e.target.value, maxVal); }}
          className="w-[80px] text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <span className="text-gray-400 text-xs">~</span>
        <input
          type="number"
          placeholder="최대"
          value={maxVal}
          onChange={(e) => { setMaxVal(e.target.value); apply(minVal, e.target.value); }}
          className="w-[80px] text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>
    </div>
  );
}

// -- Text Filter --

function TextFilter({
  columnKey,
  filter,
  onFilterChange,
}: {
  columnKey: string;
  filter: FilterValue | undefined;
  onFilterChange: (key: string, value: FilterValue | undefined) => void;
}) {
  const [search, setSearch] = useState(filter?.search ?? "");

  return (
    <input
      type="text"
      placeholder="검색..."
      value={search}
      onChange={(e) => {
        setSearch(e.target.value);
        if (e.target.value === "") {
          onFilterChange(columnKey, undefined);
        } else {
          onFilterChange(columnKey, { type: "text", search: e.target.value });
        }
      }}
      className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
      autoFocus
    />
  );
}

// -- Helpers --

export function isFilterActive(f: FilterValue): boolean {
  if (f.type === "categorical") return f.selected !== undefined && f.selected.size > 0;
  if (f.type === "numeric") return f.min !== undefined || f.max !== undefined;
  if (f.type === "text") return !!f.search;
  return false;
}

export function applyFilter(value: unknown, filter: FilterValue): boolean {
  if (filter.type === "categorical" && filter.selected) {
    return filter.selected.has(String(value ?? ""));
  }
  if (filter.type === "numeric") {
    const n = typeof value === "number" ? value : null;
    if (n === null) return true;
    if (filter.min !== undefined && n < filter.min) return false;
    if (filter.max !== undefined && n > filter.max) return false;
    return true;
  }
  if (filter.type === "text" && filter.search) {
    return String(value ?? "").toLowerCase().includes(filter.search.toLowerCase());
  }
  return true;
}

/** 필터 요약 텍스트 생성 (칩 표시용) */
export function getFilterSummary(f: FilterValue): string {
  if (f.type === "categorical" && f.selected) {
    const items = Array.from(f.selected);
    if (items.length <= 2) return items.join(", ");
    return items.slice(0, 2).join(", ") + " 외 " + (items.length - 2);
  }
  if (f.type === "numeric") {
    if (f.min !== undefined && f.max !== undefined) return f.min.toLocaleString() + "~" + f.max.toLocaleString();
    if (f.min !== undefined) return f.min.toLocaleString() + "~";
    if (f.max !== undefined) return "~" + f.max.toLocaleString();
  }
  if (f.type === "text" && f.search) return '"' + f.search + '"';
  return "";
}
