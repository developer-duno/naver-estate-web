"use client";

/** 관리자 데이터 수집 트리거 — 5개 수집기를 수동으로 실행하는 버튼 그리드 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { triggerCollection, type CollectorName } from "@/lib/api";
import AdminCard from "./AdminCard";

interface CollectorTriggerProps {
  getToken: () => Promise<string>;
}

const COLLECTORS: { name: CollectorName; label: string; description: string }[] = [
  { name: "crime-stats", label: "범죄통계", description: "경찰청 범죄통계 API" },
  { name: "air-quality", label: "대기질", description: "에어코리아 대기질 측정" },
  { name: "emergency", label: "응급의료", description: "응급의료기관 정보" },
  { name: "childcare", label: "어린이집", description: "보육정보공개시스템" },
  { name: "backfill-price", label: "실거래가 소급", description: "이력 부족 상위 단지 자동 선정" },
];

export default function CollectorTrigger({ getToken }: CollectorTriggerProps) {
  // 각 수집기별 결과 상태
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string }>>({});

  const mutation = useMutation<
    { status: string; collector: string; quota_exhausted?: boolean; success?: number; failed?: number; total?: number },
    Error,
    CollectorName
  >({
    mutationFn: async (name) => {
      const t = await getToken();
      return triggerCollection(t, name);
    },
    onSuccess: (data, name) => {
      // 세션 362: backfill-price 는 국토부 API 쿼터가 이미 소진돼 있으면 0단지만
      // 처리하고 조기 종료한다 — 이때 "수집 완료"로만 보이면 관리자가 정상 처리로
      // 오해한다. quota_exhausted 가 true 면 별도 경고 메시지로 구분해 보여준다.
      const message = data.quota_exhausted
        ? `쿼터 소진으로 중단 (처리 ${data.success ?? 0}/${data.total ?? 0})`
        : "수집 완료";
      setResults((prev) => ({ ...prev, [name]: { ok: !data.quota_exhausted, message } }));
    },
    onError: (err, name) => {
      setResults((prev) => ({ ...prev, [name]: { ok: false, message: err.message } }));
    },
  });

  return (
    <AdminCard title="외부 데이터 지금 받아오기" help="대기질·응급의료·어린이집 같은 외부 데이터를 정해진 일정 외에 지금 한 번 더 받아오고 싶을 때 누르세요. 응답까지 최대 2분 정도 걸려요">
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
    </AdminCard>
  );
}
