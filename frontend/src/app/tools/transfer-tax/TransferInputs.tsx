"use client";

import type { TransferExemptionOverride } from "@/lib/transfer-tax-types";

interface Props {
  transferManwon: number; acquisitionManwon: number; expensesManwon: number;
  acquisitionDate: string; transferDate: string;
  livedYears: number; houses: 1 | 2 | 3;
  isRegulatedAtTransfer: boolean; isRegulatedAtAcquisition: boolean;
  areaM2: number; isUnregistered: boolean;
  exemptionOverride: TransferExemptionOverride;

  onTransferManwonChange: (v: number) => void;
  onAcquisitionManwonChange: (v: number) => void;
  onExpensesManwonChange: (v: number) => void;
  onAcquisitionDateChange: (v: string) => void;
  onTransferDateChange: (v: string) => void;
  onLivedYearsChange: (v: number) => void;
  onHousesChange: (v: 1 | 2 | 3) => void;
  onIsRegulatedAtTransferChange: (v: boolean) => void;
  onIsRegulatedAtAcquisitionChange: (v: boolean) => void;
  onAreaM2Change: (v: number) => void;
  onIsUnregisteredChange: (v: boolean) => void;
  onExemptionOverrideChange: (v: TransferExemptionOverride) => void;
}

const INPUT_CLASS =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]";
const RADIO_LABEL_CLASS =
  "flex items-center gap-2 min-h-[44px] px-3 rounded-md border border-gray-300 cursor-pointer hover:bg-gray-50";

export default function TransferInputs(props: Props) {
  const {
    transferManwon, acquisitionManwon, expensesManwon,
    acquisitionDate, transferDate, livedYears, houses,
    isRegulatedAtTransfer, isRegulatedAtAcquisition,
    areaM2, isUnregistered, exemptionOverride,
    onTransferManwonChange, onAcquisitionManwonChange, onExpensesManwonChange,
    onAcquisitionDateChange, onTransferDateChange, onLivedYearsChange, onHousesChange,
    onIsRegulatedAtTransferChange, onIsRegulatedAtAcquisitionChange,
    onAreaM2Change, onIsUnregisteredChange, onExemptionOverrideChange,
  } = props;

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6 space-y-5">
      <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs sm:text-sm text-blue-900">
        <strong>표준 계산:</strong> 소득세법 §95② + §104 + 시행령 §159의3 기준 (9 권위 출처 교차검증).
      </div>

      <div>
        <label htmlFor="transferManwon" className="block text-sm font-medium text-gray-700 mb-1.5">양도가액 (만원)</label>
        <input
          id="transferManwon" type="number" inputMode="numeric" autoComplete="off" min={0}
          value={transferManwon || ""}
          onChange={(e) => onTransferManwonChange(Number(e.target.value) || 0)}
          placeholder="예: 150000 (15억원)"
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label htmlFor="acquisitionManwon" className="block text-sm font-medium text-gray-700 mb-1.5">취득가액 (만원)</label>
        <input
          id="acquisitionManwon" type="number" inputMode="numeric" autoComplete="off" min={0}
          value={acquisitionManwon || ""}
          onChange={(e) => onAcquisitionManwonChange(Number(e.target.value) || 0)}
          placeholder="예: 50000 (5억원)"
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label htmlFor="expensesManwon" className="block text-sm font-medium text-gray-700 mb-1.5">필요경비 (만원)</label>
        <input
          id="expensesManwon" type="number" inputMode="numeric" autoComplete="off" min={0}
          value={expensesManwon || ""}
          onChange={(e) => onExpensesManwonChange(Number(e.target.value) || 0)}
          placeholder="예: 2000 (중개수수료·취득세 등)"
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label htmlFor="acquisitionDate" className="block text-sm font-medium text-gray-700 mb-1.5">취득일</label>
        <input
          id="acquisitionDate" type="date"
          value={acquisitionDate}
          onChange={(e) => onAcquisitionDateChange(e.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label htmlFor="transferDate" className="block text-sm font-medium text-gray-700 mb-1.5">양도일</label>
        <input
          id="transferDate" type="date"
          value={transferDate}
          onChange={(e) => onTransferDateChange(e.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label htmlFor="livedYears" className="block text-sm font-medium text-gray-700 mb-1.5">거주연수</label>
        <input
          id="livedYears" type="number" inputMode="decimal" autoComplete="off" min={0} step={0.1}
          value={livedYears || ""}
          onChange={(e) => onLivedYearsChange(Number(e.target.value) || 0)}
          placeholder="예: 5 (1세대1주택 비과세 자격 판정)"
          className={INPUT_CLASS}
        />
        {livedYears < 2 && (
          <p className="mt-1 text-xs text-amber-700">
            거주 2년 미달 시 1세대1주택 비과세 자격 X (조정지역 취득 분에 한해)
          </p>
        )}
      </div>

      <fieldset>
        <legend className="block text-sm font-medium text-gray-700 mb-1.5">보유 주택수</legend>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3].map((n) => (
            <label key={n} className={RADIO_LABEL_CLASS}>
              <input
                type="radio" name="houses" value={n}
                checked={houses === n}
                onChange={() => onHousesChange(n as 1 | 2 | 3)}
              />
              <span className="text-sm">{n === 3 ? "3주택 이상" : `${n}주택`}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 min-h-[44px]">
        <input
          type="checkbox"
          checked={isRegulatedAtTransfer}
          onChange={(e) => onIsRegulatedAtTransferChange(e.target.checked)}
          disabled={houses === 1}
        />
        <span className={`text-sm ${houses === 1 ? "text-gray-400" : "text-gray-700"}`}>
          양도시 조정대상지역 (다주택 중과 적용)
        </span>
      </label>

      <label className="flex items-center gap-2 min-h-[44px]">
        <input
          type="checkbox"
          checked={isRegulatedAtAcquisition}
          onChange={(e) => onIsRegulatedAtAcquisitionChange(e.target.checked)}
          disabled={houses !== 1}
        />
        <span className={`text-sm ${houses !== 1 ? "text-gray-400" : "text-gray-700"}`}>
          취득시 조정대상지역 (1세대1주택 거주 2년 요건 분기)
        </span>
      </label>

      <div>
        <label htmlFor="areaM2" className="block text-sm font-medium text-gray-700 mb-1.5">전용면적 (m²)</label>
        <input
          id="areaM2" type="number" inputMode="decimal" autoComplete="off" min={0} step={0.01}
          value={areaM2 || ""}
          onChange={(e) => onAreaM2Change(Number(e.target.value) || 0)}
          placeholder="예: 84.99"
          className={INPUT_CLASS}
        />
        <p className="mt-1 text-xs text-gray-500">85m² 이하 1주택은 농어촌특별세 비과세</p>
      </div>

      <div>
        <label className="flex items-center gap-2 min-h-[44px]">
          <input
            type="checkbox"
            checked={isUnregistered}
            onChange={(e) => onIsUnregisteredChange(e.target.checked)}
          />
          <span className="text-sm text-gray-700">미등기 양도</span>
        </label>
        {isUnregistered && (
          <div className="mt-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-900">
            ⚠️ 미등기 양도 — 70% 단일세율 적용, 장특공·기본공제 모두 배제
          </div>
        )}
      </div>

      <fieldset>
        <legend className="block text-sm font-medium text-gray-700 mb-1.5">한시배제 적용 모드</legend>
        <div className="flex flex-col gap-2">
          {([
            ["auto", "자동 판정 (양도일·보유·조정지역 자동)"],
            ["force-exclude", "강제 적용 (한시배제 적용, 중과 0)"],
            ["force-apply", "강제 미적용 (본래 중과 +20/30%p)"],
          ] as const).map(([value, label]) => (
            <label key={value} className={RADIO_LABEL_CLASS}>
              <input
                type="radio" name="exemptionOverride" value={value}
                checked={exemptionOverride === value}
                onChange={() => onExemptionOverrideChange(value)}
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-gray-500">전문가용 모드. 자동 분기 결과를 수동으로 override 합니다</p>
      </fieldset>
    </section>
  );
}
