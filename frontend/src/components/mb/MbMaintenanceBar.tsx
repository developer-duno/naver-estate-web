"use client";

interface Props {
  value: number | null | undefined;
}

const MAX_COST = 60;

export function MbMaintenanceBar({ value }: Props) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="text-sm text-gray-400">-</span>;
  }
  const capped = Math.min(Math.max(value, 0), MAX_COST);
  const widthPct = (capped / MAX_COST) * 100;
  const tier = value <= 10 ? "safe" : value <= 25 ? "warn" : "danger";
  const colorClass =
    tier === "safe" ? "bg-emerald-500" :
    tier === "warn" ? "bg-amber-500" : "bg-rose-500";
  const labelClass =
    tier === "safe" ? "text-emerald-600" :
    tier === "warn" ? "text-amber-600" : "text-rose-600";
  const label =
    tier === "safe" ? "저렴" :
    tier === "warn" ? "보통" : "높음";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium text-gray-900">{value.toLocaleString()}만원</span>
        <span className={`text-xs ${labelClass}`}>{label}</span>
      </div>
      <div
        className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={MAX_COST}
        aria-label={`세대당 월 관리비 ${value.toLocaleString()}만원 (${label})`}
      >
        <div className={`h-full ${colorClass} transition-all`} style={{ width: `${widthPct}%` }} />
      </div>
    </div>
  );
}
