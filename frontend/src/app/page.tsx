"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { getStats } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import HomeToolCards from "@/components/HomeToolCards";
import SearchExperience from "@/components/search/SearchExperience";
import { SkeletonPage } from "@/components/Skeleton";
import { useFavorites } from "@/hooks/useFavorites";
import { useArticleFavorites } from "@/hooks/useArticleFavorites";
import Link from "next/link";

/** 홈 상단 — hero 이미지 + 타이틀 + 통계 (SEO 랜딩 자산). Suspense 밖에서 렌더해 h1·소개가 첫 HTML 에 포함. */
function HomeHeader() {
  const { data: stats, isLoading: statsLoading, isError: statsError, refetch: loadStats } = useQuery({
    queryKey: queryKeys.stats,
    queryFn: () => getStats(),
    staleTime: 60_000,
  });
  const complexCount = stats?.complex_count ?? 0;
  const articleCount = stats?.article_count ?? 0;

  return (
    <>
      <div className="relative w-full aspect-21/9 sm:aspect-3/1 mb-6 rounded-lg overflow-hidden bg-gray-100">
        <Image
          src="/blog-hero/main-hero.webp"
          alt="2u부동산 — 네이버 아파트·오피스텔 매물 조회"
          fill
          priority
          sizes="(max-width: 768px) 100vw, 768px"
          className="object-cover"
        />
      </div>

      <div className="text-center mb-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">공인중개사를 위한 매물·시세 분석 도구</h1>
        <p className="mt-1 text-sm text-gray-500">손님 응대 자료를 5분 안에 끝내는 데이터 도구</p>
        {statsLoading ? (
          <p className="mt-2 text-sm text-gray-400">통계 로딩...</p>
        ) : statsError ? (
          <button onClick={() => loadStats()} className="mt-2 text-sm text-gray-400 hover:text-blue-500">통계 재시도</button>
        ) : (
          <div className="flex justify-center gap-3 mt-3">
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-5 py-2.5 text-center">
              <p className="text-xs text-blue-600 font-medium">단지</p>
              <p className="text-lg font-bold text-blue-700">{complexCount.toLocaleString()}</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg px-5 py-2.5 text-center">
              <p className="text-xs text-green-600 font-medium">매물</p>
              <p className="text-lg font-bold text-green-700">{articleCount.toLocaleString()}</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/** 홈 하단 — 도구 카드 + 즐겨찾기. 검색 결과 없을 때 SearchExperience emptyExtra 로 주입. */
function HomeExtras() {
  const router = useRouter();
  const { favorites } = useFavorites();
  const { favorites: articleFavorites } = useArticleFavorites();
  const [showAllFavorites, setShowAllFavorites] = useState(false);
  const visibleFavorites = showAllFavorites ? favorites : favorites.slice(0, 10);

  return (
    <div className="space-y-4">
      <HomeToolCards />

      <div>
        <span className="text-xs font-semibold text-gray-500 mb-1.5 block">즐겨찾기</span>
        {favorites.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {visibleFavorites.map((f) => (
              <button
                key={f.complex_no}
                onClick={() => router.push(`/complex/${f.complex_no}`)}
                className="inline-flex items-center gap-1 bg-yellow-50 text-yellow-800 text-xs rounded-full px-2.5 py-1 border border-yellow-200 hover:bg-yellow-100 cursor-pointer transition-colors"
              >
                <span className="text-yellow-500">&#9733;</span>
                {f.complex_name}
              </button>
            ))}
            {!showAllFavorites && favorites.length > 10 && (
              <button
                type="button"
                onClick={() => setShowAllFavorites(true)}
                className="inline-flex items-center gap-1 bg-gray-50 text-gray-600 text-xs rounded-full px-2.5 py-1 border border-gray-200 hover:bg-gray-100 cursor-pointer transition-colors"
              >
                +{favorites.length - 10}개 더보기
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-500">관심 단지의 ★ 버튼을 누르면 여기에 모입니다.</p>
        )}
      </div>

      <div>
        <Link
          href="/search/favorites"
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
        >
          <span className="text-yellow-500">&#9733;</span>
          즐겨찾기 매물{articleFavorites.length > 0 ? ` (${articleFavorites.length})` : ""} &#8594;
        </Link>
      </div>
    </div>
  );
}

export default function HomePage() {
  // HomeHeader(hero·h1·소개·통계)는 Suspense 밖에서 렌더 → 정적 텍스트(h1·소개)가
  // 검색봇이 받는 첫 HTML 에 포함된다. SearchExperience 는 useSearchParams 를 쓰므로
  // Suspense 경계 안에 둔다(통계 useQuery 는 클라이언트에서 채워짐, 텍스트는 SSR).
  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <HomeHeader />
      <Suspense fallback={<SkeletonPage />}>
        <SearchExperience emptyExtra={<HomeExtras />} />
      </Suspense>
    </div>
  );
}
