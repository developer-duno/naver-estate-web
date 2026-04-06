"use client";

import React, { useMemo } from "react";
import { formatChartPrice } from "@/lib/format";
import { getBestIndices } from "@/lib/compare-utils";
import type { PriceStats } from "@/types";

interface CompareAreaPriceTableProps {
  datasets: { name: string; stats: PriceStats }[];
}

export default function CompareAreaPriceTable({ datasets }: CompareAreaPriceTableProps) {
  const allLabels = useMemo(() => {
    const set = new Set<string>();
    for (const ds of datasets) {
      for (const a of ds.stats.by_area) set.add(a.label);
    }
    return Array.from(set).sort();
  }, [datasets]);

  if (allLabels.length === 0) return <p className="text-gray-500 text-sm">면적별 데이터 없음</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-1 text-left border">면적</th>
            {datasets.map((ds) => (
              <th key={ds.name} colSpan={2} className="px-2 py-1 text-center border">
                {ds.name}
              </th>
            ))}
          </tr>
          <tr>
            <th className="px-2 py-1 border" />
            {datasets.map((ds) => (
              <React.Fragment key={`${ds.name}-hd`}>
                <th className="px-2 py-1 text-center border text-red-500">매매</th>
                <th className="px-2 py-1 text-center border text-blue-500">전세</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {allLabels.map((label) => {
            const maemaeVals = datasets.map((ds) => {
              const a = ds.stats.by_area.find((x) => x.label === label);
              return a?.maemae ?? null;
            });
            const maeemaeBest = getBestIndices(maemaeVals, "higher");

            const jeonseVals = datasets.map((ds) => {
              const a = ds.stats.by_area.find((x) => x.label === label);
              return a?.jeonse ?? null;
            });
            const jeonseBest = getBestIndices(jeonseVals, "higher");

            return (
              <tr key={label}>
                <td className="px-2 py-1 border font-medium">{label}</td>
                {datasets.map((ds, di) => {
                  const a = ds.stats.by_area.find((x) => x.label === label);
                  const mVal = a?.maemae;
                  const jVal = a?.jeonse;
                  const mCnt = a?.maemae_count;
                  const jCnt = a?.jeonse_count;
                  return (
                    <React.Fragment key={`${ds.name}-${label}`}>
                      <td
                        className={`px-2 py-1 border text-center ${maeemaeBest.includes(di) ? "bg-green-50 font-bold" : ""}`}
                      >
                        {mVal != null ? `${formatChartPrice(mVal)}${mCnt ? ` (${mCnt}건)` : ""}` : "-"}
                      </td>
                      <td
                        className={`px-2 py-1 border text-center ${jeonseBest.includes(di) ? "bg-green-50 font-bold" : ""}`}
                      >
                        {jVal != null ? `${formatChartPrice(jVal)}${jCnt ? ` (${jCnt}건)` : ""}` : "-"}
                      </td>
                    </React.Fragment>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
