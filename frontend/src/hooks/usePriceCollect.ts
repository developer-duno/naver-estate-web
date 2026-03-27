"use client";

import { useCallback, useRef, useState } from "react";
import { startPriceCollect, getPriceCollectStatus } from "@/lib/api";
import type { PriceCollectProgress } from "@/types";

const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_DURATION_MS = 120_000; // 2분

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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);

  const clearPolling = useCallback(() => {
    activeRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startCollect = useCallback(
    (complexNo: string, token: string, onDone?: () => void) => {
      if (activeRef.current) return;

      setCollecting(true);
      setMessage("수집 시작 중...");
      setProgress(null);
      activeRef.current = true;

      // 폴링 루프 — 수집 완료까지 3초 간격으로 상태 확인
      const startPolling = () => {
        const startTime = Date.now();

        const scheduleNextPoll = () => {
          timerRef.current = setTimeout(async () => {
            if (!activeRef.current) return;

            if (Date.now() - startTime > MAX_POLL_DURATION_MS) {
              activeRef.current = false;
              setCollecting(false);
              setMessage("수집 완료");
              onDone?.();
              return;
            }

            try {
              const status = await getPriceCollectStatus(complexNo);
              if (!activeRef.current) return;

              setProgress(status);

              if (status.status === "running") {
                const c = status.collected ?? 0;
                const t = status.total ?? 0;
                setMessage(t > 0 ? `수집 중... ${c}/${t}` : "수집 중...");
                scheduleNextPoll();
              } else if (status.status === "done") {
                activeRef.current = false;
                setCollecting(false);
                const f = status.failed ?? 0;
                setMessage(
                  f > 0
                    ? `수집 완료 (${status.collected}건, 실패 ${f}건)`
                    : `수집 완료 (${status.collected}건)`,
                );
                onDone?.();
              } else if (status.status === "error") {
                activeRef.current = false;
                setCollecting(false);
                setMessage("수집 중 오류가 발생했습니다.");
              } else {
                // idle = 이미 완료됨
                activeRef.current = false;
                setCollecting(false);
                setMessage("");
                onDone?.();
              }
            } catch {
              if (activeRef.current) scheduleNextPoll();
            }
          }, POLL_INTERVAL_MS);
        };

        scheduleNextPoll();
      };

      startPriceCollect(complexNo, token)
        .then((res) => {
          if (!activeRef.current) return;

          if (res.status === "fresh") {
            // 24시간 TTL 내 → 수집 불필요, 기존 데이터 사용
            activeRef.current = false;
            setCollecting(false);
            setMessage("");
            onDone?.();
            return;
          }

          // "started" → 폴링 시작
          startPolling();
        })
        .catch((err) => {
          if (!activeRef.current) return;

          if (err?.statusCode === 409) {
            // 이미 수집 중 → 폴링으로 결과 대기
            setMessage("수집 진행 중...");
            startPolling();
          } else {
            activeRef.current = false;
            setCollecting(false);
            if (err?.statusCode === 429) {
              setMessage("요청 한도 초과. 나중에 다시 시도해주세요.");
            } else {
              setMessage("");
            }
          }
        });
    },
    [clearPolling],
  );

  return { collecting, progress, message, startCollect, clearPolling };
}
