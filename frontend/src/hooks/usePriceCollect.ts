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
          let idleCount = 0; // 수집 완료 후 idle 전환 감지

          const poll = async () => {
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
                idleCount = 0;
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
              } else if (status.status === "idle") {
                idleCount++;
                // 수집 시작 후 idle이 2번 연속이면 → 이미 완료된 것
                if (idleCount >= 2) {
                  clearPolling();
                  setCollecting(false);
                  setMessage("수집 완료");
                  onDone?.();
                }
              }
            } catch {
              // 네트워크 오류 시 폴링 계속
            }
          };

          // 첫 폴링은 5초 후 (수집 시간 확보)
          setTimeout(poll, 5000);
          // 이후 3초 간격
          pollRef.current = setInterval(poll, CRAWL_STATUS_POLL_MS);
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
