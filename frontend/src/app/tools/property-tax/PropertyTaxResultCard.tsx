"use client";

import type { PropertyTaxResult } from "@/lib/property-tax-types";
import PropertyTaxNotices from "./PropertyTaxNotices";

interface Props {
  result: PropertyTaxResult;
  excludedHouses?: number;
  ownershipPercent?: number;
}

// 누진세율 라벨 — 0 일 때 "(공제 미만)" 인라인, R12 답습 (`|| 0` fallback NaN 방지)
function formatPropertyRateLabel(rate: number, kind: "property" | "comprehensive"): string {
  const safeRate = rate || 0;
  const label = kind === "property" ? "재산세" : "종부세";
  if (safeRate === 0) return `${label} (공제 미만)`;
  const ratePct = (safeRate * 100).toFixed(2).replace(/\.?0+$/, "");
  return `${label} (${ratePct}%)`;
}

const BRANCH_TEXT: Record<PropertyTaxResult["branch"], { color: string; label: string }> = {
  empty: { color: "gray", label: "공시가격을 입력하세요" },
  "below-threshold": { color: "green", label: "종부세 과세표준 0 — 재산세만 부과" },
  "single-house": { color: "blue", label: "1세대1주택자 (공제 12억 + 세액공제)" },
  "multi-house": { color: "purple", label: "다주택자 (공제 9억, 3주택+ 25억 초과 중과)" },
  corporation: { color: "amber", label: "법인 보유 (단일세율 2.7% / 5.0%, 공제 없음)" },
};

const COLOR_CLASS: Record<string, string> = {
  gray: "bg-gray-50 border-gray-200 text-gray-900",
  green: "bg-green-50 border-green-200 text-green-900",
  blue: "bg-blue-50 border-blue-200 text-blue-900",
  purple: "bg-purple-50 border-purple-200 text-purple-900",
  amber: "bg-amber-50 border-amber-200 text-amber-900",
};

export default function PropertyTaxResultCard({ result, excludedHouses, ownershipPercent }: Props) {
  const branchInfo = BRANCH_TEXT[result.branch];
  const empty = result.branch === "empty";
  const showRural = result.ruralTax > 0;
  const showCredit = result.comprehensiveTaxCredit > 0;
  const showExcluded = !empty && (excludedHouses ?? 0) > 0;
  const showOwnership = !empty && ownershipPercent !== undefined && ownershipPercent > 0 && ownershipPercent < 100;

  return (
    <section
      className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6 space-y-3"
      aria-live="polite"
    >
      <div className={`rounded-md border px-3 py-2 text-sm ${COLOR_CLASS[branchInfo.color]}`}>
        <strong>분기:</strong> {branchInfo.label}
      </div>
      {(showExcluded || showOwnership) && (
        <div className="text-xs text-gray-600 space-y-0.5">
          {showExcluded && <div>합산배제 신청: 제외 {excludedHouses}주택</div>}
          {showOwnership && <div>공동명의 본인 지분: {ownershipPercent}%</div>}
        </div>
      )}
      {!empty && (
        <>
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="py-1.5 text-gray-600">
                  {formatPropertyRateLabel(result.appliedRate.property, "property")}
                </td>
                <td className="py-1.5 text-right">{result.propertyTax.toLocaleString()}원</td>
              </tr>
              <tr className={result.comprehensiveTax === 0 ? "text-gray-400" : ""}>
                <td className="py-1.5">
                  {formatPropertyRateLabel(result.appliedRate.comprehensive, "comprehensive")}
                </td>
                <td className="py-1.5 text-right">{result.comprehensiveTax.toLocaleString()}원</td>
              </tr>
              {showCredit && (
                <tr>
                  <td className="py-1.5 text-gray-600">
                    └ 세액공제 (연령+보유)
                  </td>
                  <td className="py-1.5 text-right text-green-700">
                    -{result.comprehensiveTaxCredit.toLocaleString()}원
                  </td>
                </tr>
              )}
              {showRural && (
                <tr>
                  <td className="py-1.5 text-gray-600">농특세 (종부세 × 20%)</td>
                  <td className="py-1.5 text-right">{result.ruralTax.toLocaleString()}원</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-3 text-center">
            <div className="text-xs text-blue-700 mb-1">총 부담 (재산세 + 종부세 + 농특세)</div>
            <div className="text-2xl font-bold text-blue-900">
              {result.grandTotal.toLocaleString()}원
            </div>
            {result.wasCapped && (
              <div className="mt-1 text-xs text-blue-700">
                ✓ 세부담 상한 150% cap 적용 (cap 적용 전 원본:{" "}
                <span className="font-semibold">{result.uncappedGrandTotal.toLocaleString()}원</span>)
              </div>
            )}
          </div>
          <PropertyTaxNotices notes={result.notes} />
        </>
      )}
    </section>
  );
}
