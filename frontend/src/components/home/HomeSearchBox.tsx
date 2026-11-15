"use client";

import { useState } from "react";
import RegionSelector from "@/components/RegionSelector";
import type { EmptySearchApi } from "@/components/search/SearchExperience";
import HomeFavorites from "./HomeFavorites";

// 휴대폰은 세로로 쌓이므로 flex-1(기준 높이 0)을 쓰면 WebKit·Chromium 모두 입력 칸이 19px 로 눌린다(세션 508 실측) →
// 세로 쌓임에선 w-full + shrink-0, 가로 줄(sm 이상)에서만 flex-1
const inputCls =
  "h-[54px] w-full shrink-0 sm:w-auto sm:min-w-0 sm:flex-1 rounded-xl border-0 bg-white px-4 text-base text-brand-navy placeholder:text-brand-muted focus:outline-none focus:ring-2 focus:ring-brand-orange sm:h-[60px] sm:px-5 sm:text-lg";
const buttonCls =
  "h-[54px] rounded-xl bg-brand-orange px-8 text-[17px] font-bold text-brand-navy hover:brightness-95 sm:h-[60px] sm:text-lg";
const toggleCls = "mt-3 text-sm text-brand-on-navy-muted underline-offset-2 hover:text-white hover:underline";

/**
 * 홈 머리 검색창(세션 508 · 승인 항목 6 안 1) — 검색 실행은 SearchExperience 의 기존 손잡이(api)를 그대로 쓴다.
 * 지역 고르기 검색(RegionSelector)은 「지역으로 찾기 ▾」 안에 둔다.
 */
export function HomeSearchBox({ api }: { api: EmptySearchApi }) {
  const [regionOpen, setRegionOpen] = useState(false);
  return (
    <div className="max-w-[760px]">
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-2.5">
        <input
          type="text"
          aria-label="단지 또는 지역 검색"
          value={api.keyword}
          onChange={(e) => api.setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && api.submitKeyword()}
          placeholder="아파트 이름이나 동네를 입력하세요"
          maxLength={100}
          className={inputCls}
        />
        <button type="button" onClick={api.submitKeyword} className={buttonCls}>
          검색
        </button>
      </div>
      <button type="button" aria-expanded={regionOpen} onClick={() => setRegionOpen((v) => !v)} className={toggleCls}>
        지역으로 찾기 {regionOpen ? "▴" : "▾"}
      </button>
      {regionOpen && (
        <div className="mt-2 rounded-xl bg-white p-4 text-brand-navy">
          <RegionSelector onSearch={api.searchRegion} />
        </div>
      )}
      {/* 최근 검색 칩(기존 부품) — 남색 위라 제목 글자색만 바꾸고 왼쪽 정렬 */}
      <div className="mt-2 [&>div]:mx-0 [&_div]:justify-start [&_p]:text-brand-on-navy-muted">{api.recentChips}</div>
      {/* 즐겨찾기 칩(세션 509 · B36 ①) — 최근 검색 칩 바로 아래 · 0개면 안 그림. 대기 화면(Static)엔 없다(브라우저 저장소) */}
      <HomeFavorites />
    </div>
  );
}

/**
 * Suspense 대기 화면(정적 프리렌더 = 첫 HTML)용 — JS 없이도 /?q= 로 가는 GET 검색. 모양은 HomeSearchBox 와 같다.
 */
export function HomeSearchBoxStatic() {
  return (
    <div className="max-w-[760px]">
      <form action="/" method="get" role="search" className="flex flex-col gap-2 sm:flex-row sm:gap-2.5">
        <input
          type="text"
          name="q"
          aria-label="단지 또는 지역 검색"
          placeholder="아파트 이름이나 동네를 입력하세요"
          maxLength={100}
          className={inputCls}
        />
        <button type="submit" className={buttonCls}>
          검색
        </button>
      </form>
      <button type="button" aria-expanded={false} className={toggleCls}>
        지역으로 찾기 ▾
      </button>
    </div>
  );
}
