"use client";

import { useCallback, useRef, useState } from "react";
import { startPriceCollect, getPriceCollectStatus } from "@/lib/api";
import type { PriceCollectProgress } from "@/types";

const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_DURATION_MS = 120_000; // 2분 (수집은 보통 30초 이내)

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
  const activeRef = useRef(false); // 폴링 활성 여부 (중복 방지)

  const clearPolling = useCallback(() => {
    activeRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startCollect = useCallback(
    (complexNo: string, token: string, onDone?: () => void) => {
      if (activeRef.current) return; // 이미 수집 중이면 무시

      setCollecting(true);
      setMessage("수집 시작 중...");
      setProgress(null);
      activeRef.current = true;

      startPriceCollect(complexNo, token)
        .then((res) => {
          if (!activeRef.current) return;

          // 24시간 TTL 내 → 수집 스킵
          if (res.status === "fresh") {
            activeRef.current = false;
            setCollecting(false);
            setMessage("");
            onDone?.();
            return;
          }

          const startTime = Date.now();

          // setTimeout 체인으로 순차 폴링 (setInterval 대신 — 동시 실행 방지)
          const scheduleNextPoll = () => {
            timerRef.current = setTimeout(async () => {
              if (!activeRef.current) return;

              // 타임아웃 체크
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
                  setMessage("수집 중 오류가 발생했습니다. 재시도해주세요.");
                } else {
                  // idle = 이미 완료되어 정리됨
                  activeRef.current = false;
                  setCollecting(false);
                  setMessage("수집 완료");
                  onDone?.();
                }
              } catch {
                if (activeRef.current) scheduleNextPoll();
              }
            }, POLL_INTERVAL_MS);
          };

          // 첫 폴링은 3초 후
          scheduleNextPoll();
        })
        .catch((err) => {
          activeRef.current = false;
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
