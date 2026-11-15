import type { ReactNode } from "react";
import HomeToolCards from "@/components/HomeToolCards";
import HomeLoanPanel from "./HomeLoanPanel";
import HomeRegionLinks from "./HomeRegionLinks";
import HomeRegionTrend from "./HomeRegionTrend";
import HomeFavorites from "./HomeFavorites";
import HomeGuide from "./HomeGuide";

/** 대기 화면에서 지역 시세 카드 자리 — 실제 카드의 로딩 상태와 같은 모양(브라우저 저장소·요청 0) */
function TrendPlaceholder() {
  return (
    <section aria-labelledby="home-trend" className="rounded-2xl bg-brand-navy p-5 text-white sm:p-7">
      <h2 id="home-trend" className="text-[19px] font-black sm:text-xl">지역 시세 흐름</h2>
      <p className="mt-1 text-[13px] text-brand-on-navy-muted">한국부동산원 주택가격동향 · 최근 24개월 · 중위 매매가</p>
      <div className="mt-4 h-11" aria-hidden />
      <div className="mt-4 flex h-[180px] items-center justify-center text-sm text-brand-on-navy-muted">불러오는 중...</div>
      <p className="mt-2 text-xs text-brand-on-navy-muted">출처: 한국부동산원 주택가격동향</p>
    </section>
  );
}

/**
 * 홈 빈 화면(검색어 없음) 칸 묶음(세션 508) — Suspense 대기 화면(정적 프리렌더 = 봇이 받는 첫 HTML)과
 * SearchExperience renderEmpty 가 **같은 컴포넌트**를 그린다(모양이 같아 깜빡임 없음).
 * interactive=false(대기 화면)면 브라우저 저장소·세션·요청을 쓰는 칸(즐겨찾기·지역 시세 차트)은 자리만 둔다.
 */
export default function HomeSections({ search, interactive }: { search: ReactNode; interactive: boolean }) {
  return (
    <>
      <div className="bg-brand-navy text-white">
        <div className="mx-auto max-w-[1160px] px-4 pb-[88px] sm:px-6 sm:pb-[120px]">{search}</div>
      </div>
      <div className="mx-auto flex max-w-[1160px] flex-col gap-10 px-4 sm:gap-14 sm:px-6">
        <div className="-mt-16 sm:-mt-[72px]">
          <HomeLoanPanel />
        </div>
        <HomeRegionLinks />
        {interactive ? <HomeRegionTrend /> : <TrendPlaceholder />}
        <HomeToolCards />
        {interactive && <HomeFavorites />}
        <HomeGuide />
      </div>
    </>
  );
}
