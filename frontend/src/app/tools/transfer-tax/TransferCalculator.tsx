"use client";

import { useMemo, useState } from "react";
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
      <TransferResultCard result={result} />
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
        💡 안내 메시지 ({result.notes.length}건) — 다음 단계 TransferNotices 에서 표시
      </div>
    </div>
  );
}
