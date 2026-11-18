"use client";

import { Suspense } from "react";
import SearchExperience from "@/components/search/SearchExperience";
import HomeSections from "@/components/home/HomeSections";
import HomeFallback from "@/components/home/HomeFallback";
import { HomeSearchBox } from "@/components/home/HomeSearchBox";

/**
 * 홈(세션 508 개편 · 사장님 결정 2026-11-15).
 * - SearchExperience 는 useSearchParams 를 써서 Suspense 안. 검색어가 없으면 renderEmpty 로 HomeSections 를 그리고,
 *   Suspense 대기 화면도 같은 HomeSections(정적 · GET 검색창)를 그린다 — 머리(HomeHero h1·설명)·대출 판·지역 17곳·계산기·가이드가
 *   첫 HTML 에 들어가고 모양이 같아 깜빡이지 않는다(seo-metadata 룰 3).
 * - 세션 525(B40 PR 2a): HomeHero 를 이 장에서 HomeSections 맨 위로 옮겼다 — 검색 결과 화면엔 홈 큰 띠가 없고(h1 하나)
 *   SearchExperience 의 얇은 띠가 그린다. 검색 주소로 바로 들어오면 대기 화면(큰 띠 포함)은 HomeFallback 의 짧은 스크립트가 그리기 전에 숨긴다.
 * - 결과 화면 안쪽 폭은 홈 칸과 같은 1160(검색창이 옆으로 안 튄다).
 * - 바닥의 회색이 바닥글 위 여백(mt-16)까지 이어지게 -mb-16 pb-16.
 */
export default function HomePage() {
  return (
    <div className="-mb-16 bg-brand-bg pb-16">
      <Suspense fallback={<HomeFallback />}>
        <SearchExperience
          className="mx-auto max-w-[1160px] px-4 py-6 sm:px-6"
          renderEmpty={(api) => <HomeSections search={<HomeSearchBox api={api} />} interactive />}
        />
      </Suspense>
    </div>
  );
}
