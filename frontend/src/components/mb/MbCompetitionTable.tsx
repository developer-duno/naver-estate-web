"use client";

import { memo } from "react";
import { useRouter } from "next/navigation";
import { Trophy } from "lucide-react";
import type { MbApartment } from "@/types";
import { EmptyState } from "@/components/ui/empty-state";

/** 분양결과(경쟁률) 테이블 — 경쟁률·접수자·공급세대 강조 (SRP, MbPresaleTable 과 컬럼셋 다름). */
interface Props {
  apartments: MbApartment[];
  isInCompare?: (id: string) => boolean;
  onCompareToggle?: (id: string, name: string) => void;
  compareFull?: boolean;
}

/** 경쟁률 강조 색 — 1:1 이상(미달 아님)이면 등급별. */
function rateClass(rate?: number | null): string {
  if (rate == null) return "text-gray-400";
  if (rate >= 10) return "text-red-600 font-bold";
  if (rate >= 1) return "text-purple-700 font-semibold";
  return "text-gray-500"; // 1:1 미만 = 미달
}

function MbCompetitionTable({ apartments, isInCompare, onCompareToggle, compareFull }: Props) {
  const router = useRouter();

  if (apartments.length === 0) {
    return (
      <EmptyState
        icon={Trophy}
        title="표시할 분양결과가 없어요"
        description="지역 조건을 바꾸거나 잠시 후 다시 조회해주세요"
      />
    );
  }

  const goDetail = (id: string) => router.push(`/mibunyang/${id}`);

  return (
    <>
      {/* 모바일: 카드뷰 */}
      <div className="md:hidden space-y-2" data-testid="mb-competition-cards">
        {apartments.map((apt) => {
          const cmp = isInCompare?.(apt.id) ?? false;
          return (
            <div
              key={apt.id}
              onClick={() => goDetail(apt.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") goDetail(apt.id); }}
              tabIndex={0}
              role="button"
              data-testid={`mb-competition-card-${apt.id}`}
              className="bg-white rounded-lg shadow-sm border p-3 cursor-pointer hover:bg-blue-50 active:bg-blue-100 transition-colors"
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="font-semibold text-blue-700 truncate flex-1">{apt.name}</span>
                {onCompareToggle && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCompareToggle(apt.id, apt.name);
                    }}
                    disabled={!cmp && compareFull}
                    className={`text-xs px-2 py-0.5 rounded border leading-none flex-none ${
                      cmp ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-300 disabled:opacity-30"
                    }`}
                    aria-label={cmp ? "비교 해제" : "비교 추가"}
                  >
                    {cmp ? "V" : "+"}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-1.5">
                <span>{apt.region}</span>
                <span className="text-gray-300">·</span>
                <span>{apt.gu ?? "-"}</span>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[10px] text-gray-400">경쟁률</div>
                  <div className={`text-lg leading-tight ${rateClass(apt.competition_rate)}`}>
                    {apt.competition_rate != null ? `${apt.competition_rate.toLocaleString()}:1` : "-"}
                  </div>
                </div>
                <div className="text-right text-[11px] text-gray-500">
                  <div>접수 {apt.competition_applicants?.toLocaleString() ?? "-"}명</div>
                  <div>공급 {apt.competition_supply?.toLocaleString() ?? "-"}세대</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 데스크톱: 테이블 */}
      <div className="hidden md:block overflow-x-auto bg-white rounded-lg shadow-sm border">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-100 border-b-2 border-gray-300">
            <tr>
              <th className="px-3 py-2.5 text-left text-gray-700 font-semibold">단지명</th>
              <th className="px-3 py-2.5 text-left text-gray-700 font-semibold">지역</th>
              <th className="px-3 py-2.5 text-left text-gray-700 font-semibold">유형</th>
              <th className="px-3 py-2.5 text-right text-gray-700 font-semibold">경쟁률</th>
              <th className="px-3 py-2.5 text-right text-gray-700 font-semibold">접수자수</th>
              <th className="px-3 py-2.5 text-right text-gray-700 font-semibold">공급세대</th>
              <th className="px-3 py-2.5 text-left text-gray-700 font-semibold hidden sm:table-cell">시공사</th>
            </tr>
          </thead>
          <tbody>
            {apartments.map((apt, i) => (
              <tr
                key={apt.id}
                onClick={() => goDetail(apt.id)}
                className={`cursor-pointer hover:bg-blue-50 transition-colors ${i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}`}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") goDetail(apt.id); }}
              >
                <td className="px-3 py-2 font-medium text-blue-700 hover:underline">{apt.name}</td>
                <td className="px-3 py-2 text-gray-600">{apt.region} {apt.gu ?? ""}</td>
                <td className="px-3 py-2 text-gray-600 text-xs">{apt.presale_type ?? "-"}</td>
                <td className={`px-3 py-2 text-right ${rateClass(apt.competition_rate)}`}>
                  {apt.competition_rate != null ? `${apt.competition_rate.toLocaleString()}:1` : "-"}
                </td>
                <td className="px-3 py-2 text-right text-gray-700">
                  {apt.competition_applicants?.toLocaleString() ?? "-"}
                </td>
                <td className="px-3 py-2 text-right text-gray-700">
                  {apt.competition_supply?.toLocaleString() ?? "-"}
                </td>
                <td className="px-3 py-2 text-gray-600 max-w-[120px] truncate hidden sm:table-cell">{apt.builder ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default memo(MbCompetitionTable);
