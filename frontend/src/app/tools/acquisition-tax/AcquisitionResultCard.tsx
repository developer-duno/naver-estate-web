"use client";

import type { AcquisitionResult } from "@/lib/acquisition-tax";
import { fmt, pct } from "@/lib/acquisition-format";
import AcquisitionNotices from "./AcquisitionNotices";

interface Props {
  result: AcquisitionResult;
}

export default function AcquisitionResultCard({ result }: Props) {
  if (result.branch === "empty") {
    return (
      <section
        role="status"
        aria-live="polite"
        className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500"
      >
        매매가를 입력하면 결과가 표시됩니다.
      </section>
    );
  }

  const { baseTax, exemption, ruralTax, educationTax, total, effectiveRate, notes } = result;
  const baseTaxAfter = baseTax - exemption;

  return (
    <section role="status" aria-live="polite" className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6 space-y-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Row label="본세 (감면 후)" value={fmt(baseTaxAfter)} />
        <Row label="감면액" value={exemption > 0 ? `−${fmt(exemption)}` : "−"} />
        <Row label="농어촌특별세" value={fmt(ruralTax)} />
        <Row label="지방교육세" value={fmt(educationTax)} />
      </dl>

      <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 flex items-baseline justify-between flex-wrap gap-2">
        <span className="text-sm text-blue-900">합계</span>
        <span className="text-2xl font-bold text-blue-900">{fmt(total)}원</span>
        <span className="text-xs text-blue-700">실효 {pct(effectiveRate)}</span>
      </div>

      <AcquisitionNotices notes={notes} />
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm font-semibold text-gray-900">{value}</dd>
    </div>
  );
}
