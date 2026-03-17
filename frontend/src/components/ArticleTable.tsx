"use client";

import { useState, useMemo, memo } from "react";
import type { Article } from "@/types";
import { M2_TO_PYEONG, TRADE_TYPE_COLORS, TRADE_TYPE_DEFAULT_COLOR } from "@/lib/constants";
import { formatDateShort, formatMaintenanceCost } from "@/lib/format";
import SortableHeader, {
  type SortState,
  type FilterValue,
  type ColumnDef,
  applyFilter,
  getFilterSummary,
} from "@/components/SortableHeader";

// -- Column definitions --

const COLUMNS: ColumnDef[] = [
  { key: "no", label: "No", className: "w-[40px] text-center" },
  {
    key: "trade_type",
    label: "거래",
    className: "w-[55px] text-center",
    sortable: true,
    filterType: "categorical",
    getFilterValue: (a) => String((a as unknown as Article).trade_type_name || ""),
    getSortText: (a) => String((a as unknown as Article).trade_type_name || ""),
  },
  {
    key: "building",
    label: "동",
    className: "w-[60px]",
    sortable: true,
    filterType: "text",
    getSortText: (a) => String((a as unknown as Article).building_name || ""),
  },
  {
    key: "floor",
    label: "층",
    className: "w-[45px] text-center",
    sortable: true,
    filterType: "text",
    getSortText: (a) => String((a as unknown as Article).floor_info || ""),
  },
  {
    key: "price",
    label: "가격",
    className: "w-[120px] text-right",
    sortable: true,
    filterType: "numeric",
    getSortValue: (a) => (a as unknown as Article).numeric_price ?? null,
  },
  {
    key: "area",
    label: "면적",
    className: "w-[120px] text-right",
    sortable: true,
    filterType: "numeric",
    getSortValue: (a) => (a as unknown as Article).area2_m2 ?? (a as unknown as Article).area1_m2 ?? null,
  },
  {
    key: "ppyeong",
    label: "평당가",
    className: "w-[75px] text-right",
    sortable: true,
    filterType: "numeric",
    getSortValue: (a) => (a as unknown as Article).price_per_pyeong ?? null,
  },
  {
    key: "rooms",
    label: "방/욕",
    className: "w-[45px] text-center",
    sortable: true,
    filterType: "text",
    getSortValue: (a) => {
      const art = a as unknown as Article;
      return art.room_count != null ? (art.room_count * 100 + (art.bathroom_count ?? 0)) : null;
    },
  },
  {
    key: "move_in",
    label: "입주가능일",
    className: "w-[80px] text-center",
    sortable: true,
    filterType: "text",
    getSortText: (a) => String((a as unknown as Article).move_in_date || ""),
  },
  {
    key: "maint",
    label: "관리비",
    className: "w-[55px] text-right",
    sortable: true,
    filterType: "numeric",
    getSortValue: (a) => (a as unknown as Article).numeric_maintenance_cost ?? null,
  },
  {
    key: "direction",
    label: "방향",
    className: "w-[40px] text-center",
    sortable: true,
    filterType: "categorical",
    getFilterValue: (a) => String((a as unknown as Article).direction || ""),
    getSortText: (a) => String((a as unknown as Article).direction || ""),
  },
  {
    key: "features",
    label: "특징",
    className: "min-w-[150px]",
    filterType: "text",
    getFilterValue: (a) => String((a as unknown as Article).article_feature_desc || ""),
  },
  {
    key: "realtor",
    label: "중개사",
    className: "w-[80px]",
    sortable: true,
    filterType: "text",
    getSortText: (a) => String((a as unknown as Article).realtor_name || ""),
  },
  {
    key: "confirm_date",
    label: "확인일자",
    className: "w-[75px] text-center",
    sortable: true,
    filterType: "text",
    getSortText: (a) => String((a as unknown as Article).article_confirm_ymd || ""),
  },
];

// -- Helper: get filter/sort value for a column --

function getColumnValue(art: Article, col: ColumnDef): unknown {
  if (col.getSortValue) return col.getSortValue(art as unknown as Record<string, unknown>);
  if (col.getSortText) return col.getSortText(art as unknown as Record<string, unknown>);
  if (col.getFilterValue) return col.getFilterValue(art as unknown as Record<string, unknown>);
  return "";
}

// -- Main Component --

// Server-side sort columns mapping (모듈 레벨 — 리렌더링마다 재생성 방지)
const SERVER_SORT_MAP: Record<string, { asc: string; desc: string }> = {
  price: { asc: "price_asc", desc: "price_desc" },
  area: { asc: "area_asc", desc: "area_desc" },
  ppyeong: { asc: "ppyeong_asc", desc: "ppyeong_desc" },
  maint: { asc: "maintenance_asc", desc: "maintenance_desc" },
  confirm_date: { asc: "confirm_asc", desc: "confirm_desc" },
};

interface Props {
  articles: Article[];
  onRowClick?: (articleNo: string) => void;
  onSortChange?: (sortBy: string) => void;
  activeSortBy?: string;
  selectedArticleNos?: Set<string>;
  onSelectionChange?: (articleNo: string, checked: boolean) => void;
  onSelectAll?: (checked: boolean, visibleArticles: Article[]) => void;
}

export default function ArticleTable({ articles, onRowClick, onSortChange, activeSortBy, selectedArticleNos, onSelectionChange, onSelectAll }: Props) {
  const [sort, setSort] = useState<SortState>({ key: "", dir: null });
  const [filters, setFilters] = useState<Record<string, FilterValue>>({});

  const handleFilterChange = (key: string, value: FilterValue | undefined) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (value === undefined) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  };

  const clearAllFilters = () => setFilters({});


  const handleSortChange = (newSort: SortState) => {
    const serverSort = SERVER_SORT_MAP[newSort.key];
    if (serverSort && newSort.dir && onSortChange) {
      // Delegate to server-side sort
      const sortBy = newSort.dir === "desc" ? serverSort.desc : serverSort.asc;
      onSortChange(sortBy);
      setSort(newSort);
    } else {
      // Client-side sort
      setSort(newSort);
    }
  };


  // Compute unique values for categorical columns
  const uniqueValuesMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const col of COLUMNS) {
      if (col.filterType === "categorical" && col.getFilterValue) {
        const vals = new Set<string>();
        for (const art of articles) {
          vals.add(col.getFilterValue(art as unknown as Record<string, unknown>));
        }
        map[col.key] = Array.from(vals).sort();
      }
    }
    return map;
  }, [articles]);

  // Filter + Sort pipeline
  const processed = useMemo(() => {
    let result = [...articles];

    // Apply column filters
    const filterKeys = Object.keys(filters);
    if (filterKeys.length > 0) {
      result = result.filter((art) => {
        for (const key of filterKeys) {
          const col = COLUMNS.find((c) => c.key === key);
          if (!col) continue;
          const value = getColumnValue(art, col);
          if (!applyFilter(value, filters[key])) return false;
        }
        return true;
      });
    }

    // Apply sort
    if (sort.key && sort.dir) {
      const col = COLUMNS.find((c) => c.key === sort.key);
      if (col) {
        result.sort((a, b) => {
          const va = getColumnValue(a, col);
          const vb = getColumnValue(b, col);
          // nulls last
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          let cmp = 0;
          if (typeof va === "number" && typeof vb === "number") {
            cmp = va - vb;
          } else {
            cmp = String(va).localeCompare(String(vb), "ko");
          }
          return sort.dir === "desc" ? -cmp : cmp;
        });
      }
    }

    return result;
  }, [articles, filters, sort]);

  const activeFilterCount = Object.keys(filters).length;

  if (articles.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">매물이 없습니다.</div>
    );
  }

  return (
    <div>
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-100 flex-wrap">
          <span className="text-xs font-medium text-blue-700">
            {processed.length}/{articles.length}건
          </span>
          {Object.entries(filters).map(([key, f]) => {
            const col = COLUMNS.find((c) => c.key === key);
            if (!col) return null;
            return (
              <span key={key} className="inline-flex items-center gap-1 bg-white text-blue-700 text-xs rounded-full px-2.5 py-1 border border-blue-200">
                {col.label}: {getFilterSummary(f)}
                <button onClick={() => handleFilterChange(key, undefined)} className="hover:text-red-500 font-bold ml-0.5">&times;</button>
              </span>
            );
          })}
          <button
            onClick={clearAllFilters}
            className="text-xs text-blue-600 hover:text-blue-800 ml-auto"
          >
            전체 초기화
          </button>
        </div>
      )}
      <div className="overflow-x-auto bg-white rounded-lg shadow-sm border">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 border-b-2 border-gray-300 sticky top-0 z-10">
            <tr>
              {onSelectionChange && (
                <th className="px-2 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={processed.length > 0 && processed.every(a => selectedArticleNos?.has(a.article_no))}
                    onChange={(e) => onSelectAll?.(e.target.checked, processed)}
                    className="w-4 h-4 rounded border-gray-300"
                    title="전체 선택"
                  />
                </th>
              )}
              {COLUMNS.map((col) => (
                <SortableHeader
                  key={col.key}
                  column={col}
                  sort={sort}
                  onSortChange={handleSortChange}
                  filter={filters[col.key]}
                  onFilterChange={handleFilterChange}
                  uniqueValues={uniqueValuesMap[col.key]}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {processed.map((art, idx) => (
              <ArticleRow key={art.article_no} article={art} index={idx + 1} onClick={onRowClick} selected={selectedArticleNos?.has(art.article_no)} onCheck={onSelectionChange} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const ArticleRow = memo(function ArticleRow({ article: art, index, onClick, selected, onCheck }: { article: Article; index: number; onClick?: (no: string) => void; selected?: boolean; onCheck?: (articleNo: string, checked: boolean) => void }) {
  const price =
    (art.trade_type_name === "월세" || art.trade_type_name === "단기임대")
      ? `${art.deal_or_warrant_prc || "-"} / ${art.rent_prc || "-"}`
      : art.deal_or_warrant_prc || "-";

  const areaM2 = art.area2_m2 || art.area1_m2;
  const area = areaM2
    ? `${areaM2}㎡ (${Math.round(areaM2 / M2_TO_PYEONG * 10) / 10}평)`
    : "-";

  const ppyeong = art.price_per_pyeong ? `${art.price_per_pyeong.toLocaleString()}` : "-";

  const rooms =
    art.room_count != null && art.bathroom_count != null
      ? `${art.room_count}/${art.bathroom_count}`
      : art.room_count != null
      ? `${art.room_count}/-`
      : "-";

  let moveIn = art.move_in_date || "-";
  if (moveIn.length === 8) moveIn = formatDateShort(moveIn);

  const maint = formatMaintenanceCost(art.maintenance_cost, art.numeric_maintenance_cost);

  let confirm = art.article_confirm_ymd || "-";
  if (confirm.length === 8) confirm = formatDateShort(confirm);

  return (
    <tr
      onClick={() => onClick?.(art.article_no)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(art.article_no); } }}
      tabIndex={0}
      role="row"
      aria-label={`매물 ${art.article_no} 상세 보기`}
      className={`hover:bg-blue-50 cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 border-b border-gray-200 ${index % 2 === 0 ? "bg-gray-50/50" : "bg-white"}`}
    >
      {onCheck && (
        <td className="px-2 py-1.5 text-center border-r border-gray-100" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={!!selected}
            onChange={(e) => onCheck(art.article_no, e.target.checked)}
            className="w-4 h-4 rounded border-gray-300"
          />
        </td>
      )}
      <Td className="text-gray-400 text-center">{index}</Td>
      <Td>
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
          TRADE_TYPE_COLORS[art.trade_type_name || ""] || TRADE_TYPE_DEFAULT_COLOR
        }`}>
          {art.trade_type_name || "-"}
        </span>
      </Td>
      <Td>{art.building_name || "-"}</Td>
      <Td>{art.floor_info || "-"}</Td>
      <Td className="text-right font-semibold text-gray-900">
        {price}
        {art.previous_price != null && art.numeric_price != null && art.previous_price !== art.numeric_price && (
          <span className={`ml-1 text-xs font-normal ${art.numeric_price < art.previous_price ? "text-blue-600" : "text-red-600"}`}>
            {art.numeric_price < art.previous_price ? "↓" : "↑"}
            {Math.abs(art.numeric_price - art.previous_price).toLocaleString()}
          </span>
        )}
      </Td>
      <Td className="text-right">{area}</Td>
      <Td className="text-right">{ppyeong}</Td>
      <Td className="text-center">{rooms}</Td>
      <Td className="text-center">{moveIn}</Td>
      <Td className="text-right">{maint}</Td>
      <Td className="text-center">{art.direction || "-"}</Td>
      <Td className="max-w-[250px] truncate" title={art.article_feature_desc || ""}>
        {art.article_feature_desc || "-"}
      </Td>
      <Td>{art.realtor_name || "-"}</Td>
      <Td className="text-center">{confirm}</Td>
    </tr>
  );
});

function Td({ children, className = "", title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <td className={`px-2 py-1.5 whitespace-nowrap text-xs text-gray-700 border-r border-gray-100 last:border-r-0 ${className}`} title={title}>
      {children}
    </td>
  );
}
