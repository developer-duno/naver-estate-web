"use client";

import type { AcquisitionResult } from "@/lib/acquisition-tax";
import { fmt, pct } from "@/lib/acquisition-format";

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

      {/* Phase B-2 임시: inline 텍스트 5종 박제. Phase B-3에서 <AcquisitionNotices notes={notes} /> 한 줄로 교체 */}
      <div className="space-y-2">
        {notes.includes("disclaimer") && (
          <p className="text-xs text-gray-700">
            취득세 과세표준 = 실거래가 (지방세법 제10조의3). 정확한 세액은 시·군·구청 또는 세무사 상담 권장.
          </p>
        )}
        {notes.includes("multi-house-rural") && (
          <p className="text-xs text-gray-700">
            다주택 농특세는 8% 시 0.6%, 12% 시 1.0%로 표준 시(0.2%)보다 높습니다 (면적 무관).
          </p>
        )}
        {notes.includes("first-time-base-only") && (
          <p className="text-xs text-gray-700">
            200만원 감면은 취득세 본세에만 적용. 농특세·교육세는 표준세율 그대로 부과됩니다.
          </p>
        )}
        {notes.includes("area-85-exempt") && (
          <p className="text-xs text-gray-700">
            전용 85m² 이하 1주택은 농특세 비과세. 다주택 중과 시는 면적 무관 부과.
          </p>
        )}
        {notes.includes("first-time-rejected") && (
          <p className="text-xs text-amber-700">
            12억 초과 매물은 생애최초 감면 대상이 아닙니다. 표준세율로 계산했습니다.
          </p>
        )}
      </div>
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
