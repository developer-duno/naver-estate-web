"use client";

import type { MbRegion } from "@/types";
import { formatKoreanPrice } from "@/lib/format";

interface Props {
  regions: MbRegion[];
}

export default function MbRegionStatsTable({ regions }: Props) {
  if (regions.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        지역 통계 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-white rounded-lg shadow-sm border">
      <table className="w-full text-sm border-collapse">
        <thead className="bg-gray-100 border-b-2 border-gray-300">
          <tr>
            <th className="px-3 py-2.5 text-left text-gray-700 font-semibold hidden md:table-cell">지역</th>
            <th className="px-3 py-2.5 text-left text-gray-700 font-semibold">시군구</th>
            <th className="px-3 py-2.5 text-right text-gray-700 font-semibold">인구</th>
            <th className="px-3 py-2.5 text-right text-gray-700 font-semibold hidden sm:table-cell">세대수</th>
            <th className="px-3 py-2.5 text-right text-gray-700 font-semibold">미분양</th>
            <th className="px-3 py-2.5 text-right text-gray-700 font-semibold">증감률</th>
            <th className="px-3 py-2.5 text-right text-gray-700 font-semibold hidden md:table-cell">평균소득</th>
            <th className="px-3 py-2.5 text-right text-gray-700 font-semibold hidden md:table-cell">공급비율</th>
            <th className="px-3 py-2.5 text-right text-gray-700 font-semibold hidden md:table-cell">전세율</th>
            <th className="px-3 py-2.5 text-right text-gray-700 font-semibold hidden sm:table-cell">평균시세</th>
          </tr>
        </thead>
        <tbody>
          {regions.map((r, i) => (
            <tr key={r.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
              <td className="px-3 py-2 text-gray-700 hidden md:table-cell">{r.region}</td>
              <td className="px-3 py-2 text-gray-600">{r.gu ?? r.region}</td>
              <td className="px-3 py-2 text-right">{r.population?.toLocaleString() ?? "-"}</td>
              <td className="px-3 py-2 text-right hidden sm:table-cell">{r.households?.toLocaleString() ?? "-"}</td>
              <td className="px-3 py-2 text-right font-medium text-red-600">
                {r.regional_unsold?.toLocaleString() ?? "-"}
              </td>
              <td className="px-3 py-2 text-right">
                {r.pop_growth != null ? `${r.pop_growth > 0 ? "+" : ""}${r.pop_growth.toFixed(2)}%` : "-"}
              </td>
              <td className="px-3 py-2 text-right hidden md:table-cell">
                {r.avg_income != null ? `${r.avg_income.toLocaleString()}만` : "-"}
              </td>
              <td className="px-3 py-2 text-right hidden md:table-cell">
                {r.supply_ratio != null ? `${r.supply_ratio.toFixed(1)}%` : "-"}
              </td>
              <td className="px-3 py-2 text-right hidden md:table-cell">
                {r.jeonse_rate != null ? `${r.jeonse_rate.toFixed(1)}%` : "-"}
              </td>
              <td className="px-3 py-2 text-right hidden sm:table-cell">
                {r.avg_price != null ? formatKoreanPrice(r.avg_price) : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
