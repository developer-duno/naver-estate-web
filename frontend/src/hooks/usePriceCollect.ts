"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startPriceCollect, getPriceCollectStatus } from "@/lib/api";
import { PRICE_COLLECT_POLL_MS, MAX_PRICE_COLLECT_POLLS } from "@/lib/constants";

export interface PriceCollectHookResult {
  collecting: boolean;
  message: string;
  startCollect: (complexNo: string, token: string, onDone?: () => void) => void;
  clearPolling: () => void;
}

/**
 * 실거래가 수집 훅 — 실시간 폴링으로 수집 완료 즉시 감지
 *
 * POST /start-collect 호출 후:
 * - "fresh" → 즉시 완료 (24시간 내 수집됨)
 * - "started" → 3초 간격 폴링으로 완료 감지 → onDone 호출
 * - 409 → 이미 수집 중 → 폴링으로 완료 감지
 */
export function usePriceCollect(): PriceCollectHookResult {
  const [collecting, setCollecting] = useState(false);
  const [message, setMessage] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  const pollCountRef = useRef(0);

  const clearPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  /** 폴링 종료 + 상태 정리 (onDone은 호출부에서 별도 처리) */
  const finishPolling = useCallback(
    (msg: string = "") => {
      clearPolling();
      setCollecting(false);
      setMessage(msg);
    },
    [clearPolling],
  );

  // 언마운트 시 폴링 정리 (web-rules.md 준수)
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      clearPolling();
    };
  }, [clearPolling]);

  const startPolling = useCallback(
    (complexNo: string, onDone?: () => void) => {
      clearPolling();
      pollCountRef.current = 0;
      setMessage("수집 시작 중...");

      // 즉시 첫 폴링 실행 (done 놓침 방지)
      const poll = async () => {
        if (cancelledRef.current) return;
        pollCountRef.current += 1;

        // 최대 폴링 횟수 초과 → 타임아웃
        if (pollCountRef.current > MAX_PRICE_COLLECT_POLLS) {
          console.error("[PriceCollect] Timeout after", MAX_PRICE_COLLECT_POLLS, "polls:", complexNo);
          finishPolling("수집 시간 초과. 나중에 다시 시도해주세요");
          onDone?.();
          return;
        }

        try {
          const status = await getPriceCollectStatus(complexNo);
          if (cancelledRef.current) return;

          if (status.status === "done" || status.status === "idle") {
            finishPolling("");
            onDone?.();
          } else if (status.status === "error") {
            finishPolling("수집 오류: " + (status.error ?? "알 수 없는 오류"));
          } else if (status.status === "running") {
            // 진행률 표시 (0/0 방지)
            if (status.total && status.total > 0) {
              setMessage(`수집 중... ${status.collected ?? 0}/${status.total}건`);
            } else {
              setMessage("수집 준비 중...");
            }
          }
        } catch (err) {
          console.error("[PriceCollect] poll error:", err);
          // 네트워크 에러 → 폴링 계속 (다음 시도에서 복구 가능)
        }
      };

      // 즉시 첫 호출 + 이후 간격 폴링
      poll();
      pollRef.current = setInterval(poll, PRICE_COLLECT_POLL_MS);
    },
    [clearPolling, finishPolling],
  );

  const startCollect = useCallback(
    (complexNo: string, token: string, onDone?: () => void) => {
      if (pollRef.current) return; // 이미 진행 중

      cancelledRef.current = false;
      setCollecting(true);
      setMessage("수집 시작 중...");

      startPriceCollect(complexNo, token)
        .then((res) => {
          if (cancelledRef.current) return;
          if (res.status === "fresh") {
            setCollecting(false);
            setMessage("");
            onDone?.();
            return;
          }
          // "started" → 폴링 시작
          startPolling(complexNo, onDone);
        })
        .catch((err) => {
          if (cancelledRef.current) return;
          if (err?.statusCode === 409) {
            // 이미 수집 중 → 폴링으로 완료 감지
            startPolling(complexNo, onDone);
          } else if (err?.statusCode === 429) {
            setCollecting(false);
            setMessage("요청 한도 초과");
          } else {
            console.error("[PriceCollect] start error:", err);
            setCollecting(false);
            setMessage("");
          }
        });
    },
    [clearPolling, startPolling],
  );

  return { collecting, message, startCollect, clearPolling };
}
