"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getSearchHistory,
  addSearchHistory,
  removeSearchHistory,
  clearSearchHistory,
  type SearchHistoryItem,
} from "@/lib/storage";

/** 검색 히스토리 훅 — localStorage 기반, 최근 10개 (SSR 안전) */
export function useSearchHistory() {
  // SSR 시 빈 배열로 시작 → useEffect에서 localStorage 로드 (hydration mismatch 방지)
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);

  useEffect(() => {
    // localStorage 는 SSR 에서 접근 불가 — useEffect 내부에서 1회 로드 (hydration mismatch 방지)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistory(getSearchHistory());
  }, []);

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
