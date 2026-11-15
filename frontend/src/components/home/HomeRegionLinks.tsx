import Link from "next/link";
import { REGION_PAGES_ENABLED } from "@/lib/seo/complex-page";
import { REGION_CODES } from "@/lib/seo/region-codes";
import { regionIndexGroups } from "@/lib/seo/region-page";

/** /region 장이 시·도마다 다는 닻(id)과 같은 글자 — 같은 함수(regionIndexGroups)로 만든다 */
const SIDO_NAMES = regionIndexGroups(REGION_CODES).map((g) => g.sido);

/**
 * 홈 「지역별 실거래가」(세션 508 · 승인 항목 10) — 17개 시·도 단추 → /region#시도, 끝에 「시·군·구 전체 보기」.
 * 지역 장이 꺼져 있으면(REGION_PAGES_ENABLED=false) 칸 전체를 숨긴다(404 링크 방지). 미리 받기 끔(v2 O3).
 */
export default function HomeRegionLinks({ enabled = REGION_PAGES_ENABLED }: { enabled?: boolean }) {
  if (!enabled) return null;
  return (
    <section aria-labelledby="home-region">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="home-region" className="text-[22px] font-black tracking-tight text-brand-navy sm:text-[26px]">
          지역별 실거래가
        </h2>
        <Link href="/region" prefetch={false} className="hidden text-sm text-brand-muted hover:underline sm:inline">
          시·군·구 전체 보기 →
        </Link>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2 text-center text-[15px] font-bold sm:mt-5 sm:grid-cols-9 sm:gap-2.5 sm:text-base">
        {SIDO_NAMES.map((sido) => (
          <Link
            key={sido}
            href={`/region#${sido}`}
            prefetch={false}
            className="rounded-[10px] bg-white py-3.5 text-brand-navy hover:underline sm:rounded-xl sm:py-[18px]"
          >
            {sido}
          </Link>
        ))}
        <Link
          href="/region"
          prefetch={false}
          className="col-span-3 rounded-[10px] bg-brand-navy py-3.5 text-white hover:underline sm:hidden"
        >
          시·군·구 전체 보기
        </Link>
      </div>
    </section>
  );
}
