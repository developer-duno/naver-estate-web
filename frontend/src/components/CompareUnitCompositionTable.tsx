"use client";

import React, { useMemo } from "react";
import type { PyeongDetail } from "@/types";

interface CompareUnitCompositionTableProps {
  datasets: { name: string; details: PyeongDetail[] }[];
}

export default function CompareUnitCompositionTable({ datasets }: CompareUnitCompositionTableProps) {
  const allPyeongs = useMemo(() => {
    const map = new Map<number, string>();
    for (const ds of datasets) {
      for (const d of ds.details) {
        if (!map.has(d.pyeong_no)) map.set(d.pyeong_no, d.pyeong_name || `${d.pyeong_no}평`);
      }
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [datasets]);

  if (allPyeongs.length === 0) return <p className="text-gray-500 text-sm">세대 구성 데이터 없음</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-1 text-left border">평형</th>
            {datasets.map((ds) => (
              <th key={ds.name} colSpan={2} className="px-2 py-1 text-center border">{ds.name}</th>
            ))}
          </tr>
          <tr>
            <th className="px-2 py-1 border" />
            {datasets.map((ds) => (
              <React.Fragment key={`${ds.name}-uc`}>
                <th className="px-2 py-1 text-center border">방/욕실</th>
                <th className="px-2 py-1 text-center border">세대수</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {allPyeongs.map(([pyeongNo, pyeongName]) => (
            <tr key={pyeongNo}>
              <td className="px-2 py-1 border font-medium">{pyeongName}</td>
              {datasets.map((ds) => {
                const d = ds.details.find((x) => x.pyeong_no === pyeongNo);
                return (
                  <React.Fragment key={`${ds.name}-${pyeongNo}`}>
                    <td className="px-2 py-1 border text-center">
                      {d?.room_count != null ? `${d.room_count}/${d.bathroom_count ?? "-"}` : "-"}
                    </td>
                    <td className="px-2 py-1 border text-center">
                      {d?.household_count_by_pyeong ?? "-"}
                    </td>
                  </React.Fragment>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
