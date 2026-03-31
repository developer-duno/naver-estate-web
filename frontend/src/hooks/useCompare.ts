"use client";

import { useCallback } from "react";
import { useLocalStorageList } from "./useLocalStorageList";

export interface CompareItem {
  complex_no: string;
  complex_name: string;
}

const getId = (item: CompareItem) => item.complex_no;

/** 단지 비교 목록 훅 — localStorage 기반, 최대 4개 */
export function useCompare() {
  const { list, isIn, add, remove, clear, toggle, isFull } =
    useLocalStorageList<CompareItem>({
      storageKey: "compare_complexes",
      getId,
      maxItems: 4,
    });

  const isInCompare = useCallback(
    (complexNo: string) => isIn(complexNo),
    [isIn],
  );

  return { list, isInCompare, add, remove, clear, toggle, isFull };
}
