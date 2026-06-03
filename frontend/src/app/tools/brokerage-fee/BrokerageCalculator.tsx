"use client";

import { useCallback, useMemo, useState } from "react";
import {
  calculateBrokerageFee,
  type BrokerageInput, type TradeType, type PropertyType, type TaxType,
} from "@/lib/brokerage";
import BrokerageInputs from "./BrokerageInputs";
import BrokerageResultCard from "./BrokerageResultCard";

/**
 * 입력 초기화 정책:
 *  - 거래유형 변경: 필드 의미 자체가 달라지므로 amount/deposit/monthlyRent 모두 0
 *  - 매물유형/부가세 변경: 입력값 유지 (결과만 갱신)
 */
export default function BrokerageCalculator() {
  const [tradeType, setTradeType] = useState<TradeType>("sale");
  const [propertyType, setPropertyType] = useState<PropertyType>("house");
  const [amountManwon, setAmountManwon] = useState(0);
  const [deposit, setDeposit] = useState(0);
  const [monthlyRent, setMonthlyRent] = useState(0);
  const [taxType, setTaxType] = useState<TaxType>("general");

  const handleTradeTypeChange = (next: TradeType) => {
    setTradeType(next);
    setAmountManwon(0);
    setDeposit(0);
    setMonthlyRent(0);
  };

  // 전체 초기화 — 모든 입력을 마운트 초기값으로 복원
  const handleReset = useCallback(() => {
    setTradeType("sale");
    setPropertyType("house");
    setAmountManwon(0);
    setDeposit(0);
    setMonthlyRent(0);
    setTaxType("general");
  }, []);

  const result = useMemo(() => {
    const input: BrokerageInput = {
      tradeType, propertyType,
      amountWon: amountManwon * 10_000,
      deposit: deposit * 10_000,
      monthlyRent: monthlyRent * 10_000,
      taxType,
    };
    return calculateBrokerageFee(input);
  }, [tradeType, propertyType, amountManwon, deposit, monthlyRent, taxType]);

  return (
    <div className="space-y-4">
      <BrokerageInputs
        tradeType={tradeType} propertyType={propertyType}
        amountManwon={amountManwon} deposit={deposit} monthlyRent={monthlyRent} taxType={taxType}
        onTradeTypeChange={handleTradeTypeChange}
        onPropertyTypeChange={setPropertyType}
        onAmountChange={setAmountManwon}
        onDepositChange={setDeposit}
        onMonthlyRentChange={setMonthlyRent}
        onTaxTypeChange={setTaxType}
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
      <BrokerageResultCard result={result} taxType={taxType} />
    </div>
  );
}
