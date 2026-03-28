"use client";

import { useState, useEffect, useCallback } from "react";

const COMPARE_KEY = "compare_complexes";
const MAX_COMPARE = 4;

export interface CompareItem {
  complex_no: string;
  complex_name: string;
}

function readCompareList(): CompareItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(COMPARE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveCompareList(list: CompareItem[]): void {
  localStorage.setItem(COMPARE_KEY, JSON.stringify(list));
}

/** 단지 비교 목록 훅 — localStorage 기반, 최대 4개 */
export function useCompare() {
  const [list, setList] = useState<CompareItem[]>([]);

  useEffect(() => {
    setList(readCompareList());
  }, []);

  const isInCompare = useCallback((complexNo: string) => {
    return list.some((c) => c.complex_no === complexNo);
  }, [list]);

  const add = useCallback((item: CompareItem) => {
    const current = readCompareList();
    if (current.length >= MAX_COMPARE) return false;
    if (current.some((c) => c.complex_no === item.complex_no)) return false;
    const updated = [...current, item];
    saveCompareList(updated);
    setList(updated);
    return true;
  }, []);

  const remove = useCallback((complexNo: string) => {
    const updated = readCompareList().filter((c) => c.complex_no !== complexNo);
    saveCompareList(updated);
    setList(updated);
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(COMPARE_KEY);
    setList([]);
  }, []);

  const toggle = useCallback((item: CompareItem) => {
    const current = readCompareList();
    const exists = current.some((c) => c.complex_no === item.complex_no);
    if (exists) {
      const updated = current.filter((c) => c.complex_no !== item.complex_no);
      saveCompareList(updated);
      setList(updated);
    } else {
      if (current.length >= MAX_COMPARE) return false;
      const updated = [...current, item];
      saveCompareList(updated);
      setList(updated);
    }
    return true;
  }, []);

  return { list, isInCompare, add, remove, clear, toggle, isFull: list.length >= MAX_COMPARE };
}
