"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getMbApartmentDetail } from "@/lib/api";
import MbPresaleTable from "@/components/mb/MbPresaleTable";
import MbCompetitionTable from "@/components/mb/MbCompetitionTable";
import MbOfficetelRentalTable from "@/components/mb/MbOfficetelRentalTable";
import Pagination from "@/components/Pagination";
import { MbTabContent } from "@/components/mb/MbTabContent";
import MbSortSelect from "@/components/mb/MbSortSelect";
import MbViewToggle from "@/components/mb/MbViewToggle";
import MbSelectedCard from "@/components/mb/MbSelectedCard";
import MbMapToolbar, { type ToolbarLayer } from "@/components/mb/MbMapToolbar";
import MbInfraOverlay from "@/components/mb/MbInfraOverlay";
import { MB_PRESALE_SORT_OPTIONS, MB_COMPETITION_SORT_OPTIONS, MB_OFFICETEL_RENTAL_SORT_OPTIONS } from "@/lib/mb-sort-options";
import { PAGE_SIZE } from "@/lib/constants";
import type { MbViewMode } from "@/lib/storage";
import { useGeolocation } from "@/hooks/useGeolocation";
import type { MbApartment, MbOfficetelRentalItem } from "@/types";

// 지도는 무겁고 SSR 불가(window.naver) → dynamic(ssr:false).
const LazyClusterMap = dynamic(() => import("@/components/mb/MbClusterMap"), {
  ssr: false,
  loading: () => <div className="w-full h-96 rounded-lg border border-gray-200 bg-gray-50" />,
});

export type PresaleSegment = "private" | "public" | "competition" | "officetel_rental";

export const PRESALE_SEGMENTS: { key: PresaleSegment; label: string }[] = [
  { key: "private", label: "민간분양" },
  { key: "public", label: "LH공공분양" },
  { key: "competition", label: "분양결과" },
  { key: "officetel_rental", label: "오피스텔·임대" },
];

type PresaleData = { presale: MbApartment[]; total: number; page: number; page_size: number };
type CompetitionData = { competition: MbApartment[]; total: number; page: number; page_size: number };
type OfficetelRentalData = { items: MbOfficetelRentalItem[]; total: number; page: number; page_size: number };

/** 분양 탭 — 세그먼트(민간/LH공공/분양결과) 전환 + 정렬 + 페이지네이션 + 지도 토글.
 * URL ?seg= 동기화는 page.tsx 가 담당, 본 컴포넌트는 props 로 받음. */
export default function MbPresaleTab({
  segment,
  onSegmentChange,
  presaleQuery,
  competitionQuery,
  officetelRentalQuery,
  page,
  sort,
  onSortChange,
  onPageChange,
  isInCompare,
  onCompareToggle,
  compareFull,
  region,
  viewMode,
  onViewModeChange,
}: {
  segment: PresaleSegment;
  onSegmentChange: (seg: PresaleSegment) => void;
  presaleQuery: UseQueryResult<PresaleData>;
  competitionQuery: UseQueryResult<CompetitionData>;
  officetelRentalQuery: UseQueryResult<OfficetelRentalData>;
  page: number;
  sort: string;
  onSortChange: (s: string) => void;
  onPageChange: (p: number) => void;
  isInCompare: (id: string) => boolean;
  onCompareToggle: (id: string, name: string) => void;
  compareFull: boolean;
  /** 선택된 시/도 (page.tsx 전달). 분양 탭은 region 선택적(전국) → GPS 게이트·우선순위 판정에 사용. */
  region?: string;
  /** viewMode 는 page.tsx 가 단일 소유(세션351 근본수정) — 상세 이유는 MbApartmentsTab.tsx 참고. */
  viewMode: MbViewMode;
  onViewModeChange: (m: MbViewMode) => void;
}) {
  const setViewMode = onViewModeChange;
  const regionSelected = !!region;
  const isOfficetelRental = segment === "officetel_rental";
  // 지도 뷰 + region 미선택일 때만 현재 위치 요청 (지역 고른 사용자에겐 불필요 팝업 안 띄움).
  // 오피스텔·임대는 지도 자체가 없으므로(좌표 데이터 없음) viewMode가 다른 탭에서 넘어온
  // "map" 값이어도 GPS 팝업을 안 띄운다.
  const { coords: userLocation } = useGeolocation(viewMode === "map" && !regionSelected && !isOfficetelRental);
  const [selected, setSelected] = useState<MbApartment | null>(null);
  const [activeLayer, setActiveLayer] = useState<ToolbarLayer | null>(null);

  // 마커 클릭 시 선택 단지 상세(중첩 infra/school/transport)를 lazy fetch — 목록 API 는 평탄
  // 필드만 줘서 교통·대기질·어린이집 레이어가 빈 정보였음(세션 319 A). 분양/분양결과 모두 같은
  // apartments 테이블이라 getMbApartmentDetail 하나로 통일(인프라는 apt 공통). selected 있을 때만 enabled.
  const detailQuery = useQuery({
    queryKey: queryKeys.mb.apartmentDetail(selected?.id ?? ""),
    queryFn: () => getMbApartmentDetail(selected!.id),
    enabled: !!selected,
    staleTime: 5 * 60 * 1000,
  });
  const detailApt = detailQuery.data ?? selected;

  const isCompetition = segment === "competition";
  const query = isCompetition ? competitionQuery : isOfficetelRental ? officetelRentalQuery : presaleQuery;
  const items = isCompetition
    ? competitionQuery.data?.competition ?? []
    : isOfficetelRental
      ? officetelRentalQuery.data?.items ?? []
      : presaleQuery.data?.presale ?? [];
  const total = query.data?.total ?? 0;
  const sortOptions = isCompetition
    ? MB_COMPETITION_SORT_OPTIONS
    : isOfficetelRental
      ? MB_OFFICETEL_RENTAL_SORT_OPTIONS
      : MB_PRESALE_SORT_OPTIONS;
  const defaultSortLabel = isCompetition ? "기본 (경쟁률 높은순)" : "기본 (공고일 최신순)";

  // 오피스텔·임대는 좌표 데이터가 없어 지도 표시 불가(1차 구현 범위 밖) — 강제로 목록뷰만 허용.
  const isMap = viewMode === "map" && !isOfficetelRental;
  return (
    <div className={isMap ? "flex flex-col flex-1 min-h-0" : ""}>
      {/* 세그먼트 컨트롤 + 보기 토글 */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 flex-none">
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
        {!isOfficetelRental && <MbViewToggle viewMode={viewMode} onChange={setViewMode} />}
      </div>

      <MbTabContent loading={query.isLoading} error={query.error} refetch={query.refetch}>
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3 flex-none">
          <span className="text-sm text-gray-500">총 {total.toLocaleString()}개</span>
          {!isMap && (
            <MbSortSelect sort={sort} onSortChange={onSortChange} options={sortOptions} defaultLabel={defaultSortLabel} />
          )}
        </div>

        {isMap ? (
          <div className="relative flex-1 min-h-0">
            <div className="absolute right-2 top-2 z-10">
              <MbMapToolbar active={activeLayer} onChange={setActiveLayer} />
            </div>
            <LazyClusterMap apartments={items as MbApartment[]} onSelect={setSelected} userLocation={userLocation} regionSelected={regionSelected} markerKind={isCompetition ? "competition" : "presale"} className="h-full" />
            {/* 툴바 레이어를 켰는데 단지 선택 전이면 안내 — 버튼만 켜지고 무반응인 혼란 방지(세션 319 E). */}
            {activeLayer && !selected && (
              <div className="absolute left-2 bottom-2 z-10 bg-white/90 rounded-md border border-gray-200 px-3 py-1.5 shadow-sm" role="status">
                <p className="text-xs text-gray-600">지도에서 단지를 선택하면 정보가 표시됩니다.</p>
              </div>
            )}
            {/* 선택 단지가 현재 목록에 있을 때만 카드 표시 — 세그먼트·페이지 전환 후 옛 선택 stale 방지.
                지도 위 absolute 좌하단 오버레이 — 부모 overflow-hidden 클립 영역 밖(세션 319 리뷰 B). */}
            {selected && (items as MbApartment[]).some((a) => a.id === selected.id) && (
              <div className="absolute left-2 right-2 bottom-2 z-10 sm:right-auto sm:max-w-md max-h-[55%] overflow-y-auto">
                <MbSelectedCard apt={selected} onClose={() => setSelected(null)}>
                  {activeLayer && (
                    <MbInfraOverlay apt={detailApt ?? selected} layer={activeLayer} loading={detailQuery.isLoading} error={detailQuery.isError} />
                  )}
                </MbSelectedCard>
              </div>
            )}
          </div>
        ) : (
          <>
            {isCompetition ? (
              <MbCompetitionTable
                apartments={items as MbApartment[]}
                isInCompare={isInCompare}
                onCompareToggle={onCompareToggle}
                compareFull={compareFull}
              />
            ) : isOfficetelRental ? (
              <MbOfficetelRentalTable items={items as MbOfficetelRentalItem[]} />
            ) : (
              <MbPresaleTable
                apartments={items as MbApartment[]}
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
