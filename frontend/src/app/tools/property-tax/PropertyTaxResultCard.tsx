"use client";

import type { PropertyTaxResult, CorporationGeneralRateCategory, SpecialHousesInput } from "@/lib/property-tax-types";
import PropertyTaxNotices from "./PropertyTaxNotices";
import CopyButton from "@/components/CopyButton";

interface Props {
  result: PropertyTaxResult;
  excludedHouses?: number;
  ownershipPercent?: number;
  isSpouseJointSingleHouse?: boolean;
  corporationGeneralRateCategory?: CorporationGeneralRateCategory | "";
  specialHouses?: SpecialHousesInput;
}

// 5종 특례주택 카테고리 → 한글 짧은 라벨 (ResultCard 입력값 표시 행, 세션 112)
const SPECIAL_HOUSE_LABEL: Record<keyof SpecialHousesInput, string> = {
  temporary2: "① 일시적2주택",
  inherited: "② 상속주택",
  ruralLowPrice: "③ 지방저가",
  populationDecline: "④ 인구감소지역",
  postCompletionUnsold: "⑤ 준공후미분양",
};

// PDF #14 페이지 2 표 — 카테고리 → 한글 짧은 라벨 (ResultCard 입력값 표시 행)
const CORP_GENERAL_LABEL: Record<CorporationGeneralRateCategory, string> = {
  "public-charity-other": "① 공익법인등 (②미해당)",
  "public-charity-direct": "② 공익법인등 (공익목적 직접 사용)",
  "public-housing": "③ 공공주택사업자",
  "housing-association": "④ 주택조합",
  "redevelopment": "⑤ 정비사업시행자",
  "private-rental": "⑥ 민간건설임대사업자",
  "urban-development": "⑦ 도시개발사업시행자",
  "social-enterprise": "⑧ 사회적기업등",
  "clan": "⑨ 종중",
};

// 누진세율 라벨 — 0 일 때 "(공제 미만)" 인라인, R12 답습 (`|| 0` fallback NaN 방지).
// v3-A ①: 재산세는 적용 공정시장가액비율 동반 표시 (1주택 차등 43~45% vs 일반 60%).
function formatPropertyRateLabel(rate: number, kind: "property" | "comprehensive", fairMarketRatio?: number): string {
  const safeRate = rate || 0;
  const label = kind === "property" ? "재산세" : "종부세";
  if (safeRate === 0) return `${label} (공제 미만)`;
  const ratePct = (safeRate * 100).toFixed(2).replace(/\.?0+$/, "");
  if (kind === "property" && fairMarketRatio && fairMarketRatio > 0) {
    const fmrPct = Math.round(fairMarketRatio * 100);
    return `${label} (공정시장 ${fmrPct}% × ${ratePct}%)`;
  }
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

export default function PropertyTaxResultCard({ result, excludedHouses, ownershipPercent, isSpouseJointSingleHouse, corporationGeneralRateCategory, specialHouses }: Props) {
  const branchInfo = BRANCH_TEXT[result.branch];
  const empty = result.branch === "empty";
  const showRural = result.ruralTax > 0;
  const showCompPropertyCredit = result.comprehensivePropertyTaxCredit > 0;
  const showCredit = result.comprehensiveTaxCredit > 0;
  const showExcluded = !empty && (excludedHouses ?? 0) > 0;
  const showOwnership = !empty && ownershipPercent !== undefined && ownershipPercent > 0 && ownershipPercent < 100;
  const showSpouseJoint = !empty && isSpouseJointSingleHouse === true;
  const showCorpGeneral = !empty && result.branch === "corporation" && corporationGeneralRateCategory != null && corporationGeneralRateCategory !== "";
  // 5종 특례주택 표시 (count > 0 카테고리만, 행 폭증 방지)
  const specialEntries = !empty && specialHouses
    ? (Object.keys(SPECIAL_HOUSE_LABEL) as Array<keyof SpecialHousesInput>)
        .filter((k) => (specialHouses[k]?.count ?? 0) > 0)
    : [];
  const showSpecialHouses = specialEntries.length > 0 && result.notes.includes("special-houses-applied");

  return (
    <section
      className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6 space-y-3"
      aria-live="polite"
    >
      <div className={`rounded-md border px-3 py-2 text-sm ${COLOR_CLASS[branchInfo.color]}`}>
        <strong>분기:</strong> {branchInfo.label}
      </div>
      {(showExcluded || showOwnership || showSpouseJoint || showCorpGeneral || showSpecialHouses) && (
        <div className="text-xs text-gray-600 space-y-0.5">
          {showExcluded && <div>합산배제 신청: 제외 {excludedHouses}주택</div>}
          {showOwnership && <div>공동명의 본인 지분: {ownershipPercent}%</div>}
          {showSpouseJoint && <div>부부 공동명의 1주택자 특례 적용 (1인 합산 12억 공제)</div>}
          {showCorpGeneral && (
            <div>
              법인 일반 누진세율 신청: {CORP_GENERAL_LABEL[corporationGeneralRateCategory as CorporationGeneralRateCategory]}
            </div>
          )}
          {showSpecialHouses && (
            <>
              <div className="font-medium text-gray-700 mt-1">1세대1주택 5종 특례주택 적용:</div>
              {specialEntries.map((k) => {
                const entry = specialHouses![k]!;
                return (
                  <div key={k} className="pl-2">
                    {SPECIAL_HOUSE_LABEL[k]}: {entry.count}채 × 평균 공시가 {entry.publishedAverage.toLocaleString()}만원 = 합계 {(entry.count * entry.publishedAverage).toLocaleString()}만원
                  </div>
                );
              })}
              {result.notes.includes("special-houses-credit-prorated") && (
                <div className="pl-2 text-blue-700">└ 안분 비율 적용 (산출세액 × 1주택 비율 × 공제율)</div>
              )}
            </>
          )}
        </div>
      )}
      {!empty && (
        <>
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="py-1.5 text-gray-600">
                  {formatPropertyRateLabel(result.appliedRate.property, "property", result.appliedRate.propertyFairMarketRatio)}
                </td>
                <td className="py-1.5 text-right">{result.propertyTax.toLocaleString()}원</td>
              </tr>
              <tr className={result.comprehensiveTax === 0 ? "text-gray-400" : ""}>
                <td className="py-1.5">
                  {formatPropertyRateLabel(result.appliedRate.comprehensive, "comprehensive")}
                </td>
                <td className="py-1.5 text-right">{result.comprehensiveTax.toLocaleString()}원</td>
              </tr>
              {showCompPropertyCredit && (
                <tr>
                  <td className="py-1.5 text-gray-600">
                    └ 공제할 재산세액 (이중과세 방지)
                  </td>
                  <td className="py-1.5 text-right text-green-700">
                    -{result.comprehensivePropertyTaxCredit.toLocaleString()}원
                  </td>
                </tr>
              )}
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
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-blue-700">총 부담 (재산세 + 종부세 + 농특세)</div>
              <CopyButton
                label="보유세 결과 복사"
                text={`[2u부동산] 보유세 총 부담: ${result.grandTotal.toLocaleString()}원\n※ 참고용 추정치입니다. 정확한 세액은 세무사 상담을 권장합니다.`}
              />
            </div>
            <div className="text-2xl font-bold text-blue-900 mt-1">
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
