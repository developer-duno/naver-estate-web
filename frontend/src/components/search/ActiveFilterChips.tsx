"use client";

import type { ArticleFilters } from "@/types";

/**
 * 적용 조건 칩 요약 (세션 314 F3) — 결과 화면에서 "지금 무슨 조건으로 보는지"를 한글 칩으로.
 * urlFilters(ArticleFilters) + 매물유형 narrowing 을 칩으로. ✕ 클릭 시 개별 해제.
 * 호갱노노·직방 패턴. 모든 필드가 아니라 사용자가 실제 보는 핵심 조건만(YAGNI).
 */
interface Props {
  filters: ArticleFilters;
  /** 좁혀진 매물유형 라벨 (전체면 빈 배열) */
  estateTypeLabels: string[];
  /** 필터 키 1개 해제 */
  onRemoveFilter: (key: keyof ArticleFilters) => void;
  /** 매물유형 narrowing 전체 해제 (전체로 복귀) */
  onResetEstateTypes: () => void;
}

/** 만원 → "N억" / "N억 M천" 표시 (가격 칩용) */
function won(manwon?: number): string {
  if (manwon == null) return "";
  const eok = Math.floor(manwon / 10000);
  const cheon = Math.round((manwon % 10000) / 1000);
  if (eok > 0) return cheon > 0 ? `${eok}억 ${cheon}천` : `${eok}억`;
  return `${manwon.toLocaleString()}만`;
}

function rangeLabel(min?: number, max?: number, fmt: (n?: number) => string = (n) => `${n}`): string {
  if (min != null && max != null) return `${fmt(min)}~${fmt(max)}`;
  if (min != null) return `${fmt(min)} 이상`;
  if (max != null) return `${fmt(max)} 이하`;
  return "";
}

interface Chip {
  label: string;
  onRemove: () => void;
}

export default function ActiveFilterChips({ filters, estateTypeLabels, onRemoveFilter, onResetEstateTypes }: Props) {
  const chips: Chip[] = [];

  // 매물유형 narrowing
  if (estateTypeLabels.length > 0) {
    chips.push({ label: `유형: ${estateTypeLabels.join("·")}`, onRemove: onResetEstateTypes });
  }

  // 거래유형 (한글값)
  if (filters.trade_types) {
    chips.push({ label: filters.trade_types, onRemove: () => onRemoveFilter("trade_types") });
  }

  // 가격 (매매/전세 만원)
  const priceLabel = rangeLabel(filters.min_price, filters.max_price, won);
  if (priceLabel) {
    chips.push({ label: `가격 ${priceLabel}`, onRemove: () => { onRemoveFilter("min_price"); onRemoveFilter("max_price"); } });
  }

  // 월세 (보증금/월세 별도라 rent 만)
  const rentLabel = rangeLabel(filters.min_rent, filters.max_rent, won);
  if (rentLabel) {
    chips.push({ label: `월세 ${rentLabel}`, onRemove: () => { onRemoveFilter("min_rent"); onRemoveFilter("max_rent"); } });
  }

  // 면적 (㎡)
  const areaLabel = rangeLabel(filters.min_area_m2, filters.max_area_m2, (n) => `${n}㎡`);
  if (areaLabel) {
    chips.push({ label: `면적 ${areaLabel}`, onRemove: () => { onRemoveFilter("min_area_m2"); onRemoveFilter("max_area_m2"); } });
  }

  // 방 수
  if (filters.min_rooms != null) {
    chips.push({ label: `방 ${filters.min_rooms}개 이상`, onRemove: () => onRemoveFilter("min_rooms") });
  }
  // 욕실 수
  if (filters.min_baths != null) {
    chips.push({ label: `욕실 ${filters.min_baths}개 이상`, onRemove: () => onRemoveFilter("min_baths") });
  }

  // 평당가
  const ppyeongLabel = rangeLabel(filters.min_ppyeong, filters.max_ppyeong, won);
  if (ppyeongLabel) {
    chips.push({ label: `평당가 ${ppyeongLabel}`, onRemove: () => { onRemoveFilter("min_ppyeong"); onRemoveFilter("max_ppyeong"); } });
  }

  // 방향
  if (filters.direction) {
    chips.push({ label: filters.direction, onRemove: () => onRemoveFilter("direction") });
  }

  // 검증 매물만
  if (filters.verified_only) {
    chips.push({ label: "확인매물만", onRemove: () => onRemoveFilter("verified_only") });
  }

  // 층수 (min/max_floor)
  const floorLabel = rangeLabel(filters.min_floor, filters.max_floor, (n) => `${n}층`);
  if (floorLabel) {
    chips.push({ label: `층수 ${floorLabel}`, onRemove: () => { onRemoveFilter("min_floor"); onRemoveFilter("max_floor"); } });
  }

  // 관리비 (min/max_maintenance, 만원)
  const maintLabel = rangeLabel(filters.min_maintenance, filters.max_maintenance, (n) => `${n}만`);
  if (maintLabel) {
    chips.push({ label: `관리비 ${maintLabel}`, onRemove: () => { onRemoveFilter("min_maintenance"); onRemoveFilter("max_maintenance"); } });
  }

  // 준공연도 (max_building_age = 최대 연식)
  if (filters.max_building_age != null) {
    chips.push({ label: `${filters.max_building_age}년 이내`, onRemove: () => onRemoveFilter("max_building_age") });
  }

  // 수익률 (min/max_yield, %)
  const yieldLabel = rangeLabel(filters.min_yield, filters.max_yield, (n) => `${n}%`);
  if (yieldLabel) {
    chips.push({ label: `수익률 ${yieldLabel}`, onRemove: () => { onRemoveFilter("min_yield"); onRemoveFilter("max_yield"); } });
  }

  // 입주 가능 시기
  if (filters.move_in_type) {
    chips.push({ label: filters.move_in_type, onRemove: () => onRemoveFilter("move_in_type") });
  }

  // 동(건물)명
  if (filters.building_name) {
    chips.push({ label: `동 ${filters.building_name}`, onRemove: () => onRemoveFilter("building_name") });
  }

  // 태그
  if (filters.tags) {
    chips.push({ label: filters.tags, onRemove: () => onRemoveFilter("tags") });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3" data-testid="active-filter-chips">
      <span className="text-xs text-gray-400">적용 조건:</span>
      {chips.map((c, i) => (
        <button
          key={`${c.label}-${i}`}
          type="button"
          onClick={c.onRemove}
          className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs rounded-full pl-2.5 pr-1.5 py-1 border border-blue-200 hover:bg-blue-100 transition-colors"
          aria-label={`${c.label} 조건 해제`}
        >
          {c.label}
          <span className="text-blue-400 leading-none" aria-hidden="true">✕</span>
        </button>
      ))}
    </div>
  );
}
