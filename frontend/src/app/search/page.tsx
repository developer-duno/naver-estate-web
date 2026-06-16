"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SkeletonPage } from "@/components/Skeleton";

/**
 * /search → 홈(/) 리다이렉트 (세션 314 F1).
 * 홈이 검색 경험을 흡수(SearchExperience)해 검색 메뉴를 없앴다. 기존 /search?... 북마크·SEO·
 * 외부 링크는 URL 파라미터를 보존하며 홈으로 보내 동작 유지. (/search/favorites 는 별도 라우트라 영향 0.)
 */
function SearchRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams.toString();
    router.replace(qs ? `/?${qs}` : "/");
  }, [router, searchParams]);

  return <SkeletonPage message="홈으로 이동 중입니다..." />;
}

export default function SearchPage() {
  return (
    <Suspense fallback={<SkeletonPage />}>
      <SearchRedirect />
    </Suspense>
  );
}
