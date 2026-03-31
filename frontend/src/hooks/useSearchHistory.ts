"use client";

import { useState, useCallback } from "react";
import {
  getSearchHistory,
  addSearchHistory,
  removeSearchHistory,
  clearSearchHistory,
  type SearchHistoryItem,
} from "@/lib/storage";

/** 검색 히스토리 훅 — localStorage 기반, 최근 10개 */
export function useSearchHistory() {
  const [history, setHistory] = useState<SearchHistoryItem[]>(() => getSearchHistory());

  const add = useCallback((item: Omit<SearchHistoryItem, "timestamp">) => {
    addSearchHistory(item);
    setHistory(getSearchHistory());
  }, []);

  const remove = useCallback((timestamp: number) => {
    removeSearchHistory(timestamp);
    setHistory(getSearchHistory());
  }, []);

  const clear = useCallback(() => {
    clearSearchHistory();
    setHistory([]);
  }, []);

  return { history, add, remove, clear };
}
