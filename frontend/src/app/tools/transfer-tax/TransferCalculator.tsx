"use client";

import { useCallback, useMemo, useState } from "react";
import {
  calculateTransferTax,
  computeHoldYears,
  type TransferInput,
} from "@/lib/transfer-tax";
import type { TransferExemptionOverride } from "@/lib/transfer-tax-types";
import TransferInputs from "./TransferInputs";
import TransferResultCard from "./TransferResultCard";

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function TransferCalculator() {
  const [transferManwon, setTransferManwon] = useState(0);
  const [acquisitionManwon, setAcquisitionManwon] = useState(0);
  const [expensesManwon, setExpensesManwon] = useState(0);
  const [acquisitionDate, setAcquisitionDate] = useState("");
  const [transferDate, setTransferDate] = useState(todayISO);
  const [livedYears, setLivedYears] = useState(0);
  const [houses, setHouses] = useState<1 | 2 | 3>(1);
  const [isRegulatedAtTransfer, setIsRegulatedAtTransfer] = useState(false);
  const [isRegulatedAtAcquisition, setIsRegulatedAtAcquisition] = useState(false);
  const [areaM2, setAreaM2] = useState(84);
  const [isUnregistered, setIsUnregistered] = useState(false);
  const [exemptionOverride, setExemptionOverride] = useState<TransferExemptionOverride>("auto");

  // 전체 초기화 — 모든 입력을 마운트 초기값으로 복원 (transferDate 는 todayISO() 재호출, 고정/빈값 금지)
  const handleReset = useCallback(() => {
    setTransferManwon(0);
    setAcquisitionManwon(0);
    setExpensesManwon(0);
    setAcquisitionDate("");
    setTransferDate(todayISO());
    setLivedYears(0);
    setHouses(1);
    setIsRegulatedAtTransfer(false);
    setIsRegulatedAtAcquisition(false);
    setAreaM2(84);
    setIsUnregistered(false);
    setExemptionOverride("auto");
  }, []);

  const result = useMemo(() => {
    const holdYears = acquisitionDate ? computeHoldYears(acquisitionDate, transferDate) : 0;
    const input: TransferInput = {
      transferWon: transferManwon * 10_000,
      acquisitionWon: acquisitionManwon * 10_000,
      expensesWon: expensesManwon * 10_000,
      acquisitionDate, transferDate, holdYears, livedYears, houses,
      isRegulatedAtTransfer, isRegulatedAtAcquisition,
      areaM2, isUnregistered, exemptionOverride,
    };
    return calculateTransferTax(input);
  }, [
    transferManwon, acquisitionManwon, expensesManwon,
    acquisitionDate, transferDate, livedYears, houses,
    isRegulatedAtTransfer, isRegulatedAtAcquisition,
    areaM2, isUnregistered, exemptionOverride,
  ]);

  return (
    <div className="space-y-4">
      <TransferInputs
        transferManwon={transferManwon} acquisitionManwon={acquisitionManwon}
        expensesManwon={expensesManwon} acquisitionDate={acquisitionDate}
        transferDate={transferDate} livedYears={livedYears} houses={houses}
        isRegulatedAtTransfer={isRegulatedAtTransfer}
        isRegulatedAtAcquisition={isRegulatedAtAcquisition}
        areaM2={areaM2} isUnregistered={isUnregistered}
        exemptionOverride={exemptionOverride}
        onTransferManwonChange={setTransferManwon}
        onAcquisitionManwonChange={setAcquisitionManwon}
        onExpensesManwonChange={setExpensesManwon}
        onAcquisitionDateChange={setAcquisitionDate}
        onTransferDateChange={setTransferDate}
        onLivedYearsChange={setLivedYears}
        onHousesChange={setHouses}
        onIsRegulatedAtTransferChange={setIsRegulatedAtTransfer}
        onIsRegulatedAtAcquisitionChange={setIsRegulatedAtAcquisition}
        onAreaM2Change={setAreaM2}
        onIsUnregisteredChange={setIsUnregistered}
        onExemptionOverrideChange={setExemptionOverride}
      />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleReset}
          className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
        >
          초기화
        </button>
      </div>
      <TransferResultCard result={result} />
    </div>
  );
}
