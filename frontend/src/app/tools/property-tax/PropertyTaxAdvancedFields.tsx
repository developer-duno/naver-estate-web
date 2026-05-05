"use client";

import type { CorporationGeneralRateCategory } from "@/lib/property-tax-types";

interface Props {
  houses: 1 | 2 | 3;
  excludedHouses: number;
  ownershipPercent: number;
  isCorporation: boolean;
  isSingleHouseEligible: boolean;
  isSpouseJointSingleHouse: boolean;
  corporationGeneralRateCategory: CorporationGeneralRateCategory | "";
  onExcludedHousesChange: (v: number) => void;
  onOwnershipPercentChange: (v: number) => void;
  onIsCorporationChange: (v: boolean) => void;
  onIsSpouseJointSingleHouseChange: (v: boolean) => void;
  onCorporationGeneralRateCategoryChange: (v: CorporationGeneralRateCategory | "") => void;
}

// PDF #14 페이지 2 표 직접 박제 — 9 카테고리 라벨 (UI 표시 + Notice 본문 동일)
const CORP_GENERAL_OPTIONS: Array<{ value: CorporationGeneralRateCategory; label: string }> = [
  { value: "public-charity-other", label: "① 공익법인등 (②에 해당하지 않음) — 다주택 시 중과세율" },
  { value: "public-charity-direct", label: "② 공익법인등 (직접 공익목적 사용 주택만 보유)" },
  { value: "public-housing", label: "③ 공공주택사업자" },
  { value: "housing-association", label: "④ 주택조합" },
  { value: "redevelopment", label: "⑤ 정비사업시행자" },
  { value: "private-rental", label: "⑥ 민간건설임대사업자" },
  { value: "urban-development", label: "⑦ 도시개발사업시행자" },
  { value: "social-enterprise", label: "⑧ 사회적기업등" },
  { value: "clan", label: "⑨ 종중(宗中)" },
];

const INPUT_CLASS =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed";

export default function PropertyTaxAdvancedFields(props: Props) {
  const {
    houses, excludedHouses, ownershipPercent, isCorporation,
    isSingleHouseEligible, isSpouseJointSingleHouse, corporationGeneralRateCategory,
    onExcludedHousesChange, onOwnershipPercentChange, onIsCorporationChange,
    onIsSpouseJointSingleHouseChange, onCorporationGeneralRateCategoryChange,
  } = props;

  const advancedDisabled = isCorporation;
  // B-5 부부 공동명의 1주택자 특례: houses === 1 + 1세대1주택 자격 + 법인 아닐 때만 활성
  const spouseJointDisabled = !(houses === 1 && isSingleHouseEligible && !isCorporation);
  // 부부 토글 켜진 동안 ownershipPercent 자동 disabled (1인 합산 납세이므로 지분 % 무의미)
  const ownershipDisabled = advancedDisabled || isSpouseJointSingleHouse;

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

        <div>
          <label htmlFor="corporationGeneralRateCategoryAdv" className="block text-sm font-medium text-gray-700 mb-1.5">
            법인 9종 일반 누진세율 특례 (선택, PDF #14)
          </label>
          <select
            id="corporationGeneralRateCategoryAdv"
            value={corporationGeneralRateCategory}
            onChange={(e) => onCorporationGeneralRateCategoryChange(e.target.value as CorporationGeneralRateCategory | "")}
            disabled={!isCorporation}
            className={INPUT_CLASS}
          >
            <option value="">선택 안 함 (단일세율 적용)</option>
            {CORP_GENERAL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            {!isCorporation
              ? "법인 토글 ON 시 활성화 (개인은 해당 없음)"
              : "신청 시 단일세율 → 일반 누진세율 + 공제 9억 + 세부담 상한 150% 적용. 매년 9.16~9.30 별지 제28호 서식 신고. ①번은 다주택 시 중과세율, ②~⑨번은 항상 기본세율 일률. 자격 확인 본인 책임."}
          </p>
        </div>

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
            disabled={ownershipDisabled}
            placeholder="예: 50 (부부 공동명의 50%) — 비워두면 100%"
            className={INPUT_CLASS}
          />
          <p className="mt-1 text-xs text-gray-500">
            {advancedDisabled
              ? "법인은 지분 개념 없음 (자동 비활성화)"
              : isSpouseJointSingleHouse
                ? "부부 공동명의 1주택자 특례 적용 중 — 1인 합산 납세이므로 지분 % 무효 (자동 비활성화)"
                : "종부세법 §9 (인별 과세) — 입력하신 공시가격은 본인 지분 공시가로 가정. 본인 지분 % 만큼 종부세 산정 (재산세 영향 없음)."}
          </p>
        </div>

        <label className="flex items-start gap-2 min-h-[44px]">
          <input
            type="checkbox"
            checked={isSpouseJointSingleHouse}
            onChange={(e) => onIsSpouseJointSingleHouseChange(e.target.checked)}
            disabled={spouseJointDisabled}
            className="mt-1"
          />
          <span className={`text-sm ${spouseJointDisabled ? "text-gray-400" : "text-gray-700"}`}>
            부부 공동명의 1주택자 특례 신청 (1인 합산 12억 공제 + 세액공제 80%)
            <span className="block text-xs text-gray-500 mt-0.5">
              {spouseJointDisabled
                ? "1주택 + 1세대1주택자 자격 충족 시만 활성화 (법인 제외)"
                : "신청 시 1인 합산 납세, 매년 9.16~9.30 신청 (별지 제30호 서식). 자격 요건 (다른 세대원 무주택 + 배우자 다른 주택 무) 본인 책임."}
            </span>
          </span>
        </label>
      </div>
    </details>
  );
}
