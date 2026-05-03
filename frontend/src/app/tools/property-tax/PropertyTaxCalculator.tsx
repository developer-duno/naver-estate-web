"use client";

import { useMemo, useState } from "react";
import { calculatePropertyTax } from "@/lib/property-tax";
import type { PropertyTaxInput } from "@/lib/property-tax-types";
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

  const result = useMemo(() => {
    const single = isSingleHouseEligible && houses === 1;
    const input: PropertyTaxInput = {
      publishedPriceWon: publishedManwon * 10_000,
      houses,
      isSingleHouseEligible: single,
      ageYears: single ? ageYears : 0,
      holdYears: single ? holdYears : 0,
      prevYearTax: prevYearTaxManwon > 0 ? prevYearTaxManwon * 10_000 : undefined,
      excludedHouses,
      ownershipRatio: ownershipPercent > 0 && ownershipPercent <= 100 ? ownershipPercent / 100 : 1,
      isCorporation,
    };
    return calculatePropertyTax(input);
  }, [publishedManwon, houses, isSingleHouseEligible, ageYears, holdYears, prevYearTaxManwon, excludedHouses, ownershipPercent, isCorporation]);

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
        onPublishedManwonChange={setPublishedManwon}
        onHousesChange={setHouses}
        onIsSingleHouseEligibleChange={setIsSingleHouseEligible}
        onAgeYearsChange={setAgeYears}
        onHoldYearsChange={setHoldYears}
        onPrevYearTaxManwonChange={setPrevYearTaxManwon}
        onExcludedHousesChange={setExcludedHouses}
        onOwnershipPercentChange={setOwnershipPercent}
        onIsCorporationChange={setIsCorporation}
      />
      <PropertyTaxResultCard result={result} />
    </div>
  );
}
