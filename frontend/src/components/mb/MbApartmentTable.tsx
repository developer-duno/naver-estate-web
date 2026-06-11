"use client";

import { memo } from "react";
import { useRouter } from "next/navigation";
import { Building } from "lucide-react";
import type { MbApartment } from "@/types";
import { useMbFavorites } from "@/hooks/useMbFavorites";
import { EmptyState } from "@/components/ui/empty-state";

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
  label, sortKey, align, currentSort, onSort, ascAllowed = true,
}: {
  label: string;
  sortKey: string;
  align: "left" | "right";
  currentSort: { key: string; dir: "asc" | "desc" | null };
  onSort?: (sort: string) => void;
  /** 허용 정렬 방향은 backend/routers/mb.py:35-41 Literal 과 동기화 — asc 미지원 컬럼은 desc→해제 2단 사이클 (422 방지) */
  ascAllowed?: boolean;
}) {
  const isActive = currentSort.key === sortKey && currentSort.dir !== null;
  const handleClick = () => {
    if (!onSort) return;
    if (currentSort.key !== sortKey) {
      onSort(`${sortKey}_desc`);
    } else if (currentSort.dir === "desc" && ascAllowed) {
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

  sort?: string;
  onSortChange?: (sort: string) => void;
  isInCompare?: (id: string) => boolean;
  onCompareToggle?: (id: string, name: string) => void;
  compareFull?: boolean;
}

function MbApartmentTable({ apartments, sort, onSortChange, isInCompare, onCompareToggle, compareFull }: Props) {
  const router = useRouter();
  const sortState = parseSortString(sort);
  const { isFavorite, toggle: toggleFav } = useMbFavorites();

  if (apartments.length === 0) {
    return (
      <EmptyState
        icon={Building}
        title="표시할 미분양 단지가 없어요"
        description="조건을 바꿔보거나 잠시 후 다시 조회해주세요"
      />
    );
  }

  return (
    <>
      {/* 모바일: 카드뷰 (md 미만) */}
      <div className="md:hidden space-y-2" data-testid="mb-apt-cards">
        {apartments.map((apt) => {
          const fav = isFavorite(apt.id);
          const cmp = isInCompare?.(apt.id) ?? false;
          const go = () => router.push(`/mibunyang/${apt.id}`);
          return (
            <div
              key={apt.id}
              onClick={go}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") go(); }}
              tabIndex={0}
              role="button"
              data-testid={`mb-apt-card-${apt.id}`}
              className="bg-white rounded-lg shadow-sm border p-3 cursor-pointer hover:bg-blue-50 active:bg-blue-100 transition-colors"
            >
              {/* 1행: 즐겨찾기 + 단지명 + 비교버튼 */}
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFav({ id: apt.id, name: apt.name, region: apt.region });
                    }}
                    className={`text-lg leading-none flex-none ${fav ? "text-yellow-500" : "text-gray-300"}`}
                    aria-label={fav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                  >
                    {fav ? "★" : "☆"}
                  </button>
                  <span className="font-semibold text-blue-700 truncate">{apt.name}</span>
                </div>
                {onCompareToggle && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCompareToggle(apt.id, apt.name);
                    }}
                    disabled={!cmp && compareFull}
                    className={`text-xs px-2 py-0.5 rounded border leading-none flex-none ${
                      cmp
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-500 border-gray-300 disabled:opacity-30"
                    }`}
                    aria-label={cmp ? "비교 해제" : "비교 추가"}
                  >
                    {cmp ? "V" : "+"}
                  </button>
                )}
              </div>
              {/* 2행: 지역 · 시군구 · 세대수 */}
              <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-1">
                <span>{apt.region}</span>
                <span className="text-gray-300">·</span>
                <span>{apt.gu ?? "-"}</span>
                <span className="text-gray-300">·</span>
                <span>{apt.units?.toLocaleString() ?? "-"}세대</span>
              </div>
              {/* 3행: 미분양 강조 */}
              <div className="flex items-center gap-2 text-sm mb-1">
                <span className="text-gray-500">미분양</span>
                <span className="font-semibold text-red-600">
                  {apt.unsold != null ? `${apt.unsold.toLocaleString()}세대` : "-"}
                </span>
                {apt.unsold_rate != null && (
                  <span className="ml-auto font-medium text-red-700">
                    {apt.unsold_rate.toFixed(1)}%
                  </span>
                )}
              </div>
              {/* 4행: 평당가·할인율 */}
              {(apt.presale_pp != null || apt.discount_pct != null) && (
                <div className="flex items-center gap-1.5 text-[11px] mb-1">
                  {apt.presale_pp != null && (
                    <span className="text-amber-700">
                      평당 {apt.presale_pp.toLocaleString()}만
                    </span>
                  )}
                  {apt.discount_pct != null && (
                    <>
                      <span className="text-gray-300">·</span>
                      <span className="text-green-700">
                        할인 {apt.discount_pct.toFixed(1)}%
                      </span>
                    </>
                  )}
                </div>
              )}
              {/* 5행: 입주·시공사 */}
              <div className="flex items-center gap-1.5 text-[11px] text-gray-500 truncate">
                <span>{apt.presale_move_in ?? apt.completion ?? "-"}</span>
                <span className="text-gray-300">·</span>
                <span className="truncate">{apt.builder ?? "-"}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 데스크톱: 기존 테이블 (md 이상) */}
      <div className="hidden md:block overflow-x-auto bg-white rounded-lg shadow-sm border">
      <table className="w-full text-sm border-collapse">
        <thead className="bg-gray-100 border-b-2 border-gray-300">
          <tr>
            <th className="px-2 py-2.5 text-center text-gray-700 font-semibold w-10" aria-label="액션" />
            <th className="px-3 py-2.5 text-left text-gray-700 font-semibold">단지명</th>
            <th className="px-3 py-2.5 text-left text-gray-700 font-semibold">지역</th>
            <th className="px-3 py-2.5 text-left text-gray-700 font-semibold">시군구</th>
            <SortableTh label="세대수" sortKey="units" align="right" currentSort={sortState} onSort={onSortChange} ascAllowed={false} />
            <SortableTh label="미분양" sortKey="unsold" align="right" currentSort={sortState} onSort={onSortChange} />
            <SortableTh label="미분양률" sortKey="unsold_rate" align="right" currentSort={sortState} onSort={onSortChange} ascAllowed={false} />
            <SortableTh label="평당가" sortKey="price" align="right" currentSort={sortState} onSort={onSortChange} />
            <th className="px-3 py-2.5 text-right text-gray-700 font-semibold hidden md:table-cell">할인율</th>
            <th className="px-3 py-2.5 text-left text-gray-700 font-semibold hidden sm:table-cell">입주시기</th>
            <th className="px-3 py-2.5 text-left text-gray-700 font-semibold hidden sm:table-cell">시공사</th>
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
              <td className="px-3 py-2 text-right text-amber-700">
                {apt.presale_pp != null ? apt.presale_pp.toLocaleString() : "-"}
              </td>
              <td className="px-3 py-2 text-right text-green-700 hidden md:table-cell">
                {apt.discount_pct != null ? `${apt.discount_pct.toFixed(1)}%` : "-"}
              </td>
              <td className="px-3 py-2 text-gray-600 hidden sm:table-cell">{apt.presale_move_in ?? apt.completion ?? "-"}</td>
              <td className="px-3 py-2 text-gray-600 max-w-[120px] truncate hidden sm:table-cell">{apt.builder ?? "-"}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </>
  );
}

export default memo(MbApartmentTable);
