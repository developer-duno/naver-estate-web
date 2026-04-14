"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { startLiveCrawl } from "@/lib/api";
import type { CrawlProgress } from "@/types";

interface Props {
  getToken: () => Promise<string>;
}

export default function ForceRecrawlCard({ getToken }: Props) {
  const [no, setNo] = useState("");
  const mut = useMutation<CrawlProgress, Error, void>({
    mutationFn: async () => {
      const token = await getToken();
      return startLiveCrawl(no.trim(), token, true);
    },
  });
  const valid = /^\d{4,10}$/.test(no.trim());
  const disabled = !valid || mut.isPending;

  return (
    <div className="bg-white border rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-3">단지 강제 재크롤</h3>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={no}
          onChange={(e) => setNo(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="단지번호 (예: 109208)"
          className="flex-1 border rounded px-3 py-2 text-sm"
          aria-label="단지번호"
        />
        <button
          onClick={() => mut.mutate()}
          disabled={disabled}
          className="px-4 py-2 bg-red-600 text-white rounded text-sm disabled:opacity-50 hover:bg-red-700"
        >
          {mut.isPending ? "크롤 중..." : "강제 재크롤"}
        </button>
      </div>
      {mut.data && (
        <p className="mt-2 text-xs text-green-700">
          ✓ {mut.data.status}
          {mut.data.forced !== undefined && ` (forced: ${String(mut.data.forced)})`}
        </p>
      )}
      {mut.error && (
        <p className="mt-2 text-xs text-red-700">{mut.error.message}</p>
      )}
      <p className="mt-2 text-[11px] text-gray-500">
        TTL 캐시 및 실행 중 가드를 무시하고 즉시 재크롤합니다. 관리자 전용.
      </p>
    </div>
  );
}
