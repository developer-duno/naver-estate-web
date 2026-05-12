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
    <>
      {/* 모바일: 카드뷰 (non-interactive, 클릭 없음) */}
      <div className="md:hidden space-y-2" data-testid="mb-region-cards">
        {regions.map((r) => (
          <div
            key={r.id}
            data-testid={`mb-region-card-${r.id}`}
            className="bg-white rounded-lg shadow-sm border p-3"
          >
            {/* 1행: 지역 / 시군구 */}
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="font-semibold text-gray-800">
                {r.gu ?? r.region}
              </span>
              <span className="text-[11px] text-gray-500">{r.region}</span>
            </div>
            {/* 2행: 인구·세대수 */}
            <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-1">
              <span>인구 {r.population?.toLocaleString() ?? "-"}</span>
              <span className="text-gray-300">·</span>
              <span>세대 {r.households?.toLocaleString() ?? "-"}</span>
              {r.pop_growth != null && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className={r.pop_growth >= 0 ? "text-green-600" : "text-red-600"}>
                    {r.pop_growth > 0 ? "+" : ""}{r.pop_growth.toFixed(2)}%
                  </span>
                </>
              )}
            </div>
            {/* 3행: 미분양 강조 + 평균가 */}
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-500">미분양</span>
              <span className="font-semibold text-red-600">
                {r.regional_unsold?.toLocaleString() ?? "-"}
              </span>
            </div>
            {/* 4행: 평균가·전세율·공급 */}
            <div className="flex items-center flex-wrap gap-1.5 text-[11px] text-gray-500">
              {r.avg_price != null && (
                <span>평균 {formatKoreanPrice(r.avg_price)}</span>
              )}
              {r.jeonse_rate != null && (
                <>
                  <span className="text-gray-300">·</span>
                  <span>전세율 {r.jeonse_rate.toFixed(1)}%</span>
                </>
              )}
              {r.supply_ratio != null && (
                <>
                  <span className="text-gray-300">·</span>
                  <span>공급 {r.supply_ratio.toFixed(1)}%</span>
                </>
              )}
            </div>
            {/* 5행: ㎡당시세·초기분양률·토지비율 */}
            {(r.avg_price_sqm != null || r.initial_sale_rate != null || r.land_cost_ratio != null) && (
              <div className="flex items-center flex-wrap gap-1.5 text-[11px] text-gray-500 mt-0.5">
                {r.avg_price_sqm != null && (
                  <span>㎡당 {formatKoreanPrice(r.avg_price_sqm)}</span>
                )}
                {r.initial_sale_rate != null && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span>초기분양 {r.initial_sale_rate.toFixed(1)}%</span>
                  </>
                )}
                {r.land_cost_ratio != null && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span>토지비 {r.land_cost_ratio.toFixed(1)}%</span>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 데스크톱: 테이블 */}
      <div className="hidden md:block overflow-x-auto bg-white rounded-lg shadow-sm border">
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
            <th className="px-3 py-2.5 text-right text-gray-700 font-semibold hidden lg:table-cell">㎡당시세</th>
            <th className="px-3 py-2.5 text-right text-gray-700 font-semibold hidden lg:table-cell">초기분양률</th>
            <th className="px-3 py-2.5 text-right text-gray-700 font-semibold hidden lg:table-cell">토지비율</th>
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
              <td className="px-3 py-2 text-right hidden lg:table-cell">
                {r.avg_price_sqm != null ? formatKoreanPrice(r.avg_price_sqm) : "-"}
              </td>
              <td className="px-3 py-2 text-right hidden lg:table-cell">
                {r.initial_sale_rate != null ? `${r.initial_sale_rate.toFixed(1)}%` : "-"}
              </td>
              <td className="px-3 py-2 text-right hidden lg:table-cell">
                {r.land_cost_ratio != null ? `${r.land_cost_ratio.toFixed(1)}%` : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}
