"use client";

import { useState } from "react";
import Link from "next/link";
import { useFavorites } from "@/hooks/useFavorites";
import { useArticleFavorites } from "@/hooks/useArticleFavorites";
import { useSessionToken } from "@/hooks/useSessionToken";
import { useFavoritePriceChanges } from "@/hooks/useFavoritePriceChanges";

/**
 * 홈 즐겨찾기 — 단지 칩(앞 10개 + 더보기) · 가격 변동 점 · 「즐겨찾기 매물」 링크(토큰 있을 때만).
 * 세션 508 에 page.tsx HomeExtras 에서 그대로 옮겼다(동작 그대로, 색만 새 토큰).
 */
export default function HomeFavorites() {
  const { favorites } = useFavorites();
  const { favorites: articleFavorites } = useArticleFavorites();
  const [showAllFavorites, setShowAllFavorites] = useState(false);
  const visibleFavorites = showAllFavorites ? favorites : favorites.slice(0, 10);
  // 가격 변동 배지 — 승인 중개사만 조회(B2 게이트), 비승인/비로그인은 changedIds 항상 빈 Set
  const { sessionToken, tokenReady } = useSessionToken();
  const { changedIds } = useFavoritePriceChanges(
    favorites.map((f) => f.complex_no),
    sessionToken,
    tokenReady,
  );

  return (
    <section aria-label="즐겨찾기" className="space-y-3">
      <div>
        <span className="mb-1.5 block text-xs font-semibold text-brand-muted">즐겨찾기</span>
        {favorites.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {visibleFavorites.map((f) => (
              // 진짜 링크(세션 483 PR 3b — 단지로 가는 <a href>) · 칩 안에 다른 버튼이 없어 칩 전체가 링크
              <Link
                key={f.complex_no}
                href={`/complex/${f.complex_no}`}
                prefetch={false}
                className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-brand-line bg-white px-2.5 py-1 text-xs text-brand-navy transition-colors hover:bg-brand-orange-soft"
              >
                <span className="text-brand-orange">&#9733;</span>
                {f.complex_name}
                {changedIds.has(f.complex_no) && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-brand-orange-text"
                    title="가격이 변동됐어요"
                  />
                )}
              </Link>
            ))}
            {!showAllFavorites && favorites.length > 10 && (
              <button
                type="button"
                onClick={() => setShowAllFavorites(true)}
                className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-brand-line bg-brand-bg px-2.5 py-1 text-xs text-brand-muted transition-colors hover:bg-white"
              >
                +{favorites.length - 10}개 더보기
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-brand-muted">관심 단지의 ★ 버튼을 누르면 여기에 모입니다.</p>
        )}
      </div>

      {/* 매물은 로그인 뒤 기능 — 토큰이 있을 때만 그린다(비로그인·토큰 확인 전엔 숨김, 세션 493) */}
      {sessionToken && (
        <div>
          <Link
            href="/search/favorites"
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-orange-text hover:underline"
          >
            <span className="text-brand-orange">&#9733;</span>
            즐겨찾기 매물{articleFavorites.length > 0 ? ` (${articleFavorites.length})` : ""} &#8594;
          </Link>
        </div>
      )}
    </section>
  );
}
