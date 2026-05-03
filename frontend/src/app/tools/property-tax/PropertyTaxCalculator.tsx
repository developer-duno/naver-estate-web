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

  const result = useMemo(() => {
    const single = isSingleHouseEligible && houses === 1;
    const input: PropertyTaxInput = {
      publishedPriceWon: publishedManwon * 10_000,
      houses,
      isSingleHouseEligible: single,
      ageYears: single ? ageYears : 0,
      holdYears: single ? holdYears : 0,
    };
    return calculatePropertyTax(input);
  }, [publishedManwon, houses, isSingleHouseEligible, ageYears, holdYears]);

  return (
    <div className="space-y-4">
      <PropertyTaxInputs
        publishedManwon={publishedManwon}
        houses={houses}
        isSingleHouseEligible={isSingleHouseEligible}
        ageYears={ageYears}
        holdYears={holdYears}
        onPublishedManwonChange={setPublishedManwon}
        onHousesChange={setHouses}
        onIsSingleHouseEligibleChange={setIsSingleHouseEligible}
        onAgeYearsChange={setAgeYears}
        onHoldYearsChange={setHoldYears}
      />
      <PropertyTaxResultCard result={result} />
    </div>
  );
}
