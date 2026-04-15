"use client";

import { useEffect } from "react";
import Link from "next/link";

/** /admin 세그먼트 전용 에러 바운더리 — 관리자 특화 메시지 + 대시보드 복귀 */
export default function AdminError(
  props: {
    error: Error & { digest?: string };
    unstable_retry?: () => void;
    reset?: () => void;
  },
) {
  const { error } = props;
  const retryFn = props.unstable_retry ?? props.reset;
  const isDev = process.env.NODE_ENV !== "production";

  useEffect(() => {
    console.error("[AdminError]", error);
  }, [error]);

  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <p className="text-6xl font-bold text-red-200 leading-none mb-4 select-none">
        ⚠
      </p>
      <h1 className="text-xl font-semibold text-gray-800 mb-2">
        관리자 페이지 오류
      </h1>
      <p className="text-sm text-gray-500 mb-2">
        서버 응답이 실패했거나 권한이 부족할 수 있어요. 로그인 상태와 권한을 확인해 주세요.
      </p>
      {isDev && error.digest && (
        <p className="text-[11px] text-gray-400 font-mono mt-2">
          digest: {error.digest}
        </p>
      )}
      {isDev && error.message && (
        <p className="text-[11px] text-red-400 font-mono mt-1 break-all">
          {error.message}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
        <Link
          href="/admin"
          className="inline-flex items-center px-5 py-2.5 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          관리자 대시보드로
        </Link>
        <Link
          href="/"
          className="inline-flex items-center px-5 py-2.5 rounded-md bg-white text-gray-700 border border-gray-300 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          홈으로
        </Link>
        {retryFn && (
          <button
            type="button"
            onClick={retryFn}
            className="inline-flex items-center px-5 py-2.5 rounded-md bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors"
          >
            다시 시도
          </button>
        )}
      </div>
    </div>
  );
}
