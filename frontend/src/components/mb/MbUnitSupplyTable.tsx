"use client";

import type { MbUnitSupply, MbPresaleSummary } from "@/types";
import { formatPresaleHouseType } from "@/lib/mb-presale-format";
import { formatKoreanPrice } from "@/lib/format";

/** 평형별 공급정보 표 + 특공 유형별 세대수 (BE special_supply_breakdown 소비). */
interface Props {
  units: MbUnitSupply[];
  summary?: MbPresaleSummary;
}

export default function MbUnitSupplyTable({ units, summary }: Props) {
  if (!units || units.length === 0) {
    return <p className="text-sm text-gray-400">등록된 평형별 공급정보가 없습니다.</p>;
  }

  return (
    <div className="space-y-4">
      {/* 평형별 공급 표 */}
      <div className="overflow-x-auto border rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-3 py-2 text-left text-gray-600">평형</th>
              <th className="px-3 py-2 text-right text-gray-600">일반공급</th>
              <th className="px-3 py-2 text-right text-gray-600">특별공급</th>
              <th className="px-3 py-2 text-right text-gray-600">분양최고가</th>
              <th className="px-3 py-2 text-left text-gray-600 hidden sm:table-cell">특공 세부</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u, i) => (
              <tr key={u.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                <td className="px-3 py-2 font-medium text-gray-800">{formatPresaleHouseType(u.house_ty)}</td>
                <td className="px-3 py-2 text-right text-gray-700">{u.general_supply?.toLocaleString() ?? "-"}</td>
                <td className="px-3 py-2 text-right text-gray-700">{u.special_supply?.toLocaleString() ?? "-"}</td>
                <td className="px-3 py-2 text-right text-gray-700">
                  {u.top_amount != null ? formatKoreanPrice(u.top_amount) : "-"}
                </td>
                <td className="px-3 py-2 hidden sm:table-cell">
                  {u.special_supply_breakdown.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {u.special_supply_breakdown.map((b) => (
                        <span key={b.key} className="text-[11px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700">
                          {b.label} {b.count}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 요약 집계 (BE presale_summary — FE 합산 금지) */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryStat label="총 공급" value={`${summary.total_supply.toLocaleString()}세대`} />
          <SummaryStat label="일반공급" value={`${summary.total_general_supply.toLocaleString()}세대`} />
          <SummaryStat label="특별공급" value={`${summary.total_special_supply.toLocaleString()}세대`} />
          <SummaryStat
            label="분양최고가"
            value={summary.max_top_amount != null ? formatKoreanPrice(summary.max_top_amount) : "-"}
          />
        </div>
      )}

      {/* 특공 유형별 합산 (전 평형) */}
      {summary && summary.special_by_type_total.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1.5">특별공급 유형별 (전 평형 합산)</p>
          <div className="flex flex-wrap gap-1.5">
            {summary.special_by_type_total.map((b) => (
              <span key={b.key} className="text-xs px-2 py-1 rounded-md bg-purple-50 text-purple-700 font-medium">
                {b.label} {b.count.toLocaleString()}세대
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-md p-2.5 text-center">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="text-sm font-bold text-gray-900 mt-0.5">{value}</div>
    </div>
  );
}
