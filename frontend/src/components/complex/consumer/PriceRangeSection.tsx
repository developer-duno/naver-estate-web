"use client";

import type { AreaPrice, KaptInfo, OfficialPriceResponse } from "@/types";
import { Card } from "@/components/ui/card";
import { formatKoreanPrice } from "@/lib/format";
import LoadRetry from "./LoadRetry";
import {
  dateDot,
  hasRange,
  kaptCostText,
  officialForArea,
  officialRatioText,
  priceRangeText,
  representativeOfficial,
  tradeCountText,
  wonToManwon,
  ymDot,
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
  official: OfficialPriceResponse | null | undefined;
  kapt: KaptInfo | null | undefined;
  /** BE 출처 글자(area_price_range_source) — 그대로 */
  rangeSource: string | null | undefined;
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

function SmallBox({ label, value, note }: { label: string; value: string; note?: string | null }) {
  return (
    <div className="flex-1 min-w-[140px] bg-slate-50 rounded-lg p-2.5">
      <span className="block text-xs text-gray-500 mb-0.5">{label}</span>
      <b className="text-sm">{value}</b>
      {note && <span className="text-xs text-gray-500"> · {note}</span>}
    </div>
  );
}

/** S1 · 얼마짜리 집인가 — 이 단지 값은 범위로만(중위 없음) */
export default function PriceRangeSection({
  areaPrices, selected, onSelect, twoYear, twoYearReady = true, official, kapt, rangeSource, officetel = false, onRetry,
}: Props) {
  const ap = areaPrices.find((a) => a.area_m2 === selected);
  const ranged = hasRange(ap) ? ap : null;
  const anyRange = areaPrices.some(hasRange);

  // 공시가격 상자 — 선택 면적 ±1㎡, 면적 자료가 하나도 없으면 대표 평형(비율 없이)
  const items = official?.items ?? [];
  const off = ranged ? officialForArea(items, ranged.area_m2) : anyRange ? null : representativeOfficial(items);
  const offNote = off && ranged ? officialRatioText(off.price_median, ranged.price_min, ranged.price_max) : null;
  const offLabel = `공시가격${official?.year ? ` ${official.year}` : ""}${off && !ranged ? ` · 전용 ${Math.floor(off.prvuse_ar)}㎡` : ""}`;
  const kaptText = kaptCostText(kapt?.cost_per_household);

  const trades = ranged?.trades ?? [];
  const bar = ranged && twoYear && twoYear.max > twoYear.min ? twoYear : null;
  const pct = (v: number) => (bar ? Math.min(100, Math.max(0, ((v - bar.min) / (bar.max - bar.min)) * 100)) : 0);

  return (
    <Card className="p-4 space-y-3" aria-labelledby="consumer-q1">
      <h2 id="consumer-q1" className="text-sm font-bold text-blue-700 tracking-wide">1 · 얼마짜리 집인가</h2>
      {anyRange ? (
        <>
          <AreaChips areaPrices={areaPrices} selected={selected} onSelect={onSelect} label="면적 고르기" />
          {ranged && (
            <>
              <p className="text-2xl font-bold tracking-tight" data-testid="consumer-range">
                {priceRangeText(ranged.price_min, ranged.price_max, true)}
              </p>
              <p className="text-xs text-gray-500">최근 6개월 {tradeCountText(ranged)} · 국토교통부 실거래</p>
              {bar && (
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
                </div>
              )}
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
              {rangeSource && <p className="text-xs text-gray-400">{rangeSource}</p>}
            </>
          )}
        </>
      ) : (
        <p className="text-sm text-gray-700" data-testid="consumer-no-range">{noRangeText(officetel, twoYear, twoYearReady)}</p>
      )}
      {(off || kaptText) && (
        <div className="flex flex-wrap gap-2">
          {off && <SmallBox label={offLabel} value={formatKoreanPrice(wonToManwon(off.price_median))} note={offNote} />}
          {kaptText && <SmallBox label="한 달 관리비" value={kaptText} note={[ymDot(kapt?.cost_month), "K-apt"].filter(Boolean).join(" ")} />}
        </div>
      )}
      {onRetry && <LoadRetry onRetry={onRetry} />}
    </Card>
  );
}
