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
import { useSessionToken } from "@/hooks/useSessionToken";
import { useFavoritePriceChanges } from "@/hooks/useFavoritePriceChanges";
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
  const { sessionToken, tokenReady } = useSessionToken();
  const showSignupCta = tokenReady && !sessionToken;

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

      {/* 서비스 소개 + 가입 유도 — 정적 텍스트라 첫 HTML 에 포함(검색·AI 봇이 읽는 본문). 가입 버튼은 비로그인일 때만. */}
      <section aria-labelledby="home-intro" className="mx-auto mb-8 max-w-2xl text-center">
        <h2 id="home-intro" className="text-base font-semibold text-gray-800">
          2u부동산은 무엇을 하나요
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          공인중개사가 손님 응대 자료를 빨리 만들도록 돕는 웹 도구입니다. 단지를 검색하면 네이버 부동산에
          올라온 매물을 실시간으로 모아 시세·평당가를 비교하고, 국토교통부 실거래가와 미분양 현황을 함께
          봅니다. 취득세·양도소득세·보유세·중개수수료 계산기는 로그인 없이 쓸 수 있습니다.
        </p>
        <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
          <li><Link href="/tools" className="text-blue-600 hover:underline">부동산 계산기 5종</Link></li>
          <li><Link href="/blog" className="text-blue-600 hover:underline">실무 가이드 블로그</Link></li>
          <li><Link href="/help" className="text-blue-600 hover:underline">사용 가이드</Link></li>
        </ul>
        {showSignupCta && (
          <div className="mt-4">
            <Link
              href="/signup"
              className="inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              무료로 시작하기
            </Link>
            <p className="mt-2 text-xs text-gray-500">
              가입 뒤 공인중개사 확인(관리자 승인)을 거치면 단지 매물 조회를 쓸 수 있습니다.
            </p>
          </div>
        )}
      </section>
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
  // 가격 변동 배지 — 승인 중개사만 조회(B2 게이트), 비승인/비로그인은 changedIds 항상 빈 Set
  const { sessionToken, tokenReady } = useSessionToken();
  const { changedIds } = useFavoritePriceChanges(
    favorites.map((f) => f.complex_no),
    sessionToken,
    tokenReady,
  );

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
                {changedIds.has(f.complex_no) && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-red-500"
                    title="가격이 변동됐어요"
                  />
                )}
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
