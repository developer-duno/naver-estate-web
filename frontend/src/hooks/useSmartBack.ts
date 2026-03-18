"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

/** 같은 origin에서 왔으면 history.back(), 아니면 홈으로 이동 */
export function useSmartBack() {
  const router = useRouter();
  return useCallback(() => {
    try {
      const r = document.referrer;
      if (r && new URL(r).origin === window.location.origin) {
        window.history.back();
      } else {
        router.push("/");
      }
    } catch {
      router.push("/");
    }
  }, [router]);
}
