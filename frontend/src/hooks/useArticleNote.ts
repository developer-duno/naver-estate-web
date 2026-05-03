"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getArticleNote,
  setArticleNote as doSet,
  clearArticleNote as doClear,
  ARTICLE_NOTE_MAX_LEN,
} from "@/lib/storage";

/** 매물 메모 훅 — localStorage 기반, 매물당 500자 한도 + 1000개 한도 (storage 내부 가드) */
export function useArticleNote(articleNo: string) {
  const [note, setNote] = useState("");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!articleNo) return;
    setNote(getArticleNote(articleNo));
    setUpdatedAt(null);
  }, [articleNo]);

  const save = useCallback(
    (rawText: string) => {
      doSet(articleNo, rawText);
      const trimmed = rawText.trim().slice(0, ARTICLE_NOTE_MAX_LEN);
      setNote(trimmed);
      setUpdatedAt(trimmed.length > 0 ? Date.now() : null);
    },
    [articleNo],
  );

  const clear = useCallback(() => {
    doClear(articleNo);
    setNote("");
    setUpdatedAt(null);
  }, [articleNo]);

  return { note, updatedAt, save, clear, maxLen: ARTICLE_NOTE_MAX_LEN };
}
