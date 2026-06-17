"use client";

import { useCallback, useState } from "react";

import { MAP_ENABLED } from "@/lib/constants";
import { getMbViewMode, setMbViewMode, type MbViewMode } from "@/lib/storage";

/**
 * 미분양 탭 보기 방식(목록/지도) localStorage 2-way sync.
 * useArticleViewPreferences 패턴 답습 — lazy initializer 로 storage 1회 읽기(SSR 안전),
 * setter 호출 시 state + storage 양쪽 갱신.
 *
 * 지도 SDK 미설정(MAP_ENABLED=false) 시 항상 "list" 강제 — localStorage 에 옛 "map" 이
 * 남아 있어도(키 있던 환경에서 저장 후 키 빠짐) 토글이 숨겨진 채 빈 지도 에러에 갇히지 않도록.
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

  // SDK 미설정 시 저장값 무관하게 목록 고정 (토글도 숨겨지므로 일관).
  return { viewMode: MAP_ENABLED ? viewMode : "list", setViewMode };
}
