"use client";

interface Props {
  houses: 1 | 2 | 3;
  excludedHouses: number;
  ownershipPercent: number;
  isCorporation: boolean;
  onExcludedHousesChange: (v: number) => void;
  onOwnershipPercentChange: (v: number) => void;
  onIsCorporationChange: (v: boolean) => void;
}

const INPUT_CLASS =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed";

export default function PropertyTaxAdvancedFields(props: Props) {
  const {
    houses, excludedHouses, ownershipPercent, isCorporation,
    onExcludedHousesChange, onOwnershipPercentChange, onIsCorporationChange,
  } = props;

  const advancedDisabled = isCorporation;

  return (
    <details className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium text-gray-700">
        고급 옵션 (합산배제·공동명의·법인)
      </summary>
      <div className="mt-3 space-y-4">
        <label className="flex items-center gap-2 min-h-[44px]">
          <input
            type="checkbox"
            checked={isCorporation}
            onChange={(e) => onIsCorporationChange(e.target.checked)}
          />
          <span className="text-sm text-gray-700">
            법인 보유 (단일세율 2.7% / 5.0%, 1주택 공제·세액공제 자동 차단)
          </span>
        </label>

        {houses > 1 && (
          <div>
            <label htmlFor="excludedHousesAdv" className="block text-sm font-medium text-gray-700 mb-1.5">
              합산배제 신청 주택 수 (선택)
            </label>
            <select
              id="excludedHousesAdv"
              value={excludedHouses}
              onChange={(e) => onExcludedHousesChange(Number(e.target.value) || 0)}
              disabled={advancedDisabled}
              className={INPUT_CLASS}
            >
              {Array.from({ length: houses + 1 }, (_, i) => (
                <option key={i} value={i}>
                  {i === 0 ? "0채 (미적용)" : `${i}채 임대등록·종교/사원용 등`}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {advancedDisabled
                ? "법인은 합산배제 신청 불가 (자동 비활성화)"
                : "종부세법 §8③ — 합산배제 신청한 주택은 종부세 산정에서 제외 (재산세 영향 없음)."}
            </p>
          </div>
        )}

        <div>
          <label htmlFor="ownershipPercentAdv" className="block text-sm font-medium text-gray-700 mb-1.5">
            공동명의 본인 지분 (%, 선택)
          </label>
          <input
            id="ownershipPercentAdv"
            type="number"
            inputMode="decimal"
            autoComplete="off"
            min={1}
            max={100}
            step={1}
            value={ownershipPercent || ""}
            onChange={(e) => onOwnershipPercentChange(Number(e.target.value) || 0)}
            disabled={advancedDisabled}
            placeholder="예: 50 (부부 공동명의 50%) — 비워두면 100%"
            className={INPUT_CLASS}
          />
          <p className="mt-1 text-xs text-gray-500">
            {advancedDisabled
              ? "법인은 지분 개념 없음 (자동 비활성화)"
              : "종부세법 §9 (인별 과세) — 입력하신 공시가격은 본인 지분 공시가로 가정. 본인 지분 % 만큼 종부세 산정 (재산세 영향 없음)."}
          </p>
        </div>
      </div>
    </details>
  );
}
