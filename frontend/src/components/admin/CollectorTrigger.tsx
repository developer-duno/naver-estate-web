"use client";

/** 관리자 데이터 수집 트리거 — 4개 수집기를 수동으로 실행하는 버튼 그리드 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { triggerCollection, type CollectorName } from "@/lib/api";

interface CollectorTriggerProps {
  getToken: () => Promise<string>;
}

const COLLECTORS: { name: CollectorName; label: string; description: string }[] = [
  { name: "crime-stats", label: "범죄통계", description: "경찰청 범죄통계 API" },
  { name: "air-quality", label: "대기질", description: "에어코리아 대기질 측정" },
  { name: "emergency", label: "응급의료", description: "응급의료기관 정보" },
  { name: "childcare", label: "어린이집", description: "보육정보공개시스템" },
];

export default function CollectorTrigger({ getToken }: CollectorTriggerProps) {
  // 각 수집기별 결과 상태
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string }>>({});

  const mutation = useMutation<
    { status: string; collector: string },
    Error,
    CollectorName
  >({
    mutationFn: async (name) => {
      const t = await getToken();
      return triggerCollection(t, name);
    },
    onSuccess: (_data, name) => {
      setResults((prev) => ({ ...prev, [name]: { ok: true, message: "수집 완료" } }));
    },
    onError: (err, name) => {
      setResults((prev) => ({ ...prev, [name]: { ok: false, message: err.message } }));
    },
  });

  return (
    <div className="bg-white border rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-3">데이터 수집 트리거</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {COLLECTORS.map((c) => {
          const result = results[c.name];
          const isLoading = mutation.isPending && mutation.variables === c.name;
          return (
            <button
              key={c.name}
              onClick={() => {
                setResults((prev) => ({ ...prev, [c.name]: undefined as never }));
                mutation.mutate(c.name);
              }}
              disabled={mutation.isPending}
              className="flex flex-col items-start p-3 border rounded-lg hover:bg-gray-50
                         disabled:opacity-50 disabled:cursor-not-allowed text-left transition-colors"
            >
              <span className="text-sm font-medium">{c.label}</span>
              <span className="text-xs text-gray-500 mt-0.5">{c.description}</span>
              {isLoading && <span className="text-xs text-blue-600 mt-1">수집 중...</span>}
              {!isLoading && result?.ok && (
                <span className="text-xs text-green-600 mt-1">{result.message}</span>
              )}
              {!isLoading && result && !result.ok && (
                <span className="text-xs text-red-600 mt-1">{result.message}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
