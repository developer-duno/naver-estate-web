"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getMbCompareBookmarks,
  addMbCompareBookmark,
  removeMbCompareBookmark,
  clearMbCompareBookmarks,
  compareSetKey,
  type MbCompareBookmarkItem,
} from "@/lib/storage";

/** 미분양 비교 북마크 훅 — localStorage 기반, 최대 20개, 수동 저장 (SSR 안전) */
export function useMbCompareBookmarks() {
  const [bookmarks, setBookmarks] = useState<MbCompareBookmarkItem[]>([]);

  useEffect(() => {
    // localStorage 는 SSR 에서 접근 불가 — useEffect 내부에서 1회 로드 (hydration mismatch 방지)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBookmarks(getMbCompareBookmarks());
  }, []);

  const add = useCallback((item: Omit<MbCompareBookmarkItem, "saved_at">) => {
    addMbCompareBookmark(item);
    setBookmarks(getMbCompareBookmarks());
  }, []);

  const remove = useCallback((saved_at: number) => {
    removeMbCompareBookmark(saved_at);
    setBookmarks(getMbCompareBookmarks());
  }, []);

  const clear = useCallback(() => {
    clearMbCompareBookmarks();
    setBookmarks([]);
  }, []);

  const isBookmarked = useCallback(
    (ids: string[]) => {
      const key = compareSetKey(ids);
      return bookmarks.some((b) => compareSetKey(b.ids) === key);
    },
    [bookmarks],
  );

  return { bookmarks, add, remove, clear, isBookmarked };
}
