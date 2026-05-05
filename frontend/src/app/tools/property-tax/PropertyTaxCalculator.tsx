"use client";

import { useMemo, useState } from "react";
import { calculatePropertyTax } from "@/lib/property-tax";
import type { PropertyTaxInput, CorporationGeneralRateCategory } from "@/lib/property-tax-types";
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
    };
    return calculatePropertyTax(input);
  }, [publishedManwon, houses, isSingleHouseEligible, ageYears, holdYears, prevYearTaxManwon, excludedHouses, ownershipPercent, isCorporation, isSpouseJointSingleHouse, corporationGeneralRateCategory]);

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
      />
      <PropertyTaxResultCard
        result={result}
        excludedHouses={excludedHouses}
        ownershipPercent={ownershipPercent}
        isSpouseJointSingleHouse={isSpouseJointSingleHouse}
        corporationGeneralRateCategory={corporationGeneralRateCategory}
      />
    </div>
  );
}
