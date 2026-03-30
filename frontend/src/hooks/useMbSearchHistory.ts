"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getMbSearchHistory,
  addMbSearchHistory,
  removeMbSearchHistory,
  clearMbSearchHistory,
  type MbSearchHistoryItem,
} from "@/lib/storage";

/** 미분양 검색 히스토리 훅 — localStorage 기반, 최근 10개 */
export function useMbSearchHistory() {
  const [history, setHistory] = useState<MbSearchHistoryItem[]>([]);

  useEffect(() => {
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
