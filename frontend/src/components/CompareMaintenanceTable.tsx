"use client";

import React, { useMemo } from "react";
import type { PyeongDetail } from "@/types";

interface CompareMaintenanceTableProps {
  datasets: { name: string; details: PyeongDetail[] }[];
}

export default function CompareMaintenanceTable({ datasets }: CompareMaintenanceTableProps) {
  const allPyeongs = useMemo(() => {
    const map = new Map<number, string>();
    for (const ds of datasets) {
      for (const d of ds.details) {
        if (!map.has(d.pyeong_no)) map.set(d.pyeong_no, d.pyeong_name || `${d.pyeong_no}평`);
      }
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [datasets]);

  if (allPyeongs.length === 0) return <p className="text-gray-500 text-sm">관리비 데이터 없음</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-1 text-left border">평형</th>
            {datasets.map((ds) => (
              <th key={ds.name} className="px-2 py-1 text-center border">{ds.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* 단지 간 "관리비 최저 ★"·초록 강조는 지웠다(세션 472 PR 3) — 값만 */}
          {allPyeongs.map(([pyeongNo, pyeongName]) => (
            <tr key={pyeongNo}>
              <td className="px-2 py-1 border font-medium">{pyeongName}</td>
              {datasets.map((ds) => {
                const d = ds.details.find((x) => x.pyeong_no === pyeongNo);
                const cost = d?.avg_maintenance_cost ?? d?.latest_maintenance_cost;
                const summer = d?.summer_maintenance_cost;
                const winter = d?.winter_maintenance_cost;
                return (
                  <td key={`${ds.name}-${pyeongNo}`} className="px-2 py-1 border text-center">
                    {cost != null ? (
                      <>
                        {cost.toLocaleString()}만
                        {summer != null && winter != null && (
                          <span className="text-gray-400 text-[10px] block">
                            (여름 {summer.toLocaleString()} / 겨울 {winter.toLocaleString()})
                          </span>
                        )}
                      </>
                    ) : (
                      "-"
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
