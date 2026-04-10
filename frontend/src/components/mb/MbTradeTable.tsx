"use client";

import type { MbTrade } from "@/types";
import { formatKoreanPrice } from "@/lib/format";

/** 문자열 sort 값 ("price_desc") ↔ SortState 변환 */
function parseSortString(s?: string): { key: string; dir: "asc" | "desc" | null } {
  if (!s) return { key: "", dir: null };
  const lastUnderscore = s.lastIndexOf("_");
  if (lastUnderscore === -1) return { key: s, dir: "asc" };
  const dir = s.slice(lastUnderscore + 1);
  if (dir === "asc" || dir === "desc") return { key: s.slice(0, lastUnderscore), dir };
  return { key: s, dir: "asc" };
}

function SortableTh({
  label, sortKey, align, currentSort, onSort,
}: {
  label: string;
  sortKey: string;
  align: "left" | "right";
  currentSort: { key: string; dir: "asc" | "desc" | null };
  onSort?: (sort: string) => void;
}) {
  const isActive = currentSort.key === sortKey && currentSort.dir !== null;
  const handleClick = () => {
    if (!onSort) return;
    if (currentSort.key !== sortKey) {
      onSort(`${sortKey}_desc`);
    } else if (currentSort.dir === "desc") {
      onSort(`${sortKey}_asc`);
    } else {
      onSort("");
    }
  };
  return (
    <th className={`px-3 py-2.5 text-${align} text-gray-700 font-semibold`}>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-0.5 cursor-pointer hover:text-blue-600"
        title="클릭하여 정렬"
      >
        <span>{label}</span>
        {isActive && (
          <span className="text-blue-600 text-[10px]">
            {currentSort.dir === "asc" ? "▲" : "▼"}
          </span>
        )}
      </button>
    </th>
  );
}

interface Props {
  trades: MbTrade[];
  sort?: string;
  onSortChange?: (sort: string) => void;
}

export default function MbTradeTable({ trades, sort, onSortChange }: Props) {
  const sortState = parseSortString(sort);
  if (trades.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        실거래 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-white rounded-lg shadow-sm border">
      <table className="w-full text-sm border-collapse">
        <thead className="bg-gray-100 border-b-2 border-gray-300">
          <tr>
            <th className="px-3 py-2.5 text-left text-gray-700 font-semibold">단지명</th>
            <th className="px-3 py-2.5 text-left text-gray-700 font-semibold">동</th>
            <SortableTh label="거래월" sortKey="deal_month" align="left" currentSort={sortState} onSort={onSortChange} />
            <SortableTh label="면적(㎡)" sortKey="area" align="right" currentSort={sortState} onSort={onSortChange} />
            <SortableTh label="가격" sortKey="price" align="right" currentSort={sortState} onSort={onSortChange} />
            <th className="px-3 py-2.5 text-right text-gray-700 font-semibold">층</th>
            <th className="px-3 py-2.5 text-right text-gray-700 font-semibold hidden sm:table-cell">건축년도</th>
            <th className="px-3 py-2.5 text-left text-gray-700 font-semibold hidden sm:table-cell">거래유형</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t, i) => (
            <tr key={t.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
              <td className="px-3 py-2 font-medium text-gray-800">{t.apt_name ?? "-"}</td>
              <td className="px-3 py-2 text-gray-600">{t.dong ?? "-"}</td>
              <td className="px-3 py-2 text-gray-600">{t.deal_month ?? "-"}</td>
              <td className="px-3 py-2 text-right">{t.area != null ? t.area.toFixed(1) : "-"}</td>
              <td className="px-3 py-2 text-right font-medium">
                {t.price != null ? formatKoreanPrice(t.price) : "-"}
              </td>
              <td className="px-3 py-2 text-right">{t.floor ?? "-"}</td>
              <td className="px-3 py-2 text-right hidden sm:table-cell">{t.build_year ?? "-"}</td>
              <td className="px-3 py-2 text-gray-600 hidden sm:table-cell">
                {t.trade_type ?? "-"}
                {t.cancel_date && (
                  <span className="ml-1 text-xs text-red-500">(취소)</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
