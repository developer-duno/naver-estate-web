"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { startPriceCollect, getPriceCollectStatus } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { PRICE_COLLECT_POLL_MS, MAX_PRICE_COLLECT_POLLS } from "@/lib/constants";

export type PriceCollectMessageType = "info" | "success" | "error" | "";

export interface PriceCollectHookResult {
  collecting: boolean;
  message: string;
  messageType: PriceCollectMessageType;
  startCollect: (complexNo: string, token: string, onDone?: () => void) => void;
  clearPolling: () => void;
}

/**
 * 실거래가 수집 훅 — React Query 기반 폴링
 *
 * POST /start-collect 호출 후:
 * - "fresh" → 즉시 완료 (24시간 내 수집됨)
 * - "started" → useQuery refetchInterval로 폴링 → 완료 시 onDone 호출
 * - 409 → 이미 수집 중 → 폴링으로 완료 감지
 */
export function usePriceCollect(): PriceCollectHookResult {
  const queryClient = useQueryClient();
  const [collecting, setCollecting] = useState(false);
  const [message, setMessageRaw] = useState("");
  const [messageType, setMessageType] = useState<PriceCollectMessageType>("");
  const setMessage = useCallback((msg: string, type: PriceCollectMessageType = "") => {
    setMessageRaw(msg);
    setMessageType(type);
  }, []);
  const [isPolling, setIsPolling] = useState(false);
  const [targetComplexNo, setTargetComplexNo] = useState<string>("");
  const pollCountRef = useRef(0);
  const onDoneRef = useRef<(() => void) | undefined>(undefined);

  const clearPolling = useCallback(() => {
    setIsPolling(false);
    setTargetComplexNo("");
    pollCountRef.current = 0;
  }, []);

  /** 폴링 종료 + 상태 정리 */
  const finishPolling = useCallback(
    (msg: string = "", type: PriceCollectMessageType = "") => {
      clearPolling();
      setCollecting(false);
      setMessage(msg, type);
    },
    [clearPolling, setMessage],
  );

  // useQuery로 수집 상태 폴링
  const statusQuery = useQuery({
    queryKey: queryKeys.priceCollectStatus(targetComplexNo),
    queryFn: async () => {
      pollCountRef.current += 1;

      // 최대 폴링 횟수 초과 → 타임아웃
      if (pollCountRef.current > MAX_PRICE_COLLECT_POLLS) {
        console.error("[PriceCollect] Timeout after", MAX_PRICE_COLLECT_POLLS, "polls:", targetComplexNo);
        throw new Error("timeout");
      }

      return getPriceCollectStatus(targetComplexNo);
    },
    enabled: isPolling && !!targetComplexNo,
    refetchInterval: isPolling ? PRICE_COLLECT_POLL_MS : false,
    retry: 0, // 폴링은 refetchInterval이 재시도 역할 — retry 시 pollCount 중복 증가 방지
  });

  // 폴링 결과에 따른 상태 전환 (useEffect로 처리 — 렌더 중 setState 방지)
  useEffect(() => {
    if (!isPolling || !statusQuery.data) return;

    const status = statusQuery.data;

    if (status.status === "done" || status.status === "idle") {
      finishPolling(""); // eslint-disable-line react-hooks/set-state-in-effect -- 쿼리 응답 동기화
      queryClient.invalidateQueries({ queryKey: queryKeys.priceHistoryAll(targetComplexNo) });
      onDoneRef.current?.();
      onDoneRef.current = undefined;
    } else if (status.status === "error") {
      finishPolling("수집 오류: " + (status.error ?? "알 수 없는 오류"), "error");
    } else if (status.status === "running") {
      if (status.total && status.total > 0) {
        setMessage(`수집 중... ${status.collected ?? 0}/${status.total}건`, "info");
      } else {
        setMessage("수집 준비 중...", "info");
      }
    }
  }, [statusQuery.data, isPolling, targetComplexNo, finishPolling, queryClient, setMessage]);

  // 타임아웃 에러 처리
  useEffect(() => {
    if (!statusQuery.error) return;
    if ((statusQuery.error as Error).message === "timeout") {
      finishPolling("수집 시간 초과. 나중에 다시 시도해주세요", "error"); // eslint-disable-line react-hooks/set-state-in-effect -- 타임아웃 에러 처리
      onDoneRef.current?.();
      onDoneRef.current = undefined;
    }
  }, [statusQuery.error, finishPolling]);

  // useMutation으로 수집 시작
  const startMutation = useMutation({
    mutationFn: ({ complexNo, token }: { complexNo: string; token: string }) =>
      startPriceCollect(complexNo, token),
    onSuccess: (res, { complexNo }) => {
      if (res.status === "fresh") {
        setCollecting(false);
        setMessage("");
        queryClient.invalidateQueries({ queryKey: queryKeys.priceHistoryAll(complexNo) });
        onDoneRef.current?.();
        onDoneRef.current = undefined;
        return;
      }
      // "started" → 폴링 시작
      setTargetComplexNo(complexNo);
      pollCountRef.current = 0;
      setMessage("수집 시작 중...", "info");
      setIsPolling(true);
    },
    onError: (err: unknown, { complexNo }) => {
      const apiErr = err as { statusCode?: number };
      if (apiErr?.statusCode === 409) {
        // 이미 수집 중 → 폴링으로 완료 감지
        setTargetComplexNo(complexNo);
        pollCountRef.current = 0;
        setMessage("수집 시작 중...", "info");
        setIsPolling(true);
      } else if (apiErr?.statusCode === 429) {
        setCollecting(false);
        setMessage("요청 한도 초과", "error");
      } else {
        console.error("[PriceCollect] start error:", err);
        setCollecting(false);
        setMessage("");
      }
    },
  });

  const startCollect = useCallback(
    (complexNo: string, token: string, onDone?: () => void) => {
      if (isPolling) return; // 이미 진행 중

      onDoneRef.current = onDone;
      setCollecting(true);
      setMessage("수집 시작 중...", "info");
      startMutation.mutate({ complexNo, token });
    },
    [isPolling, startMutation, setMessage],
  );

  return { collecting, message, messageType, startCollect, clearPolling };
}
