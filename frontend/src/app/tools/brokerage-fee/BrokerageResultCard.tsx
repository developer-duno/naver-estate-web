"use client";

import type { BrokerageResult, TaxType } from "@/lib/brokerage";

interface Props {
  result: BrokerageResult;
  taxType: TaxType;
}

const fmtWon = (won: number): string => {
  const manwon = Math.round(won / 10_000);
  if (manwon >= 10_000) {
    const eok = Math.floor(manwon / 10_000);
    const rest = manwon % 10_000;
    return rest > 0 ? `${eok}억 ${rest.toLocaleString()}만원` : `${eok}억원`;
  }
  return `${manwon.toLocaleString()}만원`;
};

export default function BrokerageResultCard({ result, taxType }: Props) {
  if (result.total === 0 && !result.isNegotiable) {
    return (
      <div role="status" aria-live="polite" className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
        거래금액을 입력하세요.
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6 space-y-4">
      <div>
        <div className="text-xs text-gray-500 mb-1">거래금액</div>
        <div className="text-base font-semibold text-gray-900">
          {fmtWon(result.convertedAmount)}
          {result.conversionFormula && (
            <span className="block text-xs text-gray-500 font-normal mt-0.5">{result.conversionFormula}</span>
          )}
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <div className="text-xs text-gray-500 mb-1">{result.isNegotiable ? "참고 적용 요율" : "적용 구간"}</div>
        <div className="text-sm text-gray-700">{result.bracketLabel}</div>
      </div>

      {result.isNegotiable && (
        <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 text-sm">
          <div className="font-semibold text-yellow-900 mb-1">⚠️ 협의형 수수료</div>
          <div className="text-yellow-800 leading-relaxed">
            최대 0.9% 범위에서 양당사자 협의로 결정됩니다. 아래는 법정 상한 기준 참고치입니다.
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
        <div>
          <div className="text-xs text-gray-500 mb-1">수수료 (부가세 별도)</div>
          <div className="text-base font-semibold text-gray-900">{fmtWon(result.feeBeforeTax)}</div>
          {result.capApplied && <div className="text-xs text-amber-600 mt-0.5">한도 적용됨</div>}
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">부가세 ({taxType === "general" ? "10%" : "면제"})</div>
          <div className="text-base font-semibold text-gray-900">{fmtWon(result.vat)}</div>
        </div>
      </div>

      <div className="rounded-md bg-blue-50 border border-blue-200 p-3 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-blue-900">총 청구액</span>
        <span className="text-xl font-bold text-blue-900">{fmtWon(result.total)}</span>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-blue-600 hover:underline select-none">계산식 보기</summary>
        <ol className="mt-2 ml-4 list-decimal text-xs text-gray-700 space-y-1">
          {result.formulaSteps.map((step, i) => <li key={i}>{step}</li>)}
        </ol>
      </details>
    </div>
  );
}
