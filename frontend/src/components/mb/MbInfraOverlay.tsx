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
  /** 상세(중첩 infra/school/transport) lazy fetch 진행 중 — 평탄 폴백 없을 때 스켈레톤 표시 (세션 319 A). */
  loading?: boolean;
  /** 상세 fetch 실패 — 에러 삼킴 금지(error-propagation.md), 안내 표시 (세션 319 A). */
  error?: boolean;
}

/** 각 레이어 컴포넌트 공통 props — apt + lazy fetch 상태 (세션 319 A). */
interface LayerProps {
  apt: MbApartment;
  loading?: boolean;
  error?: boolean;
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

function loadingRow() {
  return <p className="text-sm text-gray-400">정보를 불러오는 중...</p>;
}

function errorRow() {
  return <p className="text-sm text-red-500">정보를 불러오지 못했습니다.</p>;
}

function SchoolInfo({ apt, loading, error }: LayerProps) {
  const walk = apt.naver_school_walk_min;
  const grade = apt.school?.school_grade;
  if (walk == null && !grade) return error ? errorRow() : loading ? loadingRow() : noData();
  return (
    <div className="space-y-1">
      {walk != null && <Row label="초등 도보" value={`${walk}분`} />}
      {grade && <Row label="학군 등급" value={grade} />}
    </div>
  );
}

function TransitInfo({ apt, loading, error }: LayerProps) {
  const dist = apt.transport?.subway_dist;
  const name = apt.transport?.subway_name;
  const lines = apt.transport?.subway_lines;
  if (dist == null && !name) return error ? errorRow() : loading ? loadingRow() : noData();
  return (
    <div className="space-y-1">
      {name && <Row label="지하철역" value={name + (lines ? ` (${lines})` : "")} />}
      {dist != null && <Row label="거리" value={dist >= 1000 ? `${(dist / 1000).toFixed(1)}km` : `${dist}m`} />}
    </div>
  );
}

function SafetyInfo({ apt, loading, error }: LayerProps) {
  // 지역 안전등급(infra.crime_grade, A~E letter)과 단지 안전등급(crime_safety_grade, 1~5 숫자)은
  // 별개 지표 — 라벨 분리 + 단지 등급엔 범례(1=안전) 명시 (EnvironmentSection:177 답습, 세션 319 C).
  const regionGrade = apt.infra?.crime_grade;
  const complexGrade = apt.crime_safety_grade;
  if (!regionGrade && complexGrade == null) return error ? errorRow() : loading ? loadingRow() : noData();
  return (
    <div className="space-y-1">
      {regionGrade && <Row label="지역 안전 등급" value={regionGrade} />}
      {complexGrade != null && <Row label="단지 안전 등급" value={`${complexGrade}등급 (1=안전)`} />}
    </div>
  );
}

function AirInfo({ apt, loading, error }: LayerProps) {
  const grade = apt.infra?.air_grade;
  if (!grade) return error ? errorRow() : loading ? loadingRow() : noData();
  return (
    <div className="space-y-1">
      <Row label="대기질 등급" value={grade} />
    </div>
  );
}

function ChildcareInfo({ apt, loading, error }: LayerProps) {
  const count = apt.infra?.childcare_count;
  const dist = apt.infra?.childcare_nearest_dist;
  const name = apt.infra?.childcare_nearest_name;
  if (count == null && !name) return error ? errorRow() : loading ? loadingRow() : noData();
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

export default function MbInfraOverlay({ apt, layer, loading, error }: Props) {
  return (
    <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
      <p className="text-xs font-semibold text-blue-700 mb-2">{LAYER_TITLES[layer]}</p>
      {layer === "school" && <SchoolInfo apt={apt} loading={loading} error={error} />}
      {layer === "transit" && <TransitInfo apt={apt} loading={loading} error={error} />}
      {layer === "safety" && <SafetyInfo apt={apt} loading={loading} error={error} />}
      {layer === "air" && <AirInfo apt={apt} loading={loading} error={error} />}
      {layer === "childcare" && <ChildcareInfo apt={apt} loading={loading} error={error} />}
    </div>
  );
}
