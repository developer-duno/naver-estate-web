"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTokenReady } from "@/hooks/useAdminQuery";
import { queryKeys } from "@/lib/query-keys";
import StatsCards from "@/components/admin/StatsCards";
import { getAdminDetailedStats, deleteStaleData } from "@/lib/api";
import type { DetailedStats } from "@/types/admin";

export default function AdminDataPage() {
  const [staleDays, setStaleDays] = useState(90);
  const [deleteResult, setDeleteResult] = useState("");

  const { token, getToken } = useTokenReady();
  const queryClient = useQueryClient();

  const statsQuery = useQuery<DetailedStats, Error>({
    queryKey: queryKeys.admin.stats(),
    queryFn: () => getAdminDetailedStats(token),
    enabled: !!token,
    staleTime: 0,
  });

  const deleteMutation = useMutation<{ deleted: number }, Error, number>({
    mutationFn: async (days) => {
      const t = await getToken();
      return deleteStaleData(t, days);
    },
    onSuccess: (data) => {
      setDeleteResult(`${data.deleted}건 삭제 완료`);
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.stats() });
    },
  });

  const error = statsQuery.error?.message ?? deleteMutation.error?.message ?? "";

  const handleDeleteStale = () => {
    if (!confirm(`${staleDays}일 이상 된 비활성 매물 데이터를 삭제하시겠습니까?`)) return;
    setDeleteResult("");
    deleteMutation.mutate(staleDays);
  };

  return (
    <>
      <h2 className="text-lg font-semibold mb-4">데이터 관리</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">{error}</div>
      )}

      <StatsCards stats={statsQuery.data ?? null} loading={statsQuery.isLoading} />

      {/* 데이터 정리 */}
      <div className="bg-white border rounded-lg p-4 mt-6">
        <h3 className="text-sm font-medium text-gray-700 mb-3">오래된 데이터 정리</h3>
        <p className="text-xs text-gray-500 mb-3">
          비활성 상태(is_active=false)이며 지정 일수 이상 경과된 매물을 삭제합니다.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            value={staleDays}
            onChange={(e) => setStaleDays(Number(e.target.value))}
            min={30}
            className="w-20 text-sm border rounded px-2 py-1"
          />
          <span className="text-sm text-gray-500">일 이상</span>
          <button
            onClick={handleDeleteStale}
            disabled={deleteMutation.isPending}
            className="text-sm px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
          >
            {deleteMutation.isPending ? "삭제 중..." : "삭제"}
          </button>
        </div>
        {deleteResult && (
          <p className="text-sm text-green-600 mt-2">{deleteResult}</p>
        )}
      </div>
    </>
  );
}
