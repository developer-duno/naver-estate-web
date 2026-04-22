"use client";

import { useState } from "react";
import { SkeletonRows } from "@/components/Skeleton";

/** 미분양 탭 공용 래퍼 — 로딩/에러/빈 데이터 처리 */
export function MbTabContent({
  loading,
  error,
  refetch,
  children,
  skeletonRows,
}: {
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  children: React.ReactNode;
  skeletonRows?: number;
}) {
  if (loading) return <SkeletonRows rows={skeletonRows ?? 8} />;
  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-3">데이터를 불러오지 못했습니다.</p>
        <button
          onClick={refetch}
          className="text-sm text-blue-600 hover:underline"
        >
          다시 시도
        </button>
      </div>
    );
  }
  return <>{children}</>;
}

/** 엑셀 다운로드 버튼 — 로딩·실패 피드백 포함 */
export function ExportButton({ disabled, onClick }: { disabled: boolean; onClick: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const handle = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await onClick();
    } catch {
      setFailed(true);
      setTimeout(() => setFailed(false), 3000);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={handle}
      className={`text-xs px-3 py-1 rounded border text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed ${
        failed ? "border-red-400 text-red-500" : "border-gray-300"
      }`}
    >
      {busy ? "다운로드 중..." : failed ? "실패" : "엑셀"}
    </button>
  );
}
