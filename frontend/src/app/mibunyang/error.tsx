"use client";

import { useEffect } from "react";
import ErrorActions from "@/components/ErrorActions";

/** /mibunyang 세그먼트 전용 에러 바운더리 — Next 16 unstable_retry 시그너처 */
export default function MibunyangError(
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
    console.error("[MibunyangError]", error);
  }, [error]);

  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center">
      <p className="text-7xl font-bold text-amber-200 leading-none mb-4 select-none">
        !
      </p>
      <h1 className="text-xl font-semibold text-gray-800 mb-2">
        미분양 데이터를 불러오는 중 오류가 발생했습니다
      </h1>
      <p className="text-sm text-gray-500 mb-2">
        잠시 후 다시 시도해 주세요. 문제가 계속되면 관리자에게 문의해 주세요.
      </p>
      {isDev && error.digest && (
        <p className="text-[11px] text-gray-400 font-mono mt-2">
          digest: {error.digest}
        </p>
      )}
      <ErrorActions type="error" onRetry={retryFn} />
    </div>
  );
}
