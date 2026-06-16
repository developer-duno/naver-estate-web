"use client";

import { memo } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import type { MbApartment } from "@/types";
import { normalizePp } from "@/lib/mb-format";
import { useMbFavorites } from "@/hooks/useMbFavorites";
import { EmptyState } from "@/components/ui/empty-state";

/** 분양 단지 테이블 (민간분양·LH공공분양 세그먼트 공용).
 * 미분양 중심 MbApartmentTable 과 컬럼셋이 달라 별도 (분양유형·단계·경쟁률 강조, SRP). */
interface Props {
  apartments: MbApartment[];
  isInCompare?: (id: string) => boolean;
  onCompareToggle?: (id: string, name: string) => void;
  compareFull?: boolean;
}

function stageBadgeClass(stage?: string | null): string {
  switch (stage) {
    case "청약중":
      return "bg-green-100 text-green-700";
    case "분양중":
      return "bg-blue-100 text-blue-700";
    case "분양계획":
      return "bg-amber-100 text-amber-700";
    case "미분양":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function MbPresaleTable({ apartments, isInCompare, onCompareToggle, compareFull }: Props) {
  const router = useRouter();
  const { isFavorite, toggle: toggleFav } = useMbFavorites();

  if (apartments.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="표시할 분양 단지가 없어요"
        description="지역·단계 조건을 바꾸거나 잠시 후 다시 조회해주세요"
      />
    );
  }

  const goDetail = (id: string) => router.push(`/mibunyang/${id}`);

  return (
    <>
      {/* 모바일: 카드뷰 (md 미만) */}
      <div className="md:hidden space-y-2" data-testid="mb-presale-cards">
        {apartments.map((apt) => {
          const fav = isFavorite(apt.id);
          const cmp = isInCompare?.(apt.id) ?? false;
          return (
            <div
              key={apt.id}
              onClick={() => goDetail(apt.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") goDetail(apt.id); }}
              tabIndex={0}
              role="button"
              data-testid={`mb-presale-card-${apt.id}`}
              className="bg-white rounded-lg shadow-sm border p-3 cursor-pointer hover:bg-blue-50 active:bg-blue-100 transition-colors"
            >
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
              <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-1">
                <span>{apt.region}</span>
                <span className="text-gray-300">·</span>
                <span>{apt.gu ?? "-"}</span>
                {apt.presale_stage && (
                  <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium ${stageBadgeClass(apt.presale_stage)}`}>
                    {apt.presale_stage}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm mb-1">
                {apt.presale_type && (
                  <span className="text-gray-500 text-xs">{apt.presale_type}</span>
                )}
                {apt.competition_rate != null && (
                  <span className="ml-auto font-semibold text-purple-700">
                    {apt.competition_rate.toLocaleString()}:1
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] mb-1">
                {normalizePp(apt.presale_pp) != null && (
                  <span className="text-amber-700">평당 {apt.presale_pp!.toLocaleString()}만</span>
                )}
                {apt.presale_min_price != null && (
                  <>
                    {normalizePp(apt.presale_pp) != null && <span className="text-gray-300">·</span>}
                    <span className="text-gray-600">최저 {apt.presale_min_price.toLocaleString()}만</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-gray-500 truncate">
                <span>입주 {apt.presale_move_in ?? "-"}</span>
                <span className="text-gray-300">·</span>
                <span className="truncate">{apt.builder ?? "-"}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 데스크톱: 테이블 (md 이상) */}
      <div className="hidden md:block overflow-x-auto bg-white rounded-lg shadow-sm border">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-100 border-b-2 border-gray-300">
            <tr>
              <th className="px-2 py-2.5 text-center text-gray-700 font-semibold w-10" aria-label="액션" />
              <th className="px-3 py-2.5 text-left text-gray-700 font-semibold">단지명</th>
              <th className="px-3 py-2.5 text-left text-gray-700 font-semibold">지역</th>
              <th className="px-3 py-2.5 text-left text-gray-700 font-semibold">유형</th>
              <th className="px-3 py-2.5 text-left text-gray-700 font-semibold">단계</th>
              <th className="px-3 py-2.5 text-right text-gray-700 font-semibold">세대수</th>
              <th className="px-3 py-2.5 text-right text-gray-700 font-semibold">경쟁률</th>
              <th className="px-3 py-2.5 text-right text-gray-700 font-semibold">분양가(최저)</th>
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
                  onClick={() => goDetail(apt.id)}
                  className={`cursor-pointer hover:bg-blue-50 transition-colors ${i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}`}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") goDetail(apt.id); }}
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
                  <td className="px-3 py-2 text-gray-600">{apt.region} {apt.gu ?? ""}</td>
                  <td className="px-3 py-2 text-gray-600 text-xs">{apt.presale_type ?? "-"}</td>
                  <td className="px-3 py-2">
                    {apt.presale_stage ? (
                      <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${stageBadgeClass(apt.presale_stage)}`}>
                        {apt.presale_stage}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{apt.units?.toLocaleString() ?? "-"}</td>
                  <td className="px-3 py-2 text-right font-medium text-purple-700">
                    {apt.competition_rate != null ? `${apt.competition_rate.toLocaleString()}:1` : "-"}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">
                    {apt.presale_min_price != null ? `${apt.presale_min_price.toLocaleString()}만` : "-"}
                  </td>
                  <td className="px-3 py-2 text-gray-600 hidden sm:table-cell">{apt.presale_move_in ?? "-"}</td>
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

export default memo(MbPresaleTable);
