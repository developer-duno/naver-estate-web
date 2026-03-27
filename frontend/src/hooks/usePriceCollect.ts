"use client";

import { useCallback, useRef, useState } from "react";
import { startPriceCollect, getPriceCollectStatus } from "@/lib/api";
import type { PriceCollectProgress } from "@/types";
import { CRAWL_STATUS_POLL_MS } from "@/lib/constants";

const MAX_POLL_DURATION_MS = 600_000; // 10분

export interface PriceCollectHookResult {
  collecting: boolean;
  progress: PriceCollectProgress | null;
  message: string;
  startCollect: (complexNo: string, token: string, onDone?: () => void) => void;
  clearPolling: () => void;
}

export function usePriceCollect(): PriceCollectHookResult {
  const [collecting, setCollecting] = useState(false);
  const [progress, setProgress] = useState<PriceCollectProgress | null>(null);
  const [message, setMessage] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(0);

  const clearPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startCollect = useCallback(
    (complexNo: string, token: string, onDone?: () => void) => {
      setCollecting(true);
      setMessage("수집 시작 중...");
      setProgress(null);

      startPriceCollect(complexNo, token)
        .then(() => {
          startedRef.current = Date.now();
          // 폴링 시작
          pollRef.current = setInterval(async () => {
            // 10분 타임아웃
            if (Date.now() - startedRef.current > MAX_POLL_DURATION_MS) {
              clearPolling();
              setCollecting(false);
              setMessage("시간이 초과되었습니다. 나중에 다시 시도해주세요.");
              return;
            }
            try {
              const status = await getPriceCollectStatus(complexNo);
              setProgress(status);
              if (status.status === "running") {
                const c = status.collected ?? 0;
                const t = status.total ?? 0;
                setMessage(t > 0 ? `수집 중... ${c}/${t} 완료` : "수집 중...");
              } else if (status.status === "done") {
                clearPolling();
                setCollecting(false);
                const f = status.failed ?? 0;
                setMessage(
                  f > 0
                    ? `수집 완료 (${status.collected}건, 실패 ${f}건)`
                    : `수집 완료 (${status.collected}건)`,
                );
                onDone?.();
              } else if (status.status === "error") {
                clearPolling();
                setCollecting(false);
                setMessage("수집 중 오류가 발생했습니다. 재시도해주세요.");
              }
            } catch {
              // 네트워크 오류 시 폴링 계속 (일시적 오류일 수 있음)
            }
          }, CRAWL_STATUS_POLL_MS);
        })
        .catch((err) => {
          setCollecting(false);
          if (err?.statusCode === 409) {
            setMessage("이미 수집 중입니다.");
          } else if (err?.statusCode === 429) {
            setMessage("요청 한도를 초과했습니다. 나중에 다시 시도해주세요.");
          } else {
            setMessage("수집 시작에 실패했습니다.");
          }
        });
    },
    [clearPolling],
  );

  return { collecting, progress, message, startCollect, clearPolling };
}
