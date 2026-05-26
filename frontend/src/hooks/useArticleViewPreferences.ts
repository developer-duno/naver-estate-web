"use client";

import { useCallback, useState } from "react";

import {
  getArticlePageSize,
  getArticleViewMode,
  setArticlePageSize,
  setArticleViewMode,
  type ArticlePageSize,
  type ArticleViewMode,
} from "@/lib/storage";

/**
 * 매물 보기 모드 + 한 페이지당 매물 개수 localStorage 2-way sync.
 *
 * 초기값은 lazy initializer 로 storage 1회 읽기 (SSR 안전 분기 포함).
 * setter 호출 시 state + storage 양쪽 갱신.
 */
export function useArticleViewPreferences(): {
  articleViewMode: ArticleViewMode;
  pageSize: ArticlePageSize;
  setPageSize: (s: ArticlePageSize) => void;
  handleViewModeChange: (m: ArticleViewMode) => void;
} {
  const [articleViewMode, setArticleViewModeState] = useState<ArticleViewMode>(() =>
    typeof window !== "undefined" ? getArticleViewMode() : "medium",
  );
  const [pageSize, setPageSizeState] = useState<ArticlePageSize>(() =>
    typeof window !== "undefined" ? getArticlePageSize() : 10,
  );

  const handleViewModeChange = useCallback((mode: ArticleViewMode) => {
    setArticleViewModeState(mode);
    setArticleViewMode(mode);
  }, []);

  const setPageSize = useCallback((size: ArticlePageSize) => {
    setPageSizeState(size);
    setArticlePageSize(size);
  }, []);

  return { articleViewMode, pageSize, setPageSize, handleViewModeChange };
}
