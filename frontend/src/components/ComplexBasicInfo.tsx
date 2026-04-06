"use client";

import type { Complex } from "@/types";
import { formatDateFull } from "@/lib/format";

/** 단지 기본정보 탭 — 주소, 세대수, 층수, 주차 등 */
export default function ComplexBasicInfo({ cpx }: { cpx: Complex }) {
  const rows: [string, string][] = [];
  const addr = cpx.address || cpx.cortar_address;
  if (addr) rows.push(["주소", addr]);
  if (cpx.road_address) rows.push(["도로명", cpx.road_address]);
  if (cpx.total_household_count != null) rows.push(["세대수", `${cpx.total_household_count.toLocaleString()}세대`]);
  if (cpx.high_floor != null) rows.push(["저/최고층", `${cpx.low_floor || 1}층 ~ ${cpx.high_floor}층`]);
  if (cpx.total_dong_count != null) rows.push(["동수", `${cpx.total_dong_count}개동`]);
  if (cpx.use_approve_ymd) {
    rows.push(["사용승인일", formatDateFull(cpx.use_approve_ymd)]);
  }
  if (cpx.construction_company) rows.push(["건설사", cpx.construction_company]);
  if (cpx.heat_method_type) rows.push(["난방", cpx.heat_method_type]);
  if (cpx.total_parking_count != null) {
    let s = `${cpx.total_parking_count.toLocaleString()}대`;
    if (cpx.parking_count_by_household != null) s += ` (세대당 ${cpx.parking_count_by_household}대)`;
    rows.push(["주차", s]);
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
          <span className="text-sm text-gray-500 font-medium shrink-0 w-24">{label}</span>
          <span className="text-sm">{value}</span>
        </div>
      ))}
    </div>
  );
}
