"use client";

import { useState, useEffect, useCallback } from "react";

const MB_COMPARE_KEY = "mb_compare";
const MAX_COMPARE = 4;

export interface MbCompareItem {
  id: string;
  name: string;
}

function readList(): MbCompareItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(MB_COMPARE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveList(list: MbCompareItem[]) {
  localStorage.setItem(MB_COMPARE_KEY, JSON.stringify(list));
}

/** 미분양 단지 비교 목록 훅 — localStorage 기반, 최대 4개 */
export function useMbCompare() {
  const [list, setList] = useState<MbCompareItem[]>([]);

  useEffect(() => {
    setList(readList());
  }, []);

  const isInCompare = useCallback(
    (id: string) => list.some((c) => c.id === id),
    [list],
  );

  const add = useCallback((item: MbCompareItem) => {
    const current = readList();
    if (current.length >= MAX_COMPARE) return false;
    if (current.some((c) => c.id === item.id)) return false;
    const updated = [...current, item];
    saveList(updated);
    setList(updated);
    return true;
  }, []);

  const remove = useCallback((id: string) => {
    const updated = readList().filter((c) => c.id !== id);
    saveList(updated);
    setList(updated);
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(MB_COMPARE_KEY);
    setList([]);
  }, []);

  const toggle = useCallback((item: MbCompareItem) => {
    const current = readList();
    const exists = current.some((c) => c.id === item.id);
    if (exists) {
      const updated = current.filter((c) => c.id !== item.id);
      saveList(updated);
      setList(updated);
    } else {
      if (current.length >= MAX_COMPARE) return false;
      const updated = [...current, item];
      saveList(updated);
      setList(updated);
    }
    return true;
  }, []);

  return { list, isInCompare, add, remove, clear, toggle, isFull: list.length >= MAX_COMPARE };
}
