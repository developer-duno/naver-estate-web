"use client";

import { Suspense } from "react";
import SearchExperience from "@/components/search/SearchExperience";
import HomeHero from "@/components/home/HomeHero";
import HomeSections from "@/components/home/HomeSections";
import HomeFallback from "@/components/home/HomeFallback";
import { HomeSearchBox } from "@/components/home/HomeSearchBox";

/**
 * 홈(세션 508 개편 · 사장님 결정 2026-11-15).
 * - HomeHero(h1·설명)는 Suspense 밖 → 봇이 받는 첫 HTML 에 들어간다(seo-metadata 룰 3).
 * - SearchExperience 는 useSearchParams 를 써서 Suspense 안. 검색어가 없으면 renderEmpty 로 HomeSections 를 그리고,
 *   Suspense 대기 화면도 같은 HomeSections(정적 · GET 검색창)를 그린다 — 대출 판·지역 17곳·계산기·가이드가 첫 HTML 에 들어가고
 *   모양이 같아 깜빡이지 않는다. 검색어가 있으면 기존 결과 화면 그대로(검색 주소로 바로 들어오면 대기 화면의 홈 칸은
 *   HomeFallback 의 짧은 스크립트가 그리기 전에 숨긴다).
 * - 바닥의 회색이 바닥글 위 여백(mt-16)까지 이어지게 -mb-16 pb-16.
 */
export default function HomePage() {
  return (
    <div className="-mb-16 bg-brand-bg pb-16">
      <HomeHero />
      <Suspense fallback={<HomeFallback />}>
        <SearchExperience
          className="max-w-7xl mx-auto px-4 py-6"
          renderEmpty={(api) => <HomeSections search={<HomeSearchBox api={api} />} interactive />}
        />
      </Suspense>
    </div>
  );
}
