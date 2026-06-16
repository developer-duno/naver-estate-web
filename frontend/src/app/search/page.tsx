"use client";

import { Suspense } from "react";
import SearchExperience from "@/components/search/SearchExperience";
import { SkeletonPage } from "@/components/Skeleton";

/**
 * 검색 페이지 — 검색 경험은 SearchExperience 공용 컴포넌트가 담당 (홈과 공유, 세션 314).
 * URL(useSearchParams)이 진실의 원천이라 /search?q=... 로 직접 진입해도 결과 표시.
 * (F1 단계에서 홈 리다이렉트로 교체 예정 — 현재는 SearchExperience 직접 렌더로 동작 보존)
 */
function SearchPageContent() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <SearchExperience />
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<SkeletonPage />}>
      <SearchPageContent />
    </Suspense>
  );
}
