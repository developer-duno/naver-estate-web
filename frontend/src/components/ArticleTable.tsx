"use client";

import { useState, useMemo, memo } from "react";
import type { Article } from "@/types";
import { M2_TO_PYEONG, TRADE_TYPE_COLORS, TRADE_TYPE_DEFAULT_COLOR } from "@/lib/constants";
import { formatDateShort, formatMaintenanceCost } from "@/lib/format";
import { COLUMNS, SERVER_SORT_MAP, getColumnValue } from "@/components/articleTableColumns";
import SortableHeader, { type SortState } from "@/components/SortableHeader";

// -- Main Component --

interface Props {
  articles: Article[];
  onRowClick?: (articleNo: string) => void;
  onSortChange?: (sortBy: string) => void;
  selectedArticleNos?: Set<string>;
  onSelectionChange?: (articleNo: string, checked: boolean) => void;
  onSelectAll?: (checked: boolean, visibleArticles: Article[]) => void;
}

function ArticleTable({ articles, onRowClick, onSortChange, selectedArticleNos, onSelectionChange, onSelectAll }: Props) {
  const [sort, setSort] = useState<SortState>({ key: "", dir: null });

  const handleSortChange = (newSort: SortState) => {
    const serverSort = SERVER_SORT_MAP[newSort.key];
    if (serverSort && newSort.dir && onSortChange) {
      const sortBy = newSort.dir === "desc" ? serverSort.desc : serverSort.asc;
      onSortChange(sortBy);
      setSort(newSort);
    } else {
      setSort(newSort);
    }
  };

  // 클라이언트 정렬만 적용 (필터 제거됨)
  const processed = useMemo(() => {
    const result = [...articles];

    if (sort.key && sort.dir) {
      const col = COLUMNS.find((c) => c.key === sort.key);
      if (col) {
        result.sort((a, b) => {
          const va = getColumnValue(a, col);
          const vb = getColumnValue(b, col);
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
  }, [articles, sort]);

  if (articles.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">매물이 없습니다.</div>
    );
  }

  return (
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

export default memo(ArticleTable);

function Td({ children, className = "", title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <td className={`px-2 py-1.5 whitespace-nowrap text-xs text-gray-700 border-r border-gray-100 last:border-r-0 ${className}`} title={title}>
      {children}
    </td>
  );
}
