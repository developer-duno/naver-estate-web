"use client";

import { useCallback, useState } from "react";

import { getMbViewMode, setMbViewMode, type MbViewMode } from "@/lib/storage";

/**
 * 미분양 탭 보기 방식(목록/지도) localStorage 2-way sync.
 * useArticleViewPreferences 패턴 답습 — lazy initializer 로 storage 1회 읽기(SSR 안전),
 * setter 호출 시 state + storage 양쪽 갱신.
 */
export function useMbViewMode(): {
  viewMode: MbViewMode;
  setViewMode: (m: MbViewMode) => void;
} {
  const [viewMode, setViewModeState] = useState<MbViewMode>(() =>
    typeof window !== "undefined" ? getMbViewMode() : "list",
  );

  const setViewMode = useCallback((mode: MbViewMode) => {
    setViewModeState(mode);
    setMbViewMode(mode);
  }, []);

  return { viewMode, setViewMode };
}
