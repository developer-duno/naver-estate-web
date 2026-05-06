"use client";

import type { SpecialHousesRateApplyInput } from "@/lib/property-tax-types";

interface Props {
  isCorporation: boolean;
  specialHousesRateApply: SpecialHousesRateApplyInput;
  onRateApplyEntryChange: (key: keyof SpecialHousesRateApplyInput, count: number) => void;
}

// PDF #13 페이지 1·2 본문 박제 — 4종 카테고리 라벨 + 자격 요건 (UI 안내)
const RATE_APPLY_OPTIONS: Array<{
  key: keyof SpecialHousesRateApplyInput;
  label: string;
  qualification: string;
}> = [
  { key: "inheritedRA", label: "① 상속주택", qualification: "상속개시일 ≤5년 (5년 초과 시 지분율 ≤40% or 지분 공시가 ≤6억(수도권 밖 3억) 포함)" },
  { key: "unauthorizedLand", label: "② 무허가주택의 부속토지", qualification: "허가·신고 없는 무허가주택의 부속토지 (건축법 등 관계 법령 미준수)" },
  { key: "smallNewHouse", label: "③ 소형 신축주택", qualification: "2024.1.10~2025.12.31 취득 + 전용 ≤60㎡ + 6억 이하(수도권 밖 3억) + 같은 기간 준공 + 도시형 생활주택만(아파트 제외) + 양도자 사업주체/시공자 + 첫 매매계약 + 미입주" },
  { key: "postCompletionUnsoldRA", label: "④ 준공 후 미분양주택", qualification: "2024.1.10~2025.12.31 취득 + ≤85㎡ + 6억 이하 + 수도권 밖 + 양도자 사업주체/시공자 + 첫 매매계약 + 시·군·구청장 확인" },
];

const INPUT_CLASS =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed";

export default function RateApplyExclusionFields({ isCorporation, specialHousesRateApply, onRateApplyEntryChange }: Props) {
  // PDF #13 4종 세율 특례주택: 비법인 시만 활성 (PDF 본문 "납세의무자" = 거주자)
  // 개인은 주택 수·1세대1주택 자격 무관 — 다주택자 절세 도구 (3주택+ → BRACKETS_2 다운판정)
  const disabled = isCorporation;
  return (
    <fieldset disabled={disabled} className={disabled ? "opacity-50" : ""}>
      <legend className="text-sm font-medium text-gray-700">
        세율 적용 시 주택 수 산정 제외 4종 (PDF #13 — 3주택+ → 기본세율 다운판정)
      </legend>
      <p className="mt-1 mb-2 text-xs text-gray-500">
        {disabled
          ? "법인은 본 특례 신청 자격 없음 (PDF 본문 거주자 전제 — 자동 비활성화)"
          : "4종 중 본인 케이스만 채수 입력 (모르면 0채). 신청 시 세율 산정 주택 수에서 제외 → 3주택 이상이라도 제외 후 2주택 이하면 중과세율(BRACKETS_3) 대신 기본세율(BRACKETS_2) 적용. 매년 9.16~9.30 신청 (별지 제27호 서식). 자격 본인 책임. PDF #12 (1세대1주택 5종)와 양립 가능 (상속주택 양쪽 입력 가능)."}
      </p>
      <details className="rounded border border-gray-200 px-2 py-1.5 text-xs bg-white">
        <summary className="cursor-pointer text-gray-700">4종 자격 안내 펼치기 (PDF #13 본문)</summary>
        <ul className="mt-2 space-y-1 text-gray-600 list-disc pl-4">
          {RATE_APPLY_OPTIONS.map((opt) => (
            <li key={opt.key}><strong>{opt.label}</strong>: {opt.qualification}</li>
          ))}
        </ul>
      </details>
      <div className="mt-3 space-y-3">
        {RATE_APPLY_OPTIONS.map((opt) => {
          const count = specialHousesRateApply[opt.key]?.count ?? 0;
          return (
            <div key={opt.key} className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-center">
              <span className="text-sm text-gray-700">{opt.label}</span>
              <select
                aria-label={`${opt.label} 채수 (세율 산정 제외)`}
                value={count}
                onChange={(e) => onRateApplyEntryChange(opt.key, Number(e.target.value) || 0)}
                disabled={disabled}
                className={INPUT_CLASS}
              >
                {[0, 1, 2, 3].map((n) => (
                  <option key={n} value={n}>{n}채</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
