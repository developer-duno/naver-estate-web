"use client";

import type { MetricBarConfig } from "./metric-bar-configs";

interface Props {
  value: number | null | undefined;
}

// 미분양 지표 막대 공용 렌더러. 14개 Mb*Bar 가 본 컴포넌트 + config 로 수렴.
// DOM 구조·className·aria 포맷은 기존 14개와 1바이트도 다르지 않게 보존
// (기존 *Bar.test.tsx 14개가 회귀 가드 — 동작 불변 입증).
const SCHEMES: Record<
  MetricBarConfig["scheme"],
  { bg: [string, string, string]; text: [string, string, string] }
> = {
  // risk = emerald/amber/rose (12개), scale = emerald/sky/indigo (MaxFloor·Units)
  risk: {
    bg: ["bg-emerald-500", "bg-amber-500", "bg-rose-500"],
    text: ["text-emerald-600", "text-amber-600", "text-rose-600"],
  },
  scale: {
    bg: ["bg-emerald-500", "bg-sky-500", "bg-indigo-500"],
    text: ["text-emerald-600", "text-sky-600", "text-indigo-600"],
  },
};

export function MetricBar({ value, config }: Props & { config: MetricBarConfig }) {
  const { max, nonZero, scheme, tier, labels, formatDisplay, ariaNow, ariaPrefix, overCapLabel } =
    config;
  if (value == null || !Number.isFinite(value) || (nonZero && value <= 0)) {
    return <span className="text-sm text-gray-400">-</span>;
  }
  const capped = Math.min(Math.max(value, 0), max);
  const widthPct = (capped / max) * 100;
  const t = tier(value);
  const colorClass = SCHEMES[scheme].bg[t];
  const labelClass = SCHEMES[scheme].text[t];
  const label = labels[t];
  const display = formatDisplay(value);
  const overCap = overCapLabel != null && value > max ? ` (${overCapLabel})` : "";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium text-gray-900">{display}</span>
        <span className={`text-xs ${labelClass}`}>{label}</span>
      </div>
      <div
        className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden"
        role="progressbar"
        aria-valuenow={ariaNow(value)}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={`${ariaPrefix} ${display}${overCap} (${label})`}
      >
        <div className={`h-full ${colorClass} transition-all`} style={{ width: `${widthPct}%` }} />
      </div>
    </div>
  );
}
