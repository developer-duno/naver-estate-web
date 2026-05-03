"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getFavoriteArticles,
  isArticleFavorite as checkFavorite,
  toggleFavoriteArticle as doToggle,
  type FavoriteArticle,
} from "@/lib/storage";
import { useLocalStorageFavorites } from "./useLocalStorageFavorites";

const getId = (item: FavoriteArticle) => item.article_no;

/** 매물 즐겨찾기 훅 — localStorage 기반 (전체 목록 + 토글) */
export function useArticleFavorites() {
  const { favorites, isFavorite, refresh } =
    useLocalStorageFavorites<FavoriteArticle>({ getAll: getFavoriteArticles, getId });

  const toggle = useCallback(
    (article: Omit<FavoriteArticle, "added_at">) => {
      doToggle(article);
      refresh();
    },
    [refresh],
  );

  return { favorites, isFavorite, toggle };
}

/** 단일 매물의 즐겨찾기 상태 훅 */
export function useArticleFavoriteStatus(articleNo: string) {
  const [starred, setStarred] = useState(false);

  useEffect(() => {
    setStarred(checkFavorite(articleNo));
  }, [articleNo]);

  const toggle = useCallback(
    (info: Omit<FavoriteArticle, "added_at" | "article_no">) => {
      const added = doToggle({ article_no: articleNo, ...info });
      setStarred(added);
    },
    [articleNo],
  );

  return { starred, toggle };
}
