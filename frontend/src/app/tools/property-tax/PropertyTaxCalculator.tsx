"use client";

import { useCallback, useMemo, useState } from "react";
import { calculatePropertyTax } from "@/lib/property-tax";
import type { PropertyTaxInput, CorporationGeneralRateCategory, SpecialHousesInput, SpecialHousesRateApplyInput, PropertyTaxNoticeKey } from "@/lib/property-tax-types";
import PropertyTaxInputs from "./PropertyTaxInputs";
import PropertyTaxResultCard from "./PropertyTaxResultCard";

export default function PropertyTaxCalculator() {
  const [publishedManwon, setPublishedManwon] = useState(0);
  const [houses, setHouses] = useState<1 | 2 | 3>(1);
  const [isSingleHouseEligible, setIsSingleHouseEligible] = useState(false);
  const [ageYears, setAgeYears] = useState(0);
  const [holdYears, setHoldYears] = useState(0);
  const [prevYearTaxManwon, setPrevYearTaxManwon] = useState(0);
  const [excludedHouses, setExcludedHouses] = useState(0);
  const [ownershipPercent, setOwnershipPercent] = useState(0);
  const [isCorporation, setIsCorporation] = useState(false);
  const [isSpouseJointSingleHouse, setIsSpouseJointSingleHouse] = useState(false);
  const [corporationGeneralRateCategory, setCorporationGeneralRateCategory] =
    useState<CorporationGeneralRateCategory | "">("");
  // 5종 특례주택 (PDF #12, 세션 112) — 카테고리별 { count, publishedAverage } 저장
  const [specialHouses, setSpecialHouses] = useState<SpecialHousesInput>({});
  // PDF #13 4종 세율 특례주택 (세션 113) — 카테고리별 { count } 저장 (publishedAverage 미보유)
  const [specialHousesRateApply, setSpecialHousesRateApply] = useState<SpecialHousesRateApplyInput>({});
  // PDF #15 향교·종교단체 직접사용 토글 (세션 114) — 산식 무영향, 안내 4 카드만 push
  const [isReligiousSpecial, setIsReligiousSpecial] = useState(false);

  // 5종 특례주택 entry 갱신 핸들러 (카테고리 + 필드 + 값)
  const handleSpecialHouseEntryChange = useCallback((key: keyof SpecialHousesInput, field: "count" | "publishedAverage", value: number) => {
    setSpecialHouses((prev) => ({
      ...prev,
      [key]: { count: prev[key]?.count ?? 0, publishedAverage: prev[key]?.publishedAverage ?? 0, [field]: value },
    }));
  }, []);

  // PDF #13 4종 entry 갱신 핸들러 (count만)
  const handleRateApplyEntryChange = useCallback((key: keyof SpecialHousesRateApplyInput, count: number) => {
    setSpecialHousesRateApply((prev) => ({ ...prev, [key]: { count } }));
  }, []);

  // 부부 토글 켤 때 ownershipPercent 자동 0 리셋 (1인 합산 납세 → 지분 % 무의미, 화면 모순 차단)
  const handleIsSpouseJointSingleHouseChange = (v: boolean) => {
    setIsSpouseJointSingleHouse(v);
    if (v) setOwnershipPercent(0);
  };

  // 법인 토글 OFF 시 9종 카테고리 자동 reset (UI 가드 + normalize 자동 undefined 강제 이중 안전망, 세션 111)
  const handleIsCorporationChange = (v: boolean) => {
    setIsCorporation(v);
    if (!v) setCorporationGeneralRateCategory("");
  };

  const result = useMemo(() => {
    // single 분기: 본인 단독 1세대1주택 OR 부부 공동명의 1주택 특례 모두 ageYears/holdYears 전달
    const single = (isSingleHouseEligible || isSpouseJointSingleHouse) && houses === 1;
    const input: PropertyTaxInput = {
      publishedPriceWon: publishedManwon * 10_000,
      houses,
      isSingleHouseEligible: isSingleHouseEligible && houses === 1,
      ageYears: single ? ageYears : 0,
      holdYears: single ? holdYears : 0,
      prevYearTax: prevYearTaxManwon > 0 ? prevYearTaxManwon * 10_000 : undefined,
      excludedHouses,
      ownershipRatio: ownershipPercent > 0 && ownershipPercent <= 100 ? ownershipPercent / 100 : 1,
      isCorporation,
      isSpouseJointSingleHouse,
      corporationGeneralRateCategory: corporationGeneralRateCategory || undefined,
      specialHouses: Object.keys(specialHouses).length > 0 ? specialHouses : undefined,
      specialHousesRateApply: Object.keys(specialHousesRateApply).length > 0 ? specialHousesRateApply : undefined,
    };
    const base = calculatePropertyTax(input);
    if (!isReligiousSpecial) return base;
    // PDF #15 향교·종교단체 직접사용 — 산식 결과 불변, 안내 4 키만 합산 (consult-experts 앞으로 정렬은 PropertyTaxNotices TONE_ORDER 가 자동 처리)
    const religiousNotes: PropertyTaxNoticeKey[] = [
      "religious-property-tax-exempt",
      "religious-comprehensive-payer-shift",
      "religious-filing-deadline",
      "religious-joint-liability-cap",
    ];
    return { ...base, notes: [...base.notes, ...religiousNotes] };
  }, [publishedManwon, houses, isSingleHouseEligible, ageYears, holdYears, prevYearTaxManwon, excludedHouses, ownershipPercent, isCorporation, isSpouseJointSingleHouse, corporationGeneralRateCategory, specialHouses, specialHousesRateApply, isReligiousSpecial]);

  return (
    <div className="space-y-4">
      <PropertyTaxInputs
        publishedManwon={publishedManwon}
        houses={houses}
        isSingleHouseEligible={isSingleHouseEligible}
        ageYears={ageYears}
        holdYears={holdYears}
        prevYearTaxManwon={prevYearTaxManwon}
        excludedHouses={excludedHouses}
        ownershipPercent={ownershipPercent}
        isCorporation={isCorporation}
        isSpouseJointSingleHouse={isSpouseJointSingleHouse}
        corporationGeneralRateCategory={corporationGeneralRateCategory}
        specialHouses={specialHouses}
        specialHousesRateApply={specialHousesRateApply}
        isReligiousSpecial={isReligiousSpecial}
        onPublishedManwonChange={setPublishedManwon}
        onHousesChange={setHouses}
        onIsSingleHouseEligibleChange={setIsSingleHouseEligible}
        onAgeYearsChange={setAgeYears}
        onHoldYearsChange={setHoldYears}
        onPrevYearTaxManwonChange={setPrevYearTaxManwon}
        onExcludedHousesChange={setExcludedHouses}
        onOwnershipPercentChange={setOwnershipPercent}
        onIsCorporationChange={handleIsCorporationChange}
        onIsSpouseJointSingleHouseChange={handleIsSpouseJointSingleHouseChange}
        onCorporationGeneralRateCategoryChange={setCorporationGeneralRateCategory}
        onSpecialHouseEntryChange={handleSpecialHouseEntryChange}
        onRateApplyEntryChange={handleRateApplyEntryChange}
        onIsReligiousSpecialChange={setIsReligiousSpecial}
      />
      <PropertyTaxResultCard
        result={result}
        excludedHouses={excludedHouses}
        ownershipPercent={ownershipPercent}
        isSpouseJointSingleHouse={isSpouseJointSingleHouse}
        corporationGeneralRateCategory={corporationGeneralRateCategory}
        specialHouses={specialHouses}
      />
    </div>
  );
}
