"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { triggerSingleRecrawl, type SingleRecrawlResponse } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

interface Props {
  getToken: () => Promise<string>;
}

// complex_no 형식: 숫자 1~20자리 (backend 규칙과 일치)
const COMPLEX_NO_RE = /^\d{1,20}$/;

/**
 * 특정 단지 1개를 즉시 강제 재크롤하는 카드.
 * 1시간 내 같은 단지 재크롤 이력 있으면 force 체크박스로 우회.
 */
export default function SingleRecrawlCard({ getToken }: Props) {
  const [complexNo, setComplexNo] = useState("");
  const [force, setForce] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const qc = useQueryClient();

  const runMut = useMutation<SingleRecrawlResponse, Error, void>({
    mutationFn: async () => {
      const token = await getToken();
      return triggerSingleRecrawl(token, complexNo.trim(), force);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.admin.crawlJobs() });
    },
  });

  const handleTrigger = () => {
    const value = complexNo.trim();
    if (!value) {
      setClientError("complex_no를 입력하세요");
      return;
    }
    if (!COMPLEX_NO_RE.test(value)) {
      setClientError("숫자 1~20자리만 허용됩니다");
      return;
    }
    setClientError(null);
    runMut.mutate();
  };

  const disabled = runMut.isPending || complexNo.trim() === "";
  const displayError = clientError ?? runMut.error?.message;

  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700">단건 강제 재크롤</h3>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-2">
        <input
          type="text"
          inputMode="numeric"
          pattern="\d*"
          placeholder="단지번호 (예: 12345)"
          value={complexNo}
          onChange={(e) => {
            setComplexNo(e.target.value);
            if (clientError) setClientError(null);
          }}
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          maxLength={20}
        />
        <button
          onClick={handleTrigger}
          disabled={disabled}
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm disabled:opacity-50 hover:bg-blue-700"
        >
          {runMut.isPending ? "시작 중..." : "지금 재크롤"}
        </button>
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input
          type="checkbox"
          checked={force}
          onChange={(e) => setForce(e.target.checked)}
        />
        1시간 내 중복 이력이 있어도 강제 실행 (force)
      </label>

      {displayError && (
        <p className="mt-2 text-xs text-red-700">{displayError}</p>
      )}

      {runMut.data && !runMut.error && (
        <p className="mt-2 text-xs text-green-700">
          ✓ {runMut.data.complex_name} ({runMut.data.complex_no}) 재크롤 시작됨
        </p>
      )}

      <p className="mt-2 text-[11px] text-gray-500">
        CrawlJobTable의 target_id 셀에서 단지번호를 복사해 붙여넣을 수 있습니다.
      </p>
    </div>
  );
}
