"use client";

/**
 * 지도뷰 툴바 활성 레이어에 따른 선택 단지 인프라 정보 표시.
 * MbSelectedCard children 슬롯에 삽입. 데이터 없으면 "정보 없음" 표시.
 * 세션 318 3단계. 중첩 객체 경로: apt.school / apt.transport / apt.infra.
 */

import type { MbApartment } from "@/types";
import type { ToolbarLayer } from "./MbMapToolbar";

interface Props {
  apt: MbApartment;
  layer: ToolbarLayer;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}

function noData() {
  return <p className="text-sm text-gray-400">이 단지는 해당 정보가 없습니다.</p>;
}

function SchoolInfo({ apt }: { apt: MbApartment }) {
  const walk = apt.naver_school_walk_min;
  const grade = apt.school?.school_grade;
  if (walk == null && !grade) return noData();
  return (
    <div className="space-y-1">
      {walk != null && <Row label="초등 도보" value={`${walk}분`} />}
      {grade && <Row label="학군 등급" value={grade} />}
    </div>
  );
}

function TransitInfo({ apt }: { apt: MbApartment }) {
  const dist = apt.transport?.subway_dist;
  const name = apt.transport?.subway_name;
  const lines = apt.transport?.subway_lines;
  if (dist == null && !name) return noData();
  return (
    <div className="space-y-1">
      {name && <Row label="지하철역" value={name + (lines ? ` (${lines})` : "")} />}
      {dist != null && <Row label="거리" value={dist >= 1000 ? `${(dist / 1000).toFixed(1)}km` : `${dist}m`} />}
    </div>
  );
}

function SafetyInfo({ apt }: { apt: MbApartment }) {
  const grade = apt.infra?.crime_grade ?? (apt.crime_safety_grade != null ? String(apt.crime_safety_grade) : null);
  if (!grade) return noData();
  return (
    <div className="space-y-1">
      <Row label="안전 등급" value={grade} />
    </div>
  );
}

function AirInfo({ apt }: { apt: MbApartment }) {
  const grade = apt.infra?.air_grade;
  if (!grade) return noData();
  return (
    <div className="space-y-1">
      <Row label="대기질 등급" value={grade} />
    </div>
  );
}

function ChildcareInfo({ apt }: { apt: MbApartment }) {
  const count = apt.infra?.childcare_count;
  const dist = apt.infra?.childcare_nearest_dist;
  const name = apt.infra?.childcare_nearest_name;
  if (count == null && !name) return noData();
  return (
    <div className="space-y-1">
      {count != null && <Row label="주변 어린이집" value={`${count}개`} />}
      {name && <Row label="가장 가까운 곳" value={name} />}
      {dist != null && <Row label="거리" value={dist >= 1000 ? `${(dist / 1000).toFixed(1)}km` : `${dist}m`} />}
    </div>
  );
}

const LAYER_TITLES: Record<ToolbarLayer, string> = {
  school: "🏫 학군 정보",
  transit: "🚇 교통 정보",
  safety: "🛡️ 안전 정보",
  air: "🌫️ 대기질 정보",
  childcare: "👶 어린이집 정보",
};

export default function MbInfraOverlay({ apt, layer }: Props) {
  return (
    <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
      <p className="text-xs font-semibold text-blue-700 mb-2">{LAYER_TITLES[layer]}</p>
      {layer === "school" && <SchoolInfo apt={apt} />}
      {layer === "transit" && <TransitInfo apt={apt} />}
      {layer === "safety" && <SafetyInfo apt={apt} />}
      {layer === "air" && <AirInfo apt={apt} />}
      {layer === "childcare" && <ChildcareInfo apt={apt} />}
    </div>
  );
}
