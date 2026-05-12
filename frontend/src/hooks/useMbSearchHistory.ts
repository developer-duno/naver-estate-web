"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getMbSearchHistory,
  addMbSearchHistory,
  removeMbSearchHistory,
  clearMbSearchHistory,
  type MbSearchHistoryItem,
} from "@/lib/storage";

/** 미분양 검색 히스토리 훅 — localStorage 기반, 최근 10개 (SSR 안전) */
export function useMbSearchHistory() {
  const [history, setHistory] = useState<MbSearchHistoryItem[]>([]);

  useEffect(() => {
    // localStorage 는 SSR 에서 접근 불가 — useEffect 내부에서 1회 로드 (hydration mismatch 방지)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistory(getMbSearchHistory());
  }, []);

  const add = useCallback((item: Omit<MbSearchHistoryItem, "timestamp">) => {
    addMbSearchHistory(item);
    setHistory(getMbSearchHistory());
  }, []);

  const remove = useCallback((timestamp: number) => {
    removeMbSearchHistory(timestamp);
    setHistory(getMbSearchHistory());
  }, []);

  const clear = useCallback(() => {
    clearMbSearchHistory();
    setHistory([]);
  }, []);

  return { history, add, remove, clear };
}
