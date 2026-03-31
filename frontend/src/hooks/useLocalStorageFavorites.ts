"use client";

import { useState, useEffect, useCallback } from "react";

/** localStorage 즐겨찾기 제네릭 훅 — useFavorites, useMbFavorites 공통 로직 */
interface UseLocalStorageFavoritesConfig<T> {
  getAll: () => T[];
  getId: (item: T) => string;
}

export function useLocalStorageFavorites<T>({
  getAll,
  getId,
}: UseLocalStorageFavoritesConfig<T>) {
  const [favorites, setFavorites] = useState<T[]>([]);

  useEffect(() => {
    setFavorites(getAll());
  }, [getAll]);

  const isFavorite = useCallback(
    (id: string) => favorites.some((f) => getId(f) === id),
    [favorites, getId],
  );

  const refresh = useCallback(() => {
    setFavorites(getAll());
  }, [getAll]);

  return { favorites, isFavorite, refresh };
}
