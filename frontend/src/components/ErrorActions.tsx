"use client";

import Link from "next/link";
import { useSmartBack } from "@/hooks/useSmartBack";

interface Props {
  /** "notfound" = 404 페이지용, "error" = 500 페이지용 */
  type: "notfound" | "error";
  /** error variant 에서 "다시 시도" 버튼이 호출할 콜백 (Next 16 unstable_retry 또는 reset) */
  onRetry?: () => void;
}

/**
 * 에러/404 페이지에서 공통으로 쓰는 액션 버튼 그룹.
 * - 홈으로 (primary)
 * - 검색 (secondary)
 * - 이전 페이지 (ghost) — useSmartBack 훅으로 same-origin 체크
 * - (error variant만) 다시 시도 — onRetry 콜백 호출
 */
export default function ErrorActions({ type, onRetry }: Props) {
  const smartBack = useSmartBack();

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
      <Link
        href="/"
        className="inline-flex items-center px-5 py-2.5 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
      >
        홈으로
      </Link>
      <Link
        href="/search"
        className="inline-flex items-center px-5 py-2.5 rounded-md bg-white text-blue-700 border border-blue-600 text-sm font-medium hover:bg-blue-50 transition-colors"
      >
        검색
      </Link>
      <button
        type="button"
        onClick={smartBack}
        className="inline-flex items-center px-5 py-2.5 rounded-md bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors"
      >
        이전 페이지
      </button>
      {type === "error" && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center px-5 py-2.5 rounded-md bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors"
        >
          다시 시도
        </button>
      )}
    </div>
  );
}
