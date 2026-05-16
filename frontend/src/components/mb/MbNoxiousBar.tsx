"use client";

interface Props {
  value: number | null | undefined;
}

const MAX_M = 1500;

// 유해시설 거리 진행바 — 멀수록 좋음 (높은 값 = safe).
// 학교 도보 진행바와 색 방향 반대: 멀면 emerald, 가까우면 rose.
// 폭은 거리/MAX_M → 멀수록 길게 채워져 "안전 강조".
// 0/음수는 미입력 노이즈로 간주 (DB min=15, 0m 유해시설은 비현실적).
export function MbNoxiousBar({ value }: Props) {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return <span className="text-sm text-gray-400">-</span>;
  }
  const capped = Math.min(value, MAX_M);
  const widthPct = (capped / MAX_M) * 100;
  const display =
    value >= 1000 ? `${(value / 1000).toFixed(1)}km` : `${Math.round(value)}m`;
  const tier = value > 700 ? "safe" : value > 300 ? "warn" : "danger";
  const colorClass =
    tier === "safe" ? "bg-emerald-500" :
    tier === "warn" ? "bg-amber-500" : "bg-rose-500";
  const labelClass =
    tier === "safe" ? "text-emerald-600" :
    tier === "warn" ? "text-amber-600" : "text-rose-600";
  const label =
    tier === "safe" ? "멀음" :
    tier === "warn" ? "보통" : "가까움";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium text-gray-900">{display}</span>
        <span className={`text-xs ${labelClass}`}>{label}</span>
      </div>
      <div
        className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={MAX_M}
        aria-label={`가장 가까운 유해시설까지 ${display} (${label})`}
      >
        <div className={`h-full ${colorClass} transition-all`} style={{ width: `${widthPct}%` }} />
      </div>
    </div>
  );
}
