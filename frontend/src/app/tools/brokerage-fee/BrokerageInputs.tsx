"use client";

import HintIcon from "@/components/HintIcon";
import type { TradeType, PropertyType, TaxType } from "@/lib/brokerage";

interface Props {
  tradeType: TradeType; propertyType: PropertyType;
  amountManwon: number; deposit: number; monthlyRent: number; taxType: TaxType;
  onTradeTypeChange: (v: TradeType) => void;
  onPropertyTypeChange: (v: PropertyType) => void;
  onAmountChange: (v: number) => void;
  onDepositChange: (v: number) => void;
  onMonthlyRentChange: (v: number) => void;
  onTaxTypeChange: (v: TaxType) => void;
}

const TRADE_TYPES: { value: TradeType; label: string }[] = [
  { value: "sale", label: "매매·교환" }, { value: "lease", label: "전세 (임대차)" },
  { value: "monthly", label: "월세" }, { value: "non-residential", label: "토지·상가 등" },
];
const PROPERTY_TYPES: { value: PropertyType; label: string; hint?: string }[] = [
  { value: "house", label: "주택" },
  { value: "officetel-residential", label: "오피스텔 (주거용)", hint: "전용 85㎡ 이하 + 입식부엌·수세식·세면대 완비" },
  { value: "officetel-non-residential", label: "오피스텔 (그 외)" },
];

const parseManwon = (v: string): number => {
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export default function BrokerageInputs(props: Props) {
  const isMonthly = props.tradeType === "monthly";
  const inputCls = "w-full min-h-[44px] px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500";
  const radioBtn = "min-h-[44px] flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer text-sm hover:bg-gray-50";

  return (
    <div className="space-y-5 rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
      <fieldset>
        <legend className="text-sm font-semibold text-gray-900 mb-2">거래유형</legend>
        <div className="grid grid-cols-2 gap-2">
          {TRADE_TYPES.map((t) => (
            <label key={t.value} className={`${radioBtn} ${props.tradeType === t.value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300"}`}>
              <input type="radio" name="tradeType" value={t.value} checked={props.tradeType === t.value} onChange={() => props.onTradeTypeChange(t.value)} className="accent-blue-600" />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-gray-900 mb-2">매물유형</legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {PROPERTY_TYPES.map((p) => (
            <label key={p.value} className={`${radioBtn} ${props.propertyType === p.value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300"}`}>
              <input type="radio" name="propertyType" value={p.value} checked={props.propertyType === p.value} onChange={() => props.onPropertyTypeChange(p.value)} className="accent-blue-600" />
              <span className="flex items-center gap-1">{p.label}{p.hint && <HintIcon text={p.hint} />}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {isMonthly ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="deposit" className="block text-sm font-semibold text-gray-900 mb-1">보증금 <span className="text-gray-500 font-normal">(만원)</span></label>
            <input id="deposit" type="number" inputMode="numeric" min={0} value={props.deposit || ""} onChange={(e) => props.onDepositChange(parseManwon(e.target.value))} placeholder="예: 5000" className={inputCls} aria-label="보증금 (만원)" />
          </div>
          <div>
            <label htmlFor="monthlyRent" className="block text-sm font-semibold text-gray-900 mb-1">월세 <span className="text-gray-500 font-normal">(만원)</span></label>
            <input id="monthlyRent" type="number" inputMode="numeric" min={0} value={props.monthlyRent || ""} onChange={(e) => props.onMonthlyRentChange(parseManwon(e.target.value))} placeholder="예: 50" className={inputCls} aria-label="월세 (만원)" />
          </div>
        </div>
      ) : (
        <div>
          <label htmlFor="amount" className="block text-sm font-semibold text-gray-900 mb-1">거래금액 <span className="text-gray-500 font-normal">(만원)</span></label>
          <input id="amount" type="number" inputMode="numeric" min={0} value={props.amountManwon || ""} onChange={(e) => props.onAmountChange(parseManwon(e.target.value))} placeholder="예: 50000 (5억)" className={inputCls} aria-label="거래금액 (만원)" />
        </div>
      )}

      <fieldset>
        <legend className="text-sm font-semibold text-gray-900 mb-2">부가세 유형</legend>
        <div className="grid grid-cols-2 gap-2">
          <label className={`${radioBtn} ${props.taxType === "general" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300"}`}>
            <input type="radio" name="taxType" value="general" checked={props.taxType === "general"} onChange={() => props.onTaxTypeChange("general")} className="accent-blue-600" />
            일반과세 (+10%)
          </label>
          <label className={`${radioBtn} ${props.taxType === "simplified" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300"}`}>
            <input type="radio" name="taxType" value="simplified" checked={props.taxType === "simplified"} onChange={() => props.onTaxTypeChange("simplified")} className="accent-blue-600" />
            간이과세 (면제)
          </label>
        </div>
      </fieldset>
    </div>
  );
}
