"use client";

import { useState, useMemo, useCallback, memo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
  type OnChangeFn,
  type Column,
} from "@tanstack/react-table";
import type { Article } from "@/types";
import {
  M2_TO_PYEONG,
  TRADE_TYPE_COLORS,
  TRADE_TYPE_DEFAULT_COLOR,
  ESTATE_TYPE_COLORS,
  ESTATE_TYPE_DEFAULT_COLOR,
} from "@/lib/constants";
import { formatDateShort, formatMaintenanceCost } from "@/lib/format";
import { COLUMNS, SERVER_SORT_MAP, type ArticleColumnMeta } from "@/components/articleTableColumns";
import ArticleFavoriteButton from "@/components/ArticleFavoriteButton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Props {
  articles: Article[];
  onRowClick?: (articleNo: string) => void;
  onSortChange?: (sortBy: string) => void;
  selectedArticleNos?: Set<string>;
  onSelectionChange?: (articleNo: string, checked: boolean) => void;
  onSelectAll?: (checked: boolean, visibleArticles: Article[]) => void;
  hasActiveFilters?: boolean;
  onResetFilters?: () => void;
}

function ariaSort(column: Column<Article, unknown>): "ascending" | "descending" | "none" {
  const sorted = column.getIsSorted();
  if (sorted === "asc") return "ascending";
  if (sorted === "desc") return "descending";
  return "none";
}

function ArticleTable({
  articles,
  onRowClick,
  onSortChange,
  selectedArticleNos,
  onSelectionChange,
  onSelectAll,
  hasActiveFilters,
  onResetFilters,
}: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo<ColumnDef<Article>[]>(() => COLUMNS, []);

  const handleSortingChange = useCallback<OnChangeFn<SortingState>>(
    (updater) => {
      setSorting((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        const first = next[0];
        if (first && onSortChange) {
          const serverSort = SERVER_SORT_MAP[first.id];
          if (serverSort) {
            onSortChange(first.desc ? serverSort.desc : serverSort.asc);
          }
        }
        return next;
      });
    },
    [onSortChange]
  );

  const table = useReactTable({
    data: articles,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { sorting },
    onSortingChange: handleSortingChange,
    sortDescFirst: false,
  });

  const sortedRows = table.getRowModel().rows;

  if (articles.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <p className="text-gray-500">매물이 없습니다.</p>
        {hasActiveFilters ? (
          <>
            <p className="text-xs text-gray-400">필터 조건이 너무 좁을 수 있어요.</p>
            {onResetFilters && (
              <button
                type="button"
                onClick={onResetFilters}
                className="text-xs text-blue-600 hover:underline"
              >
                필터 초기화
              </button>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-400">위의 &quot;데이터 갱신&quot; 버튼을 눌러보세요.</p>
        )}
      </div>
    );
  }

  return (
    <Table className="bg-white rounded-lg shadow-sm border text-sm">
      <TableHeader className="bg-gray-100 border-b-2 border-gray-300 sticky top-0 z-10">
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id} className="hover:bg-transparent">
            {onSelectionChange && (
              <TableHead scope="col" className="px-2 py-2 w-8 h-auto">
                <input
                  type="checkbox"
                  checked={
                    sortedRows.length > 0 &&
                    sortedRows.every((r) => selectedArticleNos?.has(r.original.article_no))
                  }
                  onChange={(e) =>
                    onSelectAll?.(e.target.checked, sortedRows.map((r) => r.original))
                  }
                  className="w-4 h-4 rounded border-gray-300"
                  title="전체 선택"
                />
              </TableHead>
            )}
            <TableHead
              scope="col"
              className="px-2 py-2 w-16 h-auto text-center text-xs text-gray-700"
              aria-label="메모/즐겨찾기 액션"
            >
              액션
            </TableHead>
            {headerGroup.headers.map((header) => {
              const col = header.column;
              const meta = col.columnDef.meta as ArticleColumnMeta | undefined;
              const className = `px-2 py-2.5 h-auto text-xs font-semibold text-gray-700 whitespace-nowrap border-r border-gray-200 last:border-r-0 ${meta?.className ?? ""}`;
              return (
                <TableHead
                  key={header.id}
                  scope="col"
                  aria-sort={ariaSort(col)}
                  className={className}
                >
                  {col.getCanSort() ? (
                    <button
                      type="button"
                      onClick={col.getToggleSortingHandler()}
                      className="flex items-center gap-0.5 cursor-pointer hover:text-blue-600"
                      title={meta?.headerTitle ?? "클릭하여 정렬"}
                    >
                      <span>{col.columnDef.header as string}</span>
                      {col.getIsSorted() && (
                        <span className="text-blue-600 text-[10px]">
                          {col.getIsSorted() === "asc" ? "▲" : "▼"}
                        </span>
                      )}
                    </button>
                  ) : (
                    <span>{col.columnDef.header as string}</span>
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {sortedRows.map((row, idx) => (
          <ArticleRow
            key={row.original.article_no}
            article={row.original}
            index={idx + 1}
            onClick={onRowClick}
            selected={selectedArticleNos?.has(row.original.article_no)}
            onCheck={onSelectionChange}
          />
        ))}
      </TableBody>
    </Table>
  );
}

const ArticleRow = memo(function ArticleRow({
  article: art,
  index,
  onClick,
  selected,
  onCheck,
}: {
  article: Article;
  index: number;
  onClick?: (no: string) => void;
  selected?: boolean;
  onCheck?: (articleNo: string, checked: boolean) => void;
}) {
  const price =
    art.trade_type_name === "월세" || art.trade_type_name === "단기임대"
      ? `${art.deal_or_warrant_prc || "-"} / ${art.rent_prc || "-"}`
      : art.deal_or_warrant_prc || "-";

  const areaM2 = art.area2_m2 || art.area1_m2;
  const area = areaM2
    ? `${areaM2}㎡ (${Math.round((areaM2 / M2_TO_PYEONG) * 10) / 10}평)`
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
    <TableRow
      onClick={() => onClick?.(art.article_no)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.(art.article_no);
        }
      }}
      tabIndex={0}
      role="row"
      aria-label={`매물 ${art.article_no} 상세 보기`}
      className={`hover:bg-blue-50 cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 border-b border-gray-200 ${
        index % 2 === 0 ? "bg-gray-50/50" : "bg-white"
      }`}
    >
      {onCheck && (
        <Td className="text-center border-r border-gray-100" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={!!selected}
            onChange={(e) => onCheck(art.article_no, e.target.checked)}
            className="w-4 h-4 rounded border-gray-300"
            aria-label={`매물 ${art.article_no} 선택`}
          />
        </Td>
      )}
      <Td className="text-center border-r border-gray-100" onClick={(e) => e.stopPropagation()}>
        <span className="ml-1">
          <ArticleFavoriteButton
            articleNo={art.article_no}
            complexNo={art.complex_no}
            complexName={art.complex_name}
            tradeTypeName={art.trade_type_name}
            price={art.deal_or_warrant_prc}
          />
        </span>
      </Td>
      <Td className="text-gray-400 text-center">{index}</Td>
      <Td>
        <span
          className={`px-1.5 py-0.5 rounded text-xs font-medium ${
            TRADE_TYPE_COLORS[art.trade_type_name || ""] || TRADE_TYPE_DEFAULT_COLOR
          }`}
        >
          {art.trade_type_name || "-"}
        </span>
        {art.article_real_estate_type_name &&
          art.article_real_estate_type_name !== "아파트" && (
            <span
              className={`ml-1 px-1 py-0.5 rounded text-xs border ${
                ESTATE_TYPE_COLORS[art.article_real_estate_type_name] ??
                ESTATE_TYPE_DEFAULT_COLOR
              }`}
            >
              {art.article_real_estate_type_name}
            </span>
          )}
      </Td>
      <Td>{art.building_name || "-"}</Td>
      <Td>{art.floor_info || "-"}</Td>
      <Td className="text-right font-semibold text-gray-900">
        {price}
        {art.previous_price != null &&
          art.numeric_price != null &&
          art.previous_price !== art.numeric_price && (
            <span
              className={`ml-1 text-xs font-normal ${
                art.numeric_price < art.previous_price ? "text-blue-600" : "text-red-600"
              }`}
            >
              {art.numeric_price < art.previous_price ? "↓" : "↑"}
              {Math.abs(art.numeric_price - art.previous_price).toLocaleString()}
            </span>
          )}
      </Td>
      <Td className="text-right">{area}</Td>
      <Td className="text-right">{ppyeong}</Td>
      <Td className="text-right">
        {art.monthly_rent_yield != null ? (
          <span
            className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
              art.monthly_rent_yield >= 10
                ? "bg-blue-100 text-blue-700"
                : art.monthly_rent_yield >= 5
                ? "bg-emerald-100 text-emerald-700"
                : art.monthly_rent_yield < 3
                ? "bg-yellow-100 text-yellow-700"
                : "bg-emerald-50 text-emerald-600"
            }`}
          >
            {art.monthly_rent_yield}%
          </span>
        ) : art.article_jeonse_ratio != null ? (
          <span
            className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
              art.article_jeonse_ratio > 80
                ? "bg-red-100 text-red-700"
                : "bg-blue-50 text-blue-600"
            }`}
          >
            {art.article_jeonse_ratio}%
          </span>
        ) : (
          "-"
        )}
      </Td>
      <Td className="text-center">{rooms}</Td>
      <Td className="text-center">{moveIn}</Td>
      <Td className="text-right">{maint}</Td>
      <Td className="text-center">{art.direction || "-"}</Td>
      <Td className="max-w-[250px] truncate" title={art.article_feature_desc || ""}>
        {art.article_feature_desc || "-"}
      </Td>
      <Td>{art.realtor_name || "-"}</Td>
      <Td className="text-center">{confirm}</Td>
    </TableRow>
  );
});

export default memo(ArticleTable);

function Td({
  children,
  className = "",
  title,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  onClick?: (e: React.MouseEvent<HTMLTableCellElement>) => void;
}) {
  return (
    <TableCell
      className={`px-2 py-1.5 whitespace-nowrap text-xs text-gray-700 border-r border-gray-100 last:border-r-0 ${className}`}
      title={title}
      onClick={onClick}
    >
      {children}
    </TableCell>
  );
}
