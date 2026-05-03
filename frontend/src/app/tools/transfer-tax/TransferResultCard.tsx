"use client";

import type { TransferResult } from "@/lib/transfer-tax";
import TransferNotices from "./TransferNotices";

interface Props {
  result: TransferResult;
}

// R11: 본세 라벨에 사유 prefix (미등기/단기/중과 구분, 누진 일반은 R12 fix 후 정확 rate)
function formatBaseTaxLabel(result: TransferResult): string {
  const ratePct = (result.appliedRate * 100).toFixed(1).replace(/\.0$/, "");
  if (result.branch === "unregistered") return `본세 (미등기 ${ratePct}%)`;
  if (result.notes.includes("short-term-70") || result.notes.includes("short-term-60")) {
    return `본세 (단기 ${ratePct}%)`;
  }
  if (result.notes.includes("multi-heavy-applied")) return `본세 (중과 ${ratePct}%)`;
  return `본세 (${ratePct}%)`;
}

const BRANCH_TEXT: Record<TransferResult["branch"], { color: string; label: string }> = {
  "empty": { color: "gray", label: "입력값이 부족합니다 (양도가액·취득가액 필요)" },
  "loss": { color: "gray", label: "양도차손 발생, 산출세액 0원" },
  "unregistered": { color: "red", label: "미등기 양도 — 70% 단일세율 적용" },
  "single-house-exempt": { color: "green", label: "1세대1주택 비과세 충족, 산출세액 0원" },
  "single-house-prorate": { color: "purple", label: "12억 초과 안분 + 표2 장특공" },
  "general": { color: "blue", label: "일반 양도소득세 (표1 장특공 + 누진세율)" },
};

const APPLIED_TABLE_LABEL: Record<TransferResult["appliedTable"], string> = {
  "table1": "표1 (일반)", "table2": "표2 (1세대1주택)", "none": "장특공 미적용",
};

const COLOR_CLASS: Record<string, string> = {
  gray: "bg-gray-50 border-gray-200 text-gray-900",
  red: "bg-red-50 border-red-200 text-red-900",
  green: "bg-green-50 border-green-200 text-green-900",
  purple: "bg-purple-50 border-purple-200 text-purple-900",
  blue: "bg-blue-50 border-blue-200 text-blue-900",
};

export default function TransferResultCard({ result }: Props) {
  const branchInfo = BRANCH_TEXT[result.branch];
  const empty = result.branch === "empty";
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6 space-y-3" aria-live="polite">
      <div className={`rounded-md border px-3 py-2 text-sm ${COLOR_CLASS[branchInfo.color]}`}>
        <strong>분기:</strong> {branchInfo.label}
      </div>
      {!empty && (
        <>
          <table className="w-full text-sm">
            <tbody>
              <tr><td className="py-1.5 text-gray-600">양도차익</td><td className="py-1.5 text-right">{result.gain.toLocaleString()}원</td></tr>
              <tr><td className="py-1.5 text-gray-600">장기보유공제 ({APPLIED_TABLE_LABEL[result.appliedTable]})</td><td className="py-1.5 text-right">{result.longTermDeduction.toLocaleString()}원</td></tr>
              <tr><td className="py-1.5 text-gray-600">과세표준</td><td className="py-1.5 text-right">{result.taxBase.toLocaleString()}원</td></tr>
              <tr><td className="py-1.5 text-gray-600">{formatBaseTaxLabel(result)}</td><td className="py-1.5 text-right">{result.baseTax.toLocaleString()}원</td></tr>
            </tbody>
          </table>
          <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-3 text-center">
            <div className="text-xs text-blue-700 mb-1">산출세액 (지방소득세 별도 약 10%)</div>
            <div className="text-2xl font-bold text-blue-900">{result.totalTax.toLocaleString()}원</div>
          </div>
          <TransferNotices notes={result.notes} />
        </>
      )}
    </section>
  );
}
