"use client";

interface Props {
  value: number | null | undefined;
}

const MAX_MIN = 15;

// 학교 도보 시간 진행바 — 가까울수록 좋음 (낮은 값 = safe).
// 0/음수는 미입력 노이즈로 간주 (DB min=1, 0분 도보는 비현실적).
export function MbSchoolWalkBar({ value }: Props) {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return <span className="text-sm text-gray-400">-</span>;
  }
  const minutes = Math.round(value);
  const capped = Math.min(Math.max(value, 0), MAX_MIN);
  const widthPct = (capped / MAX_MIN) * 100;
  const tier = value <= 5 ? "safe" : value <= 10 ? "warn" : "danger";
  const colorClass =
    tier === "safe" ? "bg-emerald-500" :
    tier === "warn" ? "bg-amber-500" : "bg-rose-500";
  const labelClass =
    tier === "safe" ? "text-emerald-600" :
    tier === "warn" ? "text-amber-600" : "text-rose-600";
  const label =
    tier === "safe" ? "가까움" :
    tier === "warn" ? "보통" : "멈";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium text-gray-900">{minutes}분</span>
        <span className={`text-xs ${labelClass}`}>{label}</span>
      </div>
      <div
        className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden"
        role="progressbar"
        aria-valuenow={minutes}
        aria-valuemin={0}
        aria-valuemax={MAX_MIN}
        aria-label={`학교 도보 시간 ${minutes}분 (${label})`}
      >
        <div className={`h-full ${colorClass} transition-all`} style={{ width: `${widthPct}%` }} />
      </div>
    </div>
  );
}
