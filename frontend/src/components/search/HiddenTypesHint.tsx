"use client";

import { ESTATE_TYPE_TABS } from "@/lib/constants";
import type { Complex } from "@/types";

/** 보이는 결과가 이 개수 미만일 때만 숨긴 유형을 안내한다. */
export const HIDDEN_TYPES_HINT_THRESHOLD = 5;

interface Props {
  /** 서버가 준 단지 전체(매물유형 탭으로 거르기 전). */
  complexes: Pick<Complex, "real_estate_type_code">[];
  selectedTypes: string[];
  /** 탭으로 거른 뒤 화면에 보이는 단지 수. */
  visibleCount: number;
  /** [모두 보기] — 탭 6개 전부 선택. */
  onShowAll: () => void;
}

/**
 * 매물유형 탭에 가려진 단지 안내 한 줄 (세션 459 — 기본 선택이 아파트만이 된 뒤,
 * 오피스텔 동네에서 "결과 없음"처럼 보이지 않게).
 * 탭 목록에 있는 유형만 센다 — 탭에 없는 코드는 [모두 보기]로도 안 보이므로.
 */
export default function HiddenTypesHint({ complexes, selectedTypes, visibleCount, onShowAll }: Props) {
  if (visibleCount >= HIDDEN_TYPES_HINT_THRESHOLD) return null;

  const counts = new Map<string, number>();
  for (const c of complexes) {
    const code = c.real_estate_type_code;
    if (!code || selectedTypes.includes(code)) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  // 많은 유형부터(같으면 탭 순서)
  const hidden = ESTATE_TYPE_TABS.filter((t) => counts.has(t.code)).sort(
    (a, b) => (counts.get(b.code) ?? 0) - (counts.get(a.code) ?? 0),
  );
  if (hidden.length === 0) return null;

  const shownLabel = ESTATE_TYPE_TABS.filter((t) => selectedTypes.includes(t.code))
    .map((t) => t.label)
    .join(" · ");

  return (
    <div
      data-testid="hidden-types-hint"
      className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded text-sm text-gray-700 flex flex-wrap items-center gap-x-2 gap-y-1"
    >
      <span>
        지금은 {shownLabel}만 보여요 — 숨긴 유형:{" "}
        {hidden.map((t) => `${t.label} ${counts.get(t.code)}`).join(" · ")}
      </span>
      <button
        type="button"
        onClick={onShowAll}
        className="text-blue-600 hover:underline font-medium"
      >
        모두 보기
      </button>
    </div>
  );
}
