"use client";

import { useRouter } from "next/navigation";
import type { MbApartment } from "@/types";
import { useMbFavorites } from "@/hooks/useMbFavorites";

/** 문자열 sort 값 ("unsold_desc") ↔ SortState 변환 */
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
  apartments: MbApartment[];
  startIndex?: number;
  sort?: string;
  onSortChange?: (sort: string) => void;
  isInCompare?: (id: string) => boolean;
  onCompareToggle?: (id: string, name: string) => void;
  compareFull?: boolean;
}

export default function MbApartmentTable({ apartments, startIndex = 0, sort, onSortChange, isInCompare, onCompareToggle, compareFull }: Props) {
  const router = useRouter();
  const sortState = parseSortString(sort);
  const { isFavorite, toggle: toggleFav } = useMbFavorites();

  if (apartments.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        미분양 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-white rounded-lg shadow-sm border">
      <table className="w-full text-sm border-collapse">
        <thead className="bg-gray-100 border-b-2 border-gray-300">
          <tr>
            <th className="px-2 py-2.5 text-center text-gray-700 font-semibold w-10" aria-label="액션" />
            <th className="px-3 py-2.5 text-left text-gray-700 font-semibold">#</th>
            <th className="px-3 py-2.5 text-left text-gray-700 font-semibold">단지명</th>
            <th className="px-3 py-2.5 text-left text-gray-700 font-semibold">지역</th>
            <th className="px-3 py-2.5 text-left text-gray-700 font-semibold">시군구</th>
            <SortableTh label="세대수" sortKey="units" align="right" currentSort={sortState} onSort={onSortChange} />
            <SortableTh label="미분양" sortKey="unsold" align="right" currentSort={sortState} onSort={onSortChange} />
            <SortableTh label="미분양률" sortKey="unsold_rate" align="right" currentSort={sortState} onSort={onSortChange} />
            <th className="px-3 py-2.5 text-left text-gray-700 font-semibold">입주시기</th>
            <th className="px-3 py-2.5 text-left text-gray-700 font-semibold">시공사</th>
          </tr>
        </thead>
        <tbody>
          {apartments.map((apt, i) => {
            const fav = isFavorite(apt.id);
            const cmp = isInCompare?.(apt.id) ?? false;
            return (
            <tr
              key={apt.id}
              onClick={() => router.push(`/mibunyang/${apt.id}`)}
              className={`cursor-pointer hover:bg-blue-50 transition-colors ${
                i % 2 === 0 ? "bg-white" : "bg-gray-50/60"
              }`}
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") router.push(`/mibunyang/${apt.id}`); }}
            >
              <td className="px-1 py-2 text-center whitespace-nowrap">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFav({ id: apt.id, name: apt.name, region: apt.region });
                  }}
                  className={`text-base leading-none ${fav ? "text-yellow-500" : "text-gray-300 hover:text-yellow-400"}`}
                  aria-label={fav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                >
                  {fav ? "★" : "☆"}
                </button>
                {onCompareToggle && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCompareToggle(apt.id, apt.name);
                    }}
                    disabled={!cmp && compareFull}
                    className={`ml-1 text-xs px-1 py-0.5 rounded border leading-none ${
                      cmp
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-500 border-gray-300 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    }`}
                    aria-label={cmp ? "비교 해제" : "비교 추가"}
                  >
                    {cmp ? "V" : "+"}
                  </button>
                )}
              </td>
              <td className="px-3 py-2 text-gray-500">{startIndex + i + 1}</td>
              <td className="px-3 py-2 font-medium text-blue-700 hover:underline">{apt.name}</td>
              <td className="px-3 py-2 text-gray-600">{apt.region}</td>
              <td className="px-3 py-2 text-gray-600">{apt.gu ?? "-"}</td>
              <td className="px-3 py-2 text-right">{apt.units?.toLocaleString() ?? "-"}</td>
              <td className="px-3 py-2 text-right font-medium text-red-600">
                {apt.unsold != null ? apt.unsold.toLocaleString() : "-"}
              </td>
              <td className="px-3 py-2 text-right">
                {apt.unsold_rate != null ? `${apt.unsold_rate.toFixed(1)}%` : "-"}
              </td>
              <td className="px-3 py-2 text-gray-600">{apt.presale_move_in ?? apt.completion ?? "-"}</td>
              <td className="px-3 py-2 text-gray-600 max-w-[120px] truncate">{apt.builder ?? "-"}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
