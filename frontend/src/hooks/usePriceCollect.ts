"use client";

import { useCallback, useRef, useState } from "react";
import { startPriceCollect } from "@/lib/api";

export interface PriceCollectHookResult {
  collecting: boolean;
  message: string;
  startCollect: (complexNo: string, token: string, onDone?: () => void) => void;
  clearPolling: () => void;
}

/**
 * 실거래가 수집 훅 — 단순 fire-and-forget + 지연 리프레시
 *
 * POST /start-collect 호출 후:
 * - "fresh" → 즉시 완료 (24시간 내 수집됨)
 * - "started" → 30초 후 onDone 호출 (차트 리프레시)
 * - 409 → 30초 후 onDone 호출 (누군가 이미 수집 중)
 */
export function usePriceCollect(): PriceCollectHookResult {
  const [collecting, setCollecting] = useState(false);
  const [message, setMessage] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPolling = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startCollect = useCallback(
    (complexNo: string, token: string, onDone?: () => void) => {
      if (timerRef.current) return; // 이미 진행 중

      setCollecting(true);
      setMessage("수집 중...");

      startPriceCollect(complexNo, token)
        .then((res) => {
          if (res.status === "fresh") {
            // 24시간 내 수집된 데이터 있음 → 리프레시만
            setCollecting(false);
            setMessage("");
            onDone?.();
            return;
          }
          // "started" → 30초 후 차트 리프레시
          timerRef.current = setTimeout(() => {
            setCollecting(false);
            setMessage("");
            onDone?.();
          }, 30_000);
        })
        .catch((err) => {
          if (err?.statusCode === 409) {
            // 이미 수집 중 → 30초 후 리프레시
            timerRef.current = setTimeout(() => {
              setCollecting(false);
              setMessage("");
              onDone?.();
            }, 30_000);
          } else if (err?.statusCode === 429) {
            setCollecting(false);
            setMessage("요청 한도 초과");
          } else {
            setCollecting(false);
            setMessage("");
          }
        });
    },
    [clearPolling],
  );

  return { collecting, message, startCollect, clearPolling };
}
