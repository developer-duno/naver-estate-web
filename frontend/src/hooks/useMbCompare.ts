"use client";

import { useCallback } from "react";
import { useLocalStorageList } from "./useLocalStorageList";

export interface MbCompareItem {
  id: string;
  name: string;
}

const getId = (item: MbCompareItem) => item.id;

/** 미분양 단지 비교 목록 훅 — localStorage 기반, 최대 4개 */
export function useMbCompare() {
  const { list, isIn, add, remove, clear, toggle, isFull } =
    useLocalStorageList<MbCompareItem>({
      storageKey: "mb_compare",
      getId,
      maxItems: 4,
    });

  const isInCompare = useCallback((id: string) => isIn(id), [isIn]);

  return { list, isInCompare, add, remove, clear, toggle, isFull };
}
