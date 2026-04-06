"use client";

import { useState } from "react";
import Image from "next/image";
import type { PyeongDetail } from "@/types";

/** 관리비 포매팅 (원 단위 + 기준월) */
function formatMaintCost(cost: number, basis?: string): string {
  const s = cost >= 10000
    ? `${cost.toLocaleString()}원 (약 ${Math.floor(cost / 10000)}만원)`
    : `${cost.toLocaleString()}원`;
  if (basis && basis.length === 6) return `${s} (${basis.slice(0, 4)}.${basis.slice(4)})`;
  return s;
}

/** 면적별 정보 목록 — PyeongCard 그리드 */
export function PyeongDetailsList({ details }: { details: PyeongDetail[] }) {
  if (details.length === 0) {
    return <p className="text-gray-500 text-sm">면적별 정보가 아직 수집되지 않았습니다.</p>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {details.map((pd) => <PyeongCard key={pd.pyeong_no} detail={pd} />)}
    </div>
  );
}

/** 면적 카드 — 공급/전용, 방/욕실, 관리비, 평면도 */
function PyeongCard({ detail: pd }: { detail: PyeongDetail }) {
  const [showPlan, setShowPlan] = useState(false);
  const title = pd.pyeong_name && pd.exclusive_area
    ? `${pd.pyeong_name} (${pd.exclusive_area}㎡${pd.exclusive_pyeong ? `, ${pd.exclusive_pyeong}평` : ""})`
    : pd.exclusive_area ? `${pd.exclusive_area}㎡` : `면적 ${pd.pyeong_no}`;

  return (
    <div className="border rounded-lg p-3">
      <h4 className="text-sm font-semibold text-blue-700 mb-2">{title}</h4>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {pd.supply_area && pd.exclusive_area && (
          <>
            <span className="text-gray-500">공급/전용</span>
            <span>
              {pd.supply_area}㎡{pd.supply_pyeong ? `(${pd.supply_pyeong}평)` : ""}{" / "}
              {pd.exclusive_area}㎡{pd.exclusive_pyeong ? `(${pd.exclusive_pyeong}평)` : ""}
              {pd.exclusive_rate && ` 전용률 ${pd.exclusive_rate}%`}
            </span>
          </>
        )}
        {(pd.room_count || pd.bathroom_count) && (
          <>
            <span className="text-gray-500">방/욕실</span>
            <span>{pd.room_count ?? "-"}개 / {pd.bathroom_count ?? "-"}개</span>
          </>
        )}
        {pd.household_count_by_pyeong && (
          <>
            <span className="text-gray-500">해당면적 세대수</span>
            <span>{pd.household_count_by_pyeong}세대</span>
          </>
        )}
        {pd.entrance_type && (
          <>
            <span className="text-gray-500">현관구조</span>
            <span>{pd.entrance_type}</span>
          </>
        )}
        {pd.latest_maintenance_cost ? (
          <>
            <span className="text-gray-500">공용관리비</span>
            <span>{formatMaintCost(pd.latest_maintenance_cost, pd.maintenance_cost_basis)}</span>
          </>
        ) : pd.avg_maintenance_cost ? (
          <>
            <span className="text-gray-500">평균관리비</span>
            <span>{pd.avg_maintenance_cost.toLocaleString()}원</span>
          </>
        ) : null}
        {(pd.summer_maintenance_cost || pd.winter_maintenance_cost) && (
          <>
            <span className="text-gray-500">여름/겨울</span>
            <span>
              {pd.summer_maintenance_cost ? `${pd.summer_maintenance_cost.toLocaleString()}원` : "-"}
              {" / "}
              {pd.winter_maintenance_cost ? `${pd.winter_maintenance_cost.toLocaleString()}원` : "-"}
            </span>
          </>
        )}
      </div>
      {pd.floor_plan_url && (
        <div className="mt-2">
          <button onClick={() => setShowPlan(!showPlan)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            {showPlan ? "평면도 접기 ▲" : "평면도 보기 ▼"}
          </button>
          {showPlan && (
            <div className="mt-1">
              <Image src={pd.floor_plan_url} alt={`${pd.pyeong_name || pd.exclusive_area || ""} 평면도`} width={300} height={200} className="max-h-48 border rounded object-contain" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
