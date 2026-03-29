"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getMbFavorites,
  isMbFavorite as checkMbFavorite,
  toggleMbFavorite as doMbToggle,
  type MbFavoriteApartment,
} from "@/lib/storage";

/** 미분양 즐겨찾기 목록 훅 — localStorage 기반 */
export function useMbFavorites() {
  const [favorites, setFavorites] = useState<MbFavoriteApartment[]>([]);

  useEffect(() => {
    setFavorites(getMbFavorites());
  }, []);

  const isFavorite = useCallback(
    (id: string) => favorites.some((f) => f.id === id),
    [favorites],
  );

  const toggle = useCallback((item: Omit<MbFavoriteApartment, "added_at">) => {
    doMbToggle(item);
    setFavorites(getMbFavorites());
  }, []);

  return { favorites, isFavorite, toggle };
}

/** 단일 아파트 즐겨찾기 상태 훅 */
export function useMbFavoriteStatus(id: string) {
  const [starred, setStarred] = useState(false);

  useEffect(() => {
    setStarred(checkMbFavorite(id));
  }, [id]);

  const toggle = useCallback(
    (name: string, region?: string) => {
      const added = doMbToggle({ id, name, region });
      setStarred(added);
    },
    [id],
  );

  return { starred, toggle };
}
