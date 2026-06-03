"use client";

import { useCallback, useMemo, useState } from "react";
import {
  calculateAcquisitionTax,
  DEFAULT_AREA_M2,
  type AcquisitionInput,
  type AcquisitionPropertyType,
} from "@/lib/acquisition-tax";
import AcquisitionInputs from "./AcquisitionInputs";
import AcquisitionResultCard from "./AcquisitionResultCard";

/**
 * 취득세 계산기 컨테이너.
 * 생애최초 비활성 사유: 오피스텔(우선순위 1) > 12억 초과(2) > 다주택(3).
 */
export default function AcquisitionCalculator() {
  const [propertyType, setPropertyType] = useState<AcquisitionPropertyType>("house");
  const [houses, setHouses] = useState<1 | 2 | 3>(1);
  const [isRegulatedArea, setIsRegulatedArea] = useState(false);
  const [isFirstTime, setIsFirstTime] = useState(false);
  const [areaM2, setAreaM2] = useState<number>(DEFAULT_AREA_M2);
  const [amountManwon, setAmountManwon] = useState(0);

  const amountWon = amountManwon * 10_000;

  const firstTimeDisabledReason: string | null =
    propertyType === "officetel-commercial"
      ? "오피스텔·상가는 생애최초 감면 대상이 아닙니다"
      : amountWon > 1_200_000_000
        ? "12억 초과 매물은 생애최초 감면 대상이 아닙니다"
        : houses >= 2
          ? "다주택자는 생애최초 감면 대상이 아닙니다"
          : null;

  const handleHousesChange = (next: 1 | 2 | 3) => {
    setHouses(next);
    if (next >= 2) setIsFirstTime(false);
  };

  const handlePropertyTypeChange = (next: AcquisitionPropertyType) => {
    setPropertyType(next);
    if (next === "officetel-commercial") setIsFirstTime(false);
  };

  // 전체 초기화 — 모든 입력을 마운트 초기값으로 복원 (areaM2 는 DEFAULT_AREA_M2=84, 0 금지)
  const handleReset = useCallback(() => {
    setPropertyType("house");
    setHouses(1);
    setIsRegulatedArea(false);
    setIsFirstTime(false);
    setAreaM2(DEFAULT_AREA_M2);
    setAmountManwon(0);
  }, []);

  const result = useMemo(() => {
    const input: AcquisitionInput = {
      amountWon,
      propertyType,
      houses,
      isRegulatedArea,
      isFirstTime: firstTimeDisabledReason ? false : isFirstTime,
      area_m2: areaM2,
    };
    return calculateAcquisitionTax(input);
  }, [amountWon, propertyType, houses, isRegulatedArea, isFirstTime, areaM2, firstTimeDisabledReason]);

  return (
    <div className="space-y-4">
      <AcquisitionInputs
        propertyType={propertyType}
        houses={houses}
        isRegulatedArea={isRegulatedArea}
        isFirstTime={isFirstTime}
        areaM2={areaM2}
        amountManwon={amountManwon}
        firstTimeDisabledReason={firstTimeDisabledReason}
        onPropertyTypeChange={handlePropertyTypeChange}
        onHousesChange={handleHousesChange}
        onIsRegulatedAreaChange={setIsRegulatedArea}
        onIsFirstTimeChange={setIsFirstTime}
        onAreaM2Change={setAreaM2}
        onAmountChange={setAmountManwon}
      />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleReset}
          className="rounded-md border border-pink-300 bg-pink-50 px-3 py-1 text-xs font-medium text-pink-700 hover:bg-pink-100"
        >
          초기화
        </button>
      </div>
      <AcquisitionResultCard result={result} />
    </div>
  );
}
