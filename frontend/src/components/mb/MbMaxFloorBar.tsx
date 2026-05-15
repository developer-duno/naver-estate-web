"use client";

interface Props {
  value: number | null | undefined;
}

const MAX_PCT = 50;

export function MbMaxFloorBar({ value }: Props) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="text-sm text-gray-400">-</span>;
  }
  const capped = Math.min(Math.max(value, 0), MAX_PCT);
  const widthPct = (capped / MAX_PCT) * 100;
  const tier = value < 15 ? "low" : value < 30 ? "mid" : "high";
  const colorClass =
    tier === "low" ? "bg-emerald-500" :
    tier === "mid" ? "bg-sky-500" : "bg-indigo-500";
  const labelClass =
    tier === "low" ? "text-emerald-600" :
    tier === "mid" ? "text-sky-600" : "text-indigo-600";
  const label =
    tier === "low" ? "저층 단지" :
    tier === "mid" ? "중층 단지" : "고층 단지";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium text-gray-900">{value}층</span>
        <span className={`text-xs ${labelClass}`}>{label}</span>
      </div>
      <div
        className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={MAX_PCT}
        aria-label={`최고층 ${value}층 (${label})`}
      >
        <div className={`h-full ${colorClass} transition-all`} style={{ width: `${widthPct}%` }} />
      </div>
    </div>
  );
}
