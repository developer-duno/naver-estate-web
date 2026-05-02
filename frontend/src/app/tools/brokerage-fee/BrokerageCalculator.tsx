"use client";

import { useMemo, useState } from "react";
import {
  calculateBrokerageFee,
  type BrokerageInput,
  type TradeType,
  type PropertyType,
  type TaxType,
} from "@/lib/brokerage";

/**
 * 중개수수료 계산기 컨테이너
 *
 * 입력 초기화 정책:
 *  - 거래유형 변경: 필드 의미 자체가 달라지므로 amount/deposit/monthlyRent 모두 0
 *  - 매물유형 변경: 동일 금액에서 다른 요율 비교 가능 → 입력값 유지
 *  - 부가세 변경: 결과만 갱신 → 입력값 유지
 *
 * B-2 머지 전 placeholder UI (B-2에서 BrokerageInputs/BrokerageResultCard로 교체)
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

  const result = useMemo(() => {
    const input: BrokerageInput = {
      tradeType,
      propertyType,
      amountWon: amountManwon * 10_000,
      deposit: deposit * 10_000,
      monthlyRent: monthlyRent * 10_000,
      taxType,
    };
    return calculateBrokerageFee(input);
  }, [tradeType, propertyType, amountManwon, deposit, monthlyRent, taxType]);

  // 빌드 호환 placeholder — B-2에서 <BrokerageInputs ... /> + <BrokerageResultCard ... /> 로 교체
  void result;
  void handleTradeTypeChange;
  void setPropertyType;
  void setDeposit;
  void setMonthlyRent;
  void setTaxType;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
        입력 폼 준비 중 (B-2에서 활성화)
      </div>
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
        결과 카드 준비 중 (B-2에서 활성화)
      </div>
    </div>
  );
}
