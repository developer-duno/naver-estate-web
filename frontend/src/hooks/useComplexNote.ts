"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getComplexNote,
  setComplexNote as doSet,
  clearComplexNote as doClear,
  COMPLEX_NOTE_MAX_LEN,
} from "@/lib/storage";

/** 단지 메모 훅 — localStorage 기반, 단지당 500자 한도 + 1000개 한도 (storage 내부 가드) */
export function useComplexNote(complexNo: string) {
  const [note, setNote] = useState("");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!complexNo) return;
    setNote(getComplexNote(complexNo));
    // updated_at 은 저장 시점에만 갱신 (UI 표시용은 현재 미사용)
    setUpdatedAt(null);
  }, [complexNo]);

  const save = useCallback(
    (rawText: string) => {
      doSet(complexNo, rawText);
      const trimmed = rawText.trim().slice(0, COMPLEX_NOTE_MAX_LEN);
      setNote(trimmed);
      setUpdatedAt(trimmed.length > 0 ? Date.now() : null);
    },
    [complexNo],
  );

  const clear = useCallback(() => {
    doClear(complexNo);
    setNote("");
    setUpdatedAt(null);
  }, [complexNo]);

  return { note, updatedAt, save, clear, maxLen: COMPLEX_NOTE_MAX_LEN };
}
