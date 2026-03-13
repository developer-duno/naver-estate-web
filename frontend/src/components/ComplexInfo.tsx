"use client";

import React, { useState } from "react";
import type { Complex, PyeongDetail } from "@/types";
import { formatDateFull } from "@/lib/format";

interface Props {
  complex: Complex;
  pyeongDetails: PyeongDetail[];
}

export default function ComplexInfo({ complex: cpx, pyeongDetails }: Props) {
  const [tab, setTab] = useState<"info" | "area">("info");

  return (
    <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
      {/* 탭 */}
      <div className="flex border-b" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "info"}
          aria-controls="tabpanel-info"
          id="tab-info"
          onClick={() => setTab("info")}
          className={`px-4 py-2.5 text-sm font-medium ${
            tab === "info" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          단지정보
        </button>
        <button
          role="tab"
          aria-selected={tab === "area"}
          aria-controls="tabpanel-area"
          id="tab-area"
          onClick={() => setTab("area")}
          className={`px-4 py-2.5 text-sm font-medium ${
            tab === "area" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          면적별 정보
        </button>
      </div>

      <div className="p-4" role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "info" ? <BasicInfo cpx={cpx} /> : <PyeongDetails details={pyeongDetails} />}
      </div>
    </div>
  );
}

function BasicInfo({ cpx }: { cpx: Complex }) {
  const rows: [string, string][] = [];

  // 주소: 상세주소 우선, 없으면 cortarAddress
  const addr = cpx.address || cpx.cortar_address;
  if (addr) rows.push(["주소", addr]);
  if (cpx.road_address) rows.push(["도로명", cpx.road_address]);
  if (cpx.total_household_count != null) rows.push(["세대수", `${cpx.total_household_count.toLocaleString()}세대`]);
  if (cpx.high_floor != null) rows.push(["저/최고층", `${cpx.low_floor || 1}층 ~ ${cpx.high_floor}층`]);
  if (cpx.total_dong_count != null) rows.push(["동수", `${cpx.total_dong_count}개동`]);
  if (cpx.use_approve_ymd) {
    const formatted = formatDateFull(cpx.use_approve_ymd);
    rows.push(["사용승인일", formatted]);
  }
  if (cpx.construction_company) rows.push(["건설사", cpx.construction_company]);
  if (cpx.heat_method_type) rows.push(["난방", cpx.heat_method_type]);
  // 주차: 총주차대수 + 세대당 주차대수
  if (cpx.total_parking_count != null) {
    let parkStr = `${cpx.total_parking_count.toLocaleString()}대`;
    if (cpx.parking_count_by_household != null) {
      parkStr += ` (세대당 ${cpx.parking_count_by_household}대)`;
    }
    rows.push(["주차", parkStr]);
  }
  if (cpx.floor_area_ratio) rows.push(["용적률", `${cpx.floor_area_ratio}%`]);
  if (cpx.building_coverage_ratio) rows.push(["건폐율", `${cpx.building_coverage_ratio}%`]);
  if (cpx.real_estate_type_name) rows.push(["유형", cpx.real_estate_type_name]);
  if (cpx.management_office_tel) rows.push(["관리사무소", cpx.management_office_tel]);

  if (rows.length === 0) {
    return <p className="text-gray-500 text-sm">단지 상세 정보가 아직 수집되지 않았습니다.</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex gap-2">
          <span className="text-sm text-gray-500 font-medium shrink-0 w-20">{label}</span>
          <span className="text-sm">{value}</span>
        </div>
      ))}
    </div>
  );
}

function PyeongDetails({ details }: { details: PyeongDetail[] }) {
  if (details.length === 0) {
    return <p className="text-gray-500 text-sm">면적별 정보가 아직 수집되지 않았습니다.</p>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {details.map((pd) => (
        <PyeongCard key={pd.pyeong_no} detail={pd} />
      ))}
    </div>
  );
}

/** 관리비 포맷 (원 → "186,482원 (2025.12)") */
function formatMaintCost(cost: number, basis?: string): string {
  const costStr = cost >= 10000
    ? `${cost.toLocaleString()}원 (약 ${Math.floor(cost / 10000)}만원)`
    : `${cost.toLocaleString()}원`;
  if (basis && basis.length === 6) {
    return `${costStr} (${basis.slice(0, 4)}.${basis.slice(4)})`;
  }
  return costStr;
}

function PyeongCard({ detail: pd }: { detail: PyeongDetail }) {
  const [showPlan, setShowPlan] = useState(false);

  const title = pd.pyeong_name && pd.exclusive_area
    ? `${pd.pyeong_name}평 (${pd.exclusive_area}㎡)`
    : pd.exclusive_area
    ? `${pd.exclusive_area}㎡`
    : `면적 ${pd.pyeong_no}`;

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
        {/* 관리비: 최신 관리비+기준월 우선, 없으면 평균 관리비 */}
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
      {/* 평면도 이미지 */}
      {pd.floor_plan_url && (
        <div className="mt-2">
          <button
            onClick={() => setShowPlan(!showPlan)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            {showPlan ? "평면도 접기 ▲" : "평면도 보기 ▼"}
          </button>
          {showPlan && (
            <div className="mt-1">
              <img
                src={pd.floor_plan_url}
                alt={`${pd.pyeong_name || ""}평 평면도`}
                className="max-h-48 border rounded"
                loading="lazy"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
