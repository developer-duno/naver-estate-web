"use client";

import { useEffect } from "react";
import ErrorActions from "@/components/ErrorActions";

/**
 * Next.js 16 루트 에러 바운더리.
 *
 * Next 16 은 prop 이름이 `reset` → `unstable_retry` 로 바뀌었다 (여전히 unstable).
 * 향후 리네임 / Next 15 다운그레이드 모두 대비해 props 를 유연하게 받는다.
 */
export default function GlobalError(
  props: {
    error: Error & { digest?: string };
    unstable_retry?: () => void;
    reset?: () => void;
  },
) {
  const { error } = props;
  // Next 16 공식 시그너처는 unstable_retry, Next 15 는 reset — 둘 중 하나가 살아 있다
  const retryFn = props.unstable_retry ?? props.reset;
  const isDev = process.env.NODE_ENV !== "production";

  useEffect(() => {
    // 공식 예시 패턴 — 추후 Sentry 등 에러 리포터로 교체 가능
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center">
      <p className="text-7xl font-bold text-red-200 leading-none mb-4 select-none">
        500
      </p>
      <h1 className="text-xl font-semibold text-gray-800 mb-2">
        문제가 발생했습니다
      </h1>
      <p className="text-sm text-gray-500 mb-2">
        일시적인 오류일 수 있어요. 다시 시도하거나 홈으로 이동해 주세요.
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
      <ErrorActions type="error" onRetry={retryFn} />
    </div>
  );
}
