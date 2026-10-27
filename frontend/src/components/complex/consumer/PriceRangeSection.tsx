"use client";

import type { AreaPrice, OfficialPriceResponse } from "@/types";
import { Card } from "@/components/ui/card";
import { formatKoreanPrice } from "@/lib/format";
import LoadRetry from "./LoadRetry";
import {
  dateDot,
  hasRange,
  officialForArea,
  officialRatioText,
  priceRangeText,
  representativeOfficial,
  wonToManwon,
} from "./consumer-format";

export interface AreaChipsProps {
  areaPrices: AreaPrice[];
  selected: number | null;
  onSelect: (area: number) => void;
  label: string;
}

/** 면적 칩 — 거래 없는 면적은 흐리게 "거래 없음"(누를 수 없음). S1·S4 가 같은 선택을 쓴다 */
export function AreaChips({ areaPrices, selected, onSelect, label }: AreaChipsProps) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {areaPrices.map((ap) => {
        const on = ap.area_m2 === selected;
        const usable = hasRange(ap);
        return (
          <button
            key={ap.area_m2}
            type="button"
            disabled={!usable}
            aria-pressed={on}
            onClick={() => onSelect(ap.area_m2)}
            className={`h-8 px-3 rounded-full border text-xs transition-colors ${
              on
                ? "bg-blue-700 text-white border-blue-700"
                : usable
                  ? "bg-white text-gray-700 border-gray-300 hover:border-blue-400"
                  : "bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed"
            }`}
          >
            {ap.area_m2}㎡{usable ? (ap.households ? ` · ${ap.households}세대` : "") : " · 거래 없음"}
          </button>
        );
      })}
    </div>
  );
}

interface Props {
  areaPrices: AreaPrice[];
  selected: number | null;
  onSelect: (area: number) => void;
  /** 선택 면적의 2년 범위(B1 two_year) — 없으면 막대 생략 */
  twoYear: { min: number; max: number } | null;
  /** 2년 범위 답을 받았나(받기 전엔 "2년 기록 없음"을 단정하지 않는다) */
  twoYearReady?: boolean;
  /** 공시가격 — 고른 면적의 공시가격·실거래 대비 비율 작은 상자(면적 칩을 바꾸면 따라 바뀐다, #773 그대로) */
  official?: OfficialPriceResponse | null;
  /** 오피스텔·오피스텔분양권 — 정부 실거래를 받지 않는다(보완 F4) */
  officetel?: boolean;
  /** 이 카드 자료 중 불러오지 못한 것이 있으면 다시 시도(보완 A-4) */
  onRetry?: () => void;
}

/** 6개월 범위가 없을 때 본문 한 줄(보완 F4·F5) */
function noRangeText(officetel: boolean, twoYear: { min: number; max: number } | null, ready: boolean): string {
  if (officetel) return "오피스텔은 정부 실거래 자료를 아직 받지 않아요";
  if (twoYear) return `최근 6개월 거래 없음 · 2년 범위 ${priceRangeText(twoYear.min, twoYear.max)}`;
  return ready ? "최근 2년 정부 실거래 기록 없음" : "최근 6개월 거래 없음";
}

/**
 * S1 · 얼마짜리 집인가 — 이 단지 값은 범위로만(중위 없음).
 * 세션 483 PR 3b(결정 23·26): 면적별 범위 숫자·공시가격·관리비는 서버 '한눈에 보기' 표로 옮겼다 —
 * 이 카드는 면적 칩 · 2년 안에서 최근 6개월이 어디쯤인지 막대 · 2년 최저/최고 · (있으면) 지금 있는 거래 목록 표.
 */
export default function PriceRangeSection({
  areaPrices, selected, onSelect, twoYear, twoYearReady = true, official, officetel = false, onRetry,
}: Props) {
  const ap = areaPrices.find((a) => a.area_m2 === selected);
  const ranged = hasRange(ap) ? ap : null;
  const anyRange = areaPrices.some(hasRange);

  const trades = ranged?.trades ?? [];

  // 공시가격 상자 — 선택 면적 ±1㎡, 면적 자료가 하나도 없으면 대표 평형(비율 없이). '한눈에 보기' 표는 대표 면적 하나 그대로
  const items = official?.items ?? [];
  const off = ranged ? officialForArea(items, ranged.area_m2) : anyRange ? null : representativeOfficial(items);
  const offNote = off && ranged ? officialRatioText(off.price_median, ranged.price_min, ranged.price_max) : null;
  const offLabel = `공시가격${official?.year ? ` ${official.year}` : ""}${off && !ranged ? ` · 전용 ${Math.floor(off.prvuse_ar)}㎡` : ""}`;
  const bar = ranged && twoYear && twoYear.max > twoYear.min ? twoYear : null;
  const pct = (v: number) => (bar ? Math.min(100, Math.max(0, ((v - bar.min) / (bar.max - bar.min)) * 100)) : 0);

  return (
    <Card className="p-4 space-y-3" aria-labelledby="consumer-q1">
      <h2 id="consumer-q1" className="text-sm font-bold text-blue-700 tracking-wide">1 · 얼마짜리 집인가</h2>
      {anyRange ? (
        <>
          <AreaChips areaPrices={areaPrices} selected={selected} onSelect={onSelect} label="면적 고르기" />
          {ranged && bar && (
            <div data-testid="consumer-range-bar">
              <div className="relative h-2.5 rounded-full bg-slate-200" aria-hidden="true">
                <i
                  className="absolute inset-y-0 rounded-full bg-amber-500"
                  style={{ left: `${pct(ranged.price_min)}%`, right: `${100 - pct(ranged.price_max)}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-xs text-gray-500">
                <span>2년 최저 {formatKoreanPrice(bar.min)}</span>
                <span>2년 최고 {formatKoreanPrice(bar.max)}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">노란 띠 = {ranged.area_m2}㎡ 최근 6개월 거래 범위</p>
            </div>
          )}
          {ranged && !bar && twoYear && (
            <p className="text-xs text-gray-500">2년 거래 {priceRangeText(twoYear.min, twoYear.max)}</p>
          )}
          {/* 거래 목록 표 — 세션 482 PR 1b(#773) 부터 라이브에 보이던 것 그대로 둔다(결정 26 은 새 표를 b2 에서 붙이는 것) */}
          {trades.length > 0 && (
            <table className="w-full text-xs" data-testid="consumer-trades">
              <thead>
                <tr className="text-gray-500 text-left">
                  <th className="py-1 font-medium">거래일</th>
                  <th className="py-1 font-medium">층</th>
                  <th className="py-1 font-medium">가격</th>
                  <th className="py-1 font-medium">방식</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t, i) => (
                  <tr key={`${t.date}-${t.price}-${i}`} className="border-t border-gray-100">
                    <td className="py-1">{dateDot(t.date) ?? "날짜 미상"}</td>
                    <td className="py-1">{t.floor != null ? `${t.floor}층` : ""}</td>
                    <td className="py-1">{formatKoreanPrice(t.price)}</td>
                    <td className="py-1">{t.direct ? "직거래" : "중개"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : (
        <p className="text-sm text-gray-700" data-testid="consumer-no-range">{noRangeText(officetel, twoYear, twoYearReady)}</p>
      )}
      {off && (
        <div className="bg-slate-50 rounded-lg p-2.5" data-testid="consumer-official-box">
          <span className="block text-xs text-gray-500 mb-0.5">{offLabel}</span>
          <b className="text-sm">{formatKoreanPrice(wonToManwon(off.price_median))}</b>
          {offNote && <span className="text-xs text-gray-500"> · {offNote}</span>}
        </div>
      )}
      {onRetry && <LoadRetry onRetry={onRetry} />}
    </Card>
  );
}
