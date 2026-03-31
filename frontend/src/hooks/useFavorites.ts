"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getFavorites,
  isFavorite as checkFavorite,
  toggleFavorite as doToggle,
  type FavoriteComplex,
} from "@/lib/storage";
import { useLocalStorageFavorites } from "./useLocalStorageFavorites";

const getId = (item: FavoriteComplex) => item.complex_no;

/** 즐겨찾기 훅 — localStorage 기반 */
export function useFavorites() {
  const { favorites, isFavorite, refresh } =
    useLocalStorageFavorites<FavoriteComplex>({ getAll: getFavorites, getId });

  const toggle = useCallback(
    (complex: Omit<FavoriteComplex, "added_at">) => {
      doToggle(complex);
      refresh();
    },
    [refresh],
  );

  return { favorites, isFavorite, toggle };
}

/** 단일 단지의 즐겨찾기 상태 훅 */
export function useFavoriteStatus(complexNo: string) {
  const [starred, setStarred] = useState(false);

  useEffect(() => {
    setStarred(checkFavorite(complexNo));
  }, [complexNo]);

  const toggle = useCallback(
    (complexName: string, address?: string) => {
      const added = doToggle({
        complex_no: complexNo,
        complex_name: complexName,
        address,
      });
      setStarred(added);
    },
    [complexNo],
  );

  return { starred, toggle };
}
