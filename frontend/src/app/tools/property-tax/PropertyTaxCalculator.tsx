"use client";

import { useCallback, useMemo, useState } from "react";
import { calculatePropertyTax } from "@/lib/property-tax";
import type { PropertyTaxInput, CorporationGeneralRateCategory, SpecialHousesInput, SpecialHousesRateApplyInput, PropertyTaxNoticeKey, HoldPeriodSpecialMode } from "@/lib/property-tax-types";
import PropertyTaxInputs from "./PropertyTaxInputs";
import PropertyTaxResultCard from "./PropertyTaxResultCard";
import PropertyTaxComplexPicker from "./PropertyTaxComplexPicker";

export default function PropertyTaxCalculator() {
  const [publishedManwon, setPublishedManwon] = useState(0);
  const [houses, setHouses] = useState<1 | 2 | 3>(1);
  const [isSingleHouseEligible, setIsSingleHouseEligible] = useState(false);
  const [ageYears, setAgeYears] = useState(0);
  const [holdYears, setHoldYears] = useState(0);
  const [prevYearComprehensiveTaxManwon, setPrevYearComprehensiveTaxManwon] = useState(0);
  const [prevYearPropertyTaxBaseManwon, setPrevYearPropertyTaxBaseManwon] = useState(0);
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
  // PDF #16 보유기간 계산 특례 (세션 115) — 라디오 3상태 + 원래 취득연도, holdYears 자동 재계산
  const [holdPeriodSpecialMode, setHoldPeriodSpecialMode] = useState<HoldPeriodSpecialMode>("none");
  const [originalAcquisitionYear, setOriginalAcquisitionYear] = useState(0);

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

  // PDF #16 라디오 "신청 안 함" 선택 시 원래 취득연도 자동 reset (UX 가드, 세션 115)
  const handleHoldPeriodSpecialModeChange = (v: HoldPeriodSpecialMode) => {
    setHoldPeriodSpecialMode(v);
    if (v === "none") setOriginalAcquisitionYear(0);
  };

  // 전체 초기화 — 모든 입력을 마운트 초기값으로 복원 (부수효과 핸들러 경유 금지, raw setState 직접 세팅)
  const handleReset = useCallback(() => {
    setPublishedManwon(0);
    setHouses(1);
    setIsSingleHouseEligible(false);
    setAgeYears(0);
    setHoldYears(0);
    setPrevYearComprehensiveTaxManwon(0);
    setPrevYearPropertyTaxBaseManwon(0);
    setExcludedHouses(0);
    setOwnershipPercent(0);
    setIsCorporation(false);
    setIsSpouseJointSingleHouse(false);
    setCorporationGeneralRateCategory("");
    setSpecialHouses({});
    setSpecialHousesRateApply({});
    setIsReligiousSpecial(false);
    setHoldPeriodSpecialMode("none");
    setOriginalAcquisitionYear(0);
  }, []);

  const result = useMemo(() => {
    // single 분기: 본인 단독 1세대1주택 OR 부부 공동명의 1주택 특례 모두 ageYears/holdYears 전달
    const single = (isSingleHouseEligible || isSpouseJointSingleHouse) && houses === 1;
    // PDF #16 보유기간 자동 재계산 (세션 115) — Transfer Calculator 답습 (let + if)
    let effectiveHoldYears = holdYears;
    if (holdPeriodSpecialMode !== "none" && originalAcquisitionYear > 0) {
      const computed = new Date().getFullYear() - originalAcquisitionYear;
      if (computed > 0) effectiveHoldYears = Math.max(holdYears, computed);
    }
    // 라디오만 켜고 연도 미입력 시 산식 input 의 mode 를 "none" 으로 정규화 (UX 명확)
    const normalizedMode: HoldPeriodSpecialMode = (holdPeriodSpecialMode !== "none" && originalAcquisitionYear > 0) ? holdPeriodSpecialMode : "none";
    const input: PropertyTaxInput = {
      publishedPriceWon: publishedManwon * 10_000,
      houses,
      isSingleHouseEligible: isSingleHouseEligible && houses === 1,
      ageYears: single ? ageYears : 0,
      holdYears: single ? effectiveHoldYears : 0,
      prevYearComprehensiveTax: prevYearComprehensiveTaxManwon > 0 ? prevYearComprehensiveTaxManwon * 10_000 : undefined,
      prevYearPropertyTaxBase: prevYearPropertyTaxBaseManwon > 0 ? prevYearPropertyTaxBaseManwon * 10_000 : undefined,
      excludedHouses,
      ownershipRatio: ownershipPercent > 0 && ownershipPercent <= 100 ? ownershipPercent / 100 : 1,
      isCorporation,
      isSpouseJointSingleHouse,
      corporationGeneralRateCategory: corporationGeneralRateCategory || undefined,
      specialHouses: Object.keys(specialHouses).length > 0 ? specialHouses : undefined,
      specialHousesRateApply: Object.keys(specialHousesRateApply).length > 0 ? specialHousesRateApply : undefined,
      holdPeriodSpecialMode: normalizedMode,
      originalAcquisitionYear: originalAcquisitionYear > 0 ? originalAcquisitionYear : undefined,
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
  }, [publishedManwon, houses, isSingleHouseEligible, ageYears, holdYears, prevYearComprehensiveTaxManwon, prevYearPropertyTaxBaseManwon, excludedHouses, ownershipPercent, isCorporation, isSpouseJointSingleHouse, corporationGeneralRateCategory, specialHouses, specialHousesRateApply, isReligiousSpecial, holdPeriodSpecialMode, originalAcquisitionYear]);

  return (
    <div className="space-y-4">
      <PropertyTaxComplexPicker
        ownershipPercent={ownershipPercent}
        publishedManwon={publishedManwon}
        onFill={setPublishedManwon}
      />
      <PropertyTaxInputs
        publishedManwon={publishedManwon}
        houses={houses}
        isSingleHouseEligible={isSingleHouseEligible}
        ageYears={ageYears}
        holdYears={holdYears}
        prevYearComprehensiveTaxManwon={prevYearComprehensiveTaxManwon}
        prevYearPropertyTaxBaseManwon={prevYearPropertyTaxBaseManwon}
        excludedHouses={excludedHouses}
        ownershipPercent={ownershipPercent}
        isCorporation={isCorporation}
        isSpouseJointSingleHouse={isSpouseJointSingleHouse}
        corporationGeneralRateCategory={corporationGeneralRateCategory}
        specialHouses={specialHouses}
        specialHousesRateApply={specialHousesRateApply}
        isReligiousSpecial={isReligiousSpecial}
        holdPeriodSpecialMode={holdPeriodSpecialMode}
        originalAcquisitionYear={originalAcquisitionYear}
        onPublishedManwonChange={setPublishedManwon}
        onHousesChange={setHouses}
        onIsSingleHouseEligibleChange={setIsSingleHouseEligible}
        onAgeYearsChange={setAgeYears}
        onHoldYearsChange={setHoldYears}
        onPrevYearComprehensiveTaxManwonChange={setPrevYearComprehensiveTaxManwon}
        onPrevYearPropertyTaxBaseManwonChange={setPrevYearPropertyTaxBaseManwon}
        onExcludedHousesChange={setExcludedHouses}
        onOwnershipPercentChange={setOwnershipPercent}
        onIsCorporationChange={handleIsCorporationChange}
        onIsSpouseJointSingleHouseChange={handleIsSpouseJointSingleHouseChange}
        onCorporationGeneralRateCategoryChange={setCorporationGeneralRateCategory}
        onSpecialHouseEntryChange={handleSpecialHouseEntryChange}
        onRateApplyEntryChange={handleRateApplyEntryChange}
        onIsReligiousSpecialChange={setIsReligiousSpecial}
        onHoldPeriodSpecialModeChange={handleHoldPeriodSpecialModeChange}
        onOriginalAcquisitionYearChange={setOriginalAcquisitionYear}
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
