"use client";

import type { HoldPeriodSpecialMode } from "@/lib/property-tax-types";

interface Props {
  houses: 1 | 2 | 3;
  isSingleHouseEligible: boolean;
  isCorporation: boolean;
  holdPeriodSpecialMode: HoldPeriodSpecialMode;
  originalAcquisitionYear: number;
  onHoldPeriodSpecialModeChange: (v: HoldPeriodSpecialMode) => void;
  onOriginalAcquisitionYearChange: (v: number) => void;
}

const INPUT_CLASS =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed";

const MODE_OPTIONS: Array<{ value: HoldPeriodSpecialMode; label: string; hint: string }> = [
  { value: "none", label: "신청 안 함", hint: "기본값 — 입력한 보유연수 그대로 사용" },
  { value: "planned", label: "신청 예정", hint: "9.16~9.30 신청서 제출 예정 가정 — 결과 카드에 노란 경고 표시" },
  { value: "applied", label: "이미 신청 완료", hint: "전년 신청 후 자동 유지 가정 (PDF #16) — 결과 카드에 파란 안내" },
];

export default function HoldPeriodSpecialFields(props: Props) {
  const {
    houses, isSingleHouseEligible, isCorporation,
    holdPeriodSpecialMode, originalAcquisitionYear,
    onHoldPeriodSpecialModeChange, onOriginalAcquisitionYearChange,
  } = props;

  const disabled = !(houses === 1 && isSingleHouseEligible && !isCorporation);
  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-2 pt-2 border-t border-gray-200">
      <div>
        <span className={`text-sm font-medium ${disabled ? "text-gray-400" : "text-gray-700"}`}>
          보유기간 계산 특례 (PDF #16 — 재개발·재건축 멸실 또는 배우자 상속)
        </span>
        <div className="mt-2 flex flex-col sm:flex-row gap-2">
          {MODE_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 min-h-[44px] flex-1">
              <input
                type="radio"
                name="holdPeriodSpecialMode"
                value={opt.value}
                checked={holdPeriodSpecialMode === opt.value}
                onChange={() => onHoldPeriodSpecialModeChange(opt.value)}
                disabled={disabled}
                aria-label={opt.label}
              />
              <span className={`text-sm ${disabled ? "text-gray-400" : "text-gray-700"}`}>{opt.label}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {MODE_OPTIONS.find((o) => o.value === holdPeriodSpecialMode)?.hint}
        </p>
      </div>
      {holdPeriodSpecialMode !== "none" && !disabled && (
        <label className="block">
          <span className="text-xs text-gray-600">원래 주택 취득연도 (멸실 주택 또는 사망 배우자 취득일 기준)</span>
          <input
            type="number"
            min={1900}
            max={currentYear}
            value={originalAcquisitionYear || ""}
            onChange={(e) => onOriginalAcquisitionYearChange(Number(e.target.value) || 0)}
            placeholder={`예: ${currentYear - 15}`}
            className={INPUT_CLASS}
            aria-label="원래 주택 취득연도"
          />
          <span className="text-xs text-gray-500 mt-1 block">
            ※ 연도 단위 입력 → 보유연수 자동 재계산. 월/일 오차 ±1년 가능.
          </span>
        </label>
      )}
    </div>
  );
}
