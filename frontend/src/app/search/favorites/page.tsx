"use client";

import { useState } from "react";
import Link from "next/link";
import { useArticleFavorites } from "@/hooks/useArticleFavorites";
import ArticleFavoritesTab from "@/components/ArticleFavoritesTab";
import ArticleDetail from "@/components/ArticleDetail";

/**
 * 매물 즐겨찾기 모아보기 — favorite_articles(localStorage) 한곳 보기.
 * 단지 즐겨찾기는 홈에 칩으로 노출되나 매물은 모아보기가 없던 비대칭 해소(세션 294).
 * 행 클릭 시 ArticleDetail 모달(articleNo 단독 → getArticleLive 최신 재조회, 단지 정보는 미표시 수용).
 */
export default function ArticleFavoritesPage() {
  const { favorites, toggle } = useArticleFavorites();
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">즐겨찾기 매물</h1>
        <Link href="/search" className="text-sm text-blue-600 hover:underline">
          &#8592; 검색으로
        </Link>
      </div>

      <ArticleFavoritesTab
        favorites={favorites}
        onRowClick={setSelectedArticle}
        onRemove={toggle}
      />

      {selectedArticle && (
        <ArticleDetail articleNo={selectedArticle} onClose={() => setSelectedArticle(null)} />
      )}
    </div>
  );
}
