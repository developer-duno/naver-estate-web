"use client";

import { useState } from "react";
import { convertArea } from "@/lib/constants";
import CopyButton from "@/components/CopyButton";

const QUICK_M2 = [
  { label: "59㎡", value: "59" },
  { label: "84㎡", value: "84" },
  { label: "114㎡", value: "114" },
  { label: "135㎡", value: "135" },
];

const QUICK_PYEONG = [
  { label: "18평", value: "18" },
  { label: "25평", value: "25" },
  { label: "34평", value: "34" },
  { label: "41평", value: "41" },
];

export default function AreaConverter() {
  const [m2, setM2] = useState("");
  const [pyeong, setPyeong] = useState("");

  // m² 변경 → 평 자동 계산. convertArea 가 빈/NaN/음수는 그대로 반환
  const handleM2 = (v: string) => {
    setM2(v);
    setPyeong(convertArea(v, "m²", "평"));
  };

  const handlePyeong = (v: string) => {
    setPyeong(v);
    setM2(convertArea(v, "평", "m²"));
  };

  const reset = () => {
    setM2("");
    setPyeong("");
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <label htmlFor="area-m2" className="block text-sm font-medium text-gray-700 mb-2">
            제곱미터 (㎡)
          </label>
          <input
            id="area-m2"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={m2}
            onChange={(e) => handleM2(e.target.value)}
            placeholder="예: 84"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            aria-label="제곱미터 입력"
          />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {QUICK_M2.map((q) => (
              <button
                key={q.value}
                type="button"
                onClick={() => handleM2(q.value)}
                className="rounded-md border border-gray-300 bg-gray-50 px-2.5 py-1 text-xs text-gray-700 hover:bg-blue-50 hover:border-blue-300"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <label htmlFor="area-pyeong" className="block text-sm font-medium text-gray-700 mb-2">
            평
          </label>
          <input
            id="area-pyeong"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.1"
            value={pyeong}
            onChange={(e) => handlePyeong(e.target.value)}
            placeholder="예: 25.4"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            aria-label="평 입력"
          />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {QUICK_PYEONG.map((q) => (
              <button
                key={q.value}
                type="button"
                onClick={() => handlePyeong(q.value)}
                className="rounded-md border border-gray-300 bg-gray-50 px-2.5 py-1 text-xs text-gray-700 hover:bg-blue-50 hover:border-blue-300"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {(m2 || pyeong) && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-center">
          <p className="text-sm text-blue-900">
            <span className="font-semibold">{m2 || "-"}㎡</span>
            <span className="mx-2 text-blue-400">↔</span>
            <span className="font-semibold">{pyeong || "-"}평</span>
          </p>
          <p className="mt-1 text-xs text-blue-700">
            환산식: 1평 = 3.3058㎡ (m² → 평 ÷ 3.3058, 평 → m² × 3.3058)
          </p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <CopyButton
              label="환산 결과 복사"
              text={`[2u부동산] ${m2 || "-"}㎡ = ${pyeong || "-"}평\n※ 참고용 환산값입니다.`}
            />
            <button
              type="button"
              onClick={reset}
              className="rounded-md border border-blue-300 bg-white px-3 py-1 text-xs text-blue-700 hover:bg-blue-100"
            >
              초기화
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
