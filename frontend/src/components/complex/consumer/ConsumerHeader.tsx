"use client";

import type { Complex } from "@/types";
import ComplexHeader from "@/components/complex/ComplexHeader";
import { formatKoreanPrice } from "@/lib/format";
import { priceRangeText } from "./consumer-format";

interface Props {
  complex: Complex;
  starred: boolean;
  onBack: () => void;
  onToggleFavorite: () => void;
  isCompared: boolean;
  compareFull: boolean;
  onToggleCompare: () => void;
  /** 선택 면적의 최근 거래 범위 — 없으면 요약 줄 생략 */
  summary: { area: number; min: number; max: number; ltv: number } | null;
}

/** S0 머리 — 이름·관심·비교(기존 ComplexHeader) + 사실 칩 + 한 줄 요약(세션 482 PR 1b) */
export default function ConsumerHeader({ complex, summary, ...header }: Props) {
  const chips: string[] = [];
  const addr = complex.address || complex.cortar_address;
  if (addr) chips.push(addr);
  const year = complex.use_approve_ymd?.slice(0, 4);
  if (year && /^\d{4}$/.test(year)) chips.push(`${year}년 사용승인`);
  if (complex.total_household_count != null) chips.push(`${complex.total_household_count.toLocaleString()}세대`);
  if (complex.total_dong_count != null) chips.push(`${complex.total_dong_count}개동`);

  return (
    <div className="space-y-2">
      <ComplexHeader complex={complex} {...header} />
      {chips.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="단지 기본 사실">
          {chips.map((c) => (
            <li key={c} className="text-xs text-gray-600 bg-gray-100 rounded-full px-2.5 py-0.5">{c}</li>
          ))}
        </ul>
      )}
      {summary && (
        <p className="text-sm text-gray-600" data-testid="consumer-summary">
          {summary.area}㎡ 기준 최근 거래{" "}
          <b className="text-gray-900">{priceRangeText(summary.min, summary.max)}</b>
          {" · "}담보대출 한도 최대 약 <b className="text-blue-700">{formatKoreanPrice(summary.ltv)}</b>
          <span className="text-xs text-gray-500"> (선순위 없을 때 · 참고)</span>
        </p>
      )}
    </div>
  );
}
