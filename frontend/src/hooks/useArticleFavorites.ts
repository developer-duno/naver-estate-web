"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FAVORITE_ARTICLES_CLEARED_EVENT,
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

  // 로그아웃으로 목록이 비워지면 열린 화면도 다시 읽는다(세션 496 검사관 🟡 — 옛 목록에서 '제거'를 누르면 다시 저장되던 길)
  useEffect(() => {
    window.addEventListener(FAVORITE_ARTICLES_CLEARED_EVENT, refresh);
    return () => window.removeEventListener(FAVORITE_ARTICLES_CLEARED_EVENT, refresh);
  }, [refresh]);

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

  useEffect(() => {
    const onCleared = () => setStarred(false);
    window.addEventListener(FAVORITE_ARTICLES_CLEARED_EVENT, onCleared);
    return () => window.removeEventListener(FAVORITE_ARTICLES_CLEARED_EVENT, onCleared);
  }, []);

  const toggle = useCallback(
    (info: Omit<FavoriteArticle, "added_at" | "article_no">) => {
      const added = doToggle({ article_no: articleNo, ...info });
      setStarred(added);
    },
    [articleNo],
  );

  return { starred, toggle };
}
