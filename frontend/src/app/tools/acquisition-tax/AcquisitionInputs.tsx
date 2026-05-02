"use client";

import type { AcquisitionPropertyType } from "@/lib/acquisition-tax";

interface Props {
  propertyType: AcquisitionPropertyType;
  houses: 1 | 2 | 3;
  isRegulatedArea: boolean;
  isFirstTime: boolean;
  areaM2: number;
  amountManwon: number;
  firstTimeDisabledReason: string | null;
  onPropertyTypeChange: (v: AcquisitionPropertyType) => void;
  onHousesChange: (v: 1 | 2 | 3) => void;
  onIsRegulatedAreaChange: (v: boolean) => void;
  onIsFirstTimeChange: (v: boolean) => void;
  onAreaM2Change: (v: number) => void;
  onAmountChange: (v: number) => void;
}

export default function AcquisitionInputs(props: Props) {
  const {
    propertyType, houses, isRegulatedArea, isFirstTime, areaM2, amountManwon,
    firstTimeDisabledReason,
    onPropertyTypeChange, onHousesChange, onIsRegulatedAreaChange,
    onIsFirstTimeChange, onAreaM2Change, onAmountChange,
  } = props;

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6 space-y-5">
      <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs sm:text-sm text-blue-900">
        <strong>일시적 2주택 안내:</strong> 기존 주택을 3년 이내 처분하면 신규 취득은 1주택 기준 표준세율로 과세됩니다.
        본 계산기는 처분 시점 분기를 다루지 않습니다.
      </div>

      <div>
        <label htmlFor="propertyType" className="block text-sm font-medium text-gray-700 mb-1.5">매물 유형</label>
        <select
          id="propertyType"
          value={propertyType}
          onChange={(e) => onPropertyTypeChange(e.target.value as AcquisitionPropertyType)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
        >
          <option value="house">주택 (아파트·단독·다세대)</option>
          <option value="officetel-commercial">오피스텔·상가 (4.6%)</option>
        </select>
      </div>

      <div>
        <label htmlFor="amountManwon" className="block text-sm font-medium text-gray-700 mb-1.5">매매가 (만원)</label>
        <input
          id="amountManwon"
          type="number"
          inputMode="numeric"
          autoComplete="off"
          min={0}
          value={amountManwon || ""}
          onChange={(e) => onAmountChange(Number(e.target.value) || 0)}
          placeholder="예: 50000 (5억원)"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
        />
      </div>

      <div>
        <label htmlFor="areaM2" className="block text-sm font-medium text-gray-700 mb-1.5">전용면적 (m²)</label>
        <input
          id="areaM2"
          type="number"
          inputMode="decimal"
          autoComplete="off"
          min={0}
          step={0.01}
          value={areaM2 || ""}
          onChange={(e) => onAreaM2Change(Number(e.target.value) || 0)}
          placeholder="예: 84.99"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
        />
        <p className="mt-1 text-xs text-gray-500">전용 85m² 이하 1주택은 농어촌특별세 비과세</p>
      </div>

      <fieldset>
        <legend className="block text-sm font-medium text-gray-700 mb-1.5">보유 주택수</legend>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3].map((n) => (
            <label key={n} className="flex items-center gap-2 min-h-[44px] px-3 rounded-md border border-gray-300 cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="houses"
                value={n}
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
          checked={isRegulatedArea}
          onChange={(e) => onIsRegulatedAreaChange(e.target.checked)}
          disabled={houses === 1}
        />
        <span className={`text-sm ${houses === 1 ? "text-gray-400" : "text-gray-700"}`}>
          조정대상지역 (다주택 중과 적용)
        </span>
      </label>

      <div>
        <label className="flex items-center gap-2 min-h-[44px]">
          <input
            type="checkbox"
            checked={isFirstTime}
            onChange={(e) => onIsFirstTimeChange(e.target.checked)}
            disabled={firstTimeDisabledReason !== null}
          />
          <span className={`text-sm ${firstTimeDisabledReason ? "text-gray-400" : "text-gray-700"}`}>
            무주택 생애최초 감면 (200만원 한도)
          </span>
        </label>
        {firstTimeDisabledReason && (
          <p className="text-xs text-amber-700 ml-6 mt-0.5">{firstTimeDisabledReason}</p>
        )}
      </div>
    </section>
  );
}
