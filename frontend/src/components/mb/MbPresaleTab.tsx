"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { UseQueryResult } from "@tanstack/react-query";
import MbPresaleTable from "@/components/mb/MbPresaleTable";
import MbCompetitionTable from "@/components/mb/MbCompetitionTable";
import Pagination from "@/components/Pagination";
import { MbTabContent } from "@/components/mb/MbTabContent";
import MbSortSelect from "@/components/mb/MbSortSelect";
import MbViewToggle from "@/components/mb/MbViewToggle";
import MbSelectedCard from "@/components/mb/MbSelectedCard";
import { MB_PRESALE_SORT_OPTIONS, MB_COMPETITION_SORT_OPTIONS } from "@/lib/mb-sort-options";
import { PAGE_SIZE } from "@/lib/constants";
import { useMbViewMode } from "@/hooks/useMbViewMode";
import type { MbApartment } from "@/types";

// 지도는 무겁고 SSR 불가(window.naver) → dynamic(ssr:false).
const LazyClusterMap = dynamic(() => import("@/components/mb/MbClusterMap"), {
  ssr: false,
  loading: () => <div className="w-full h-96 rounded-lg border border-gray-200 bg-gray-50" />,
});

export type PresaleSegment = "private" | "public" | "competition";

export const PRESALE_SEGMENTS: { key: PresaleSegment; label: string }[] = [
  { key: "private", label: "민간분양" },
  { key: "public", label: "LH공공분양" },
  { key: "competition", label: "분양결과" },
];

type PresaleData = { presale: MbApartment[]; total: number; page: number; page_size: number };
type CompetitionData = { competition: MbApartment[]; total: number; page: number; page_size: number };

/** 분양 탭 — 세그먼트(민간/LH공공/분양결과) 전환 + 정렬 + 페이지네이션 + 지도 토글.
 * URL ?seg= 동기화는 page.tsx 가 담당, 본 컴포넌트는 props 로 받음. */
export default function MbPresaleTab({
  segment,
  onSegmentChange,
  presaleQuery,
  competitionQuery,
  page,
  sort,
  onSortChange,
  onPageChange,
  isInCompare,
  onCompareToggle,
  compareFull,
}: {
  segment: PresaleSegment;
  onSegmentChange: (seg: PresaleSegment) => void;
  presaleQuery: UseQueryResult<PresaleData>;
  competitionQuery: UseQueryResult<CompetitionData>;
  page: number;
  sort: string;
  onSortChange: (s: string) => void;
  onPageChange: (p: number) => void;
  isInCompare: (id: string) => boolean;
  onCompareToggle: (id: string, name: string) => void;
  compareFull: boolean;
}) {
  const { viewMode, setViewMode } = useMbViewMode();
  const [selected, setSelected] = useState<MbApartment | null>(null);

  const isCompetition = segment === "competition";
  const query = isCompetition ? competitionQuery : presaleQuery;
  const items = isCompetition
    ? competitionQuery.data?.competition ?? []
    : presaleQuery.data?.presale ?? [];
  const total = query.data?.total ?? 0;
  const sortOptions = isCompetition ? MB_COMPETITION_SORT_OPTIONS : MB_PRESALE_SORT_OPTIONS;
  const defaultSortLabel = isCompetition ? "기본 (경쟁률 높은순)" : "기본 (공고일 최신순)";

  return (
    <div>
      {/* 세그먼트 컨트롤 + 보기 토글 */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5" role="tablist" aria-label="분양 종류">
          {PRESALE_SEGMENTS.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={segment === s.key}
              onClick={() => onSegmentChange(s.key)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                segment === s.key
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <MbViewToggle viewMode={viewMode} onChange={setViewMode} />
      </div>

      <MbTabContent loading={query.isLoading} error={query.error} refetch={query.refetch}>
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
          <span className="text-sm text-gray-500">총 {total.toLocaleString()}개</span>
          {viewMode === "list" && (
            <MbSortSelect sort={sort} onSortChange={onSortChange} options={sortOptions} defaultLabel={defaultSortLabel} />
          )}
        </div>

        {viewMode === "map" ? (
          <>
            <LazyClusterMap apartments={items} selectedId={selected?.id} onSelect={setSelected} />
            {selected && <MbSelectedCard apt={selected} onClose={() => setSelected(null)} />}
          </>
        ) : (
          <>
            {isCompetition ? (
              <MbCompetitionTable
                apartments={items}
                isInCompare={isInCompare}
                onCompareToggle={onCompareToggle}
                compareFull={compareFull}
              />
            ) : (
              <MbPresaleTable
                apartments={items}
                isInCompare={isInCompare}
                onCompareToggle={onCompareToggle}
                compareFull={compareFull}
              />
            )}

            {total > PAGE_SIZE && (
              <div className="mt-4">
                <Pagination
                  currentPage={page}
                  totalPages={Math.ceil(total / PAGE_SIZE)}
                  onPageChange={onPageChange}
                />
              </div>
            )}
          </>
        )}
      </MbTabContent>
    </div>
  );
}
