"use client";

interface Props {
  value: number | null | undefined;
}

const MAX_PCT = 800;

export function MbFloorAreaRatioBar({ value }: Props) {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return <span className="text-sm text-gray-400">-</span>;
  }
  const capped = Math.min(Math.max(value, 0), MAX_PCT);
  const widthPct = (capped / MAX_PCT) * 100;
  const tier = value < 200 ? "safe" : value < 300 ? "warn" : "danger";
  const colorClass =
    tier === "safe" ? "bg-emerald-500" :
    tier === "warn" ? "bg-amber-500" : "bg-rose-500";
  const labelClass =
    tier === "safe" ? "text-emerald-600" :
    tier === "warn" ? "text-amber-600" : "text-rose-600";
  const label =
    tier === "safe" ? "저밀" :
    tier === "warn" ? "중밀" : "고밀";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium text-gray-900">{value.toFixed(0)}%</span>
        <span className={`text-xs ${labelClass}`}>{label}</span>
      </div>
      <div
        className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={MAX_PCT}
        aria-label={`용적률 ${value.toFixed(0)}% (${label})`}
      >
        <div className={`h-full ${colorClass} transition-all`} style={{ width: `${widthPct}%` }} />
      </div>
    </div>
  );
}
