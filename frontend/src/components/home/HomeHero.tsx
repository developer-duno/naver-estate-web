/**
 * 홈 머리(세션 508 · 승인 항목 4) — 남색 바탕 · 작은 줄 · h1 · 설명. 훅이 없어 Suspense 밖에서 첫 HTML 에 그대로 들어간다
 * (seo-metadata 룰 3). 검색창은 그 아래 HomeSections 의 남색 띠가 이어서 그린다.
 */
export default function HomeHero() {
  return (
    <div className="bg-brand-navy text-white">
      <div className="mx-auto max-w-[1160px] px-4 pb-6 pt-7 sm:px-6 sm:pt-14">
        <p className="text-[13px] font-bold text-brand-orange sm:text-[15px]">로그인 없이 · 무료</p>
        <h1 className="mt-2 text-[32px] font-black leading-tight tracking-tight sm:mt-3 sm:text-[52px]">
          우리 아파트, 요즘 얼마에 거래됐을까요
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-brand-on-navy-muted sm:mt-4 sm:text-[17px]">
          국토교통부 실거래가 · 공시가격 · 한국부동산원 지역 시세를 한곳에서 봅니다.
        </p>
      </div>
    </div>
  );
}
