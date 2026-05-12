"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getMbCompareHistory,
  addMbCompareHistory,
  removeMbCompareHistory,
  clearMbCompareHistory,
  type MbCompareHistoryItem,
} from "@/lib/storage";

/** 미분양 비교 히스토리 훅 — localStorage 기반, 최근 10개, 자동 중복 제거 (SSR 안전) */
export function useMbCompareHistory() {
  const [history, setHistory] = useState<MbCompareHistoryItem[]>([]);

  useEffect(() => {
    // localStorage 는 SSR 에서 접근 불가 — useEffect 내부에서 1회 로드 (hydration mismatch 방지)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistory(getMbCompareHistory());
  }, []);

  const add = useCallback((item: Omit<MbCompareHistoryItem, "timestamp">) => {
    addMbCompareHistory(item);
    setHistory(getMbCompareHistory());
  }, []);

  const remove = useCallback((timestamp: number) => {
    removeMbCompareHistory(timestamp);
    setHistory(getMbCompareHistory());
  }, []);

  const clear = useCallback(() => {
    clearMbCompareHistory();
    setHistory([]);
  }, []);

  return { history, add, remove, clear };
}
