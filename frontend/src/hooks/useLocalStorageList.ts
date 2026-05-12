"use client";

import { useState, useEffect, useCallback } from "react";
import { readJSON } from "@/lib/storage";

/** localStorage 기반 리스트 관리 제네릭 훅 — useCompare, useMbCompare 공통 로직 */
interface UseLocalStorageListConfig<T> {
  storageKey: string;
  getId: (item: T) => string;
  maxItems: number;
}

export function useLocalStorageList<T>({
  storageKey,
  getId,
  maxItems,
}: UseLocalStorageListConfig<T>) {
  const [list, setList] = useState<T[]>([]);

  useEffect(() => {
    // localStorage 는 SSR 에서 접근 불가 — useEffect 내부에서 1회 로드 (hydration mismatch 방지)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setList(readJSON<T[]>(storageKey, []));
  }, [storageKey]);

  const save = useCallback(
    (items: T[]) => {
      localStorage.setItem(storageKey, JSON.stringify(items));
      setList(items);
    },
    [storageKey],
  );

  const isIn = useCallback(
    (id: string) => list.some((item) => getId(item) === id),
    [list, getId],
  );

  const add = useCallback(
    (item: T) => {
      const current = readJSON<T[]>(storageKey, []);
      if (current.length >= maxItems) return false;
      if (current.some((c) => getId(c) === getId(item))) return false;
      save([...current, item]);
      return true;
    },
    [storageKey, maxItems, getId, save],
  );

  const remove = useCallback(
    (id: string) => {
      save(readJSON<T[]>(storageKey, []).filter((c) => getId(c) !== id));
    },
    [storageKey, getId, save],
  );

  const clear = useCallback(() => {
    localStorage.removeItem(storageKey);
    setList([]);
  }, [storageKey]);

  const toggle = useCallback(
    (item: T) => {
      const current = readJSON<T[]>(storageKey, []);
      const exists = current.some((c) => getId(c) === getId(item));
      if (exists) {
        save(current.filter((c) => getId(c) !== getId(item)));
      } else {
        if (current.length >= maxItems) return false;
        save([...current, item]);
      }
      return true;
    },
    [storageKey, maxItems, getId, save],
  );

  return { list, isIn, add, remove, clear, toggle, isFull: list.length >= maxItems };
}
