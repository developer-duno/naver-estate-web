/**
 * 전국 지역 목록(/region) — 시도별 시군구 허브 링크(세션 484 PR 3c-1b, 결정 34 · v2 O4).
 *
 * 이름표(lib/seo/region-codes.ts — backend/data/region_codes.json 복사) 253곳 전부를 백엔드 호출 없이 정적으로 그린다(메인 결정 10-28 ⓐ —
 * 빌드 때 그려지는 장이라 백엔드에 기대면 CI 빌드(placeholder 주소)가 깨진다). 색인 밖 허브(영양군)도 손님용 링크는 둔다.
 * REGION_PAGES_ENABLED=false 면 404(v2 O7). robots 는 색인 스위치 REGION_PAGES_INDEX 만 따른다.
 * 새 틀(세션 526 B40 PR 2b · E10): 남색 띠 → 시도 칩(그 시도 카드로 뛰는 닻 · 스크립트 0) → 시도 카드(시군구 칸 격자). 링크는 하나도 숨기지 않는다.
 */
import Link from "next/link";
import type { Metadata } from "next";
import { loadRegionIndex } from "@/lib/server/region-pages";
import { regionHubPath } from "@/lib/seo/complex-page";
import { INDEX_TITLE, indexCrumbs, indexMetadata } from "@/lib/seo/region-page";
import BrandCard from "@/components/brand/BrandCard";
import BrandPage from "@/components/brand/BrandPage";
import PageBand from "@/components/brand/PageBand";
import ComplexBreadcrumb from "@/components/complex/public/ComplexBreadcrumb";

export const metadata: Metadata = indexMetadata();

export default function RegionIndexPage() {
  const groups = loadRegionIndex();
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <BrandPage>
      <PageBand
        innerClassName="mx-auto max-w-5xl px-4"
        eyebrow={<ComplexBreadcrumb crumbs={indexCrumbs()} tone="navy" />}
        title={INDEX_TITLE}
        description={`시군구 ${total.toLocaleString()}곳 — 시군구를 누르면 동별 아파트 단지의 실거래가 범위·공시가격을 볼 수 있어요.`}
      />
      <div className="mx-auto max-w-5xl space-y-5 px-4 pt-5 pb-6">
        <nav aria-label="시도 바로 가기">
          <ul className="flex flex-wrap gap-1.5">
            {groups.map((g) => (
              <li key={g.sido}>
                <a
                  href={`#${g.sido}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-brand-line bg-white px-3.5 text-sm font-bold text-brand-navy hover:bg-brand-bg"
                >
                  {g.sido}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {groups.map((g) => (
          <BrandCard key={g.sido} as="section" id={g.sido} aria-labelledby={`sido-${g.sido}`} className="scroll-mt-20 space-y-3 p-4 sm:p-5">
            <h2 id={`sido-${g.sido}`} className="text-[15px] font-black text-brand-navy">{g.sido}</h2>
            <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6">
              {g.items.map((it) => (
                <li key={it.code}>
                  {/* 미리 받기 끔 — 253 링크가 화면에 들어오면 허브 장을 전부 미리 그리게 된다(v2 O3) */}
                  <Link
                    href={regionHubPath(it.code)}
                    prefetch={false}
                    className="flex min-h-11 items-center justify-center rounded-lg bg-brand-bg px-1.5 py-1 text-center text-sm leading-tight text-brand-navy hover:underline"
                  >
                    {it.name}
                  </Link>
                </li>
              ))}
            </ul>
          </BrandCard>
        ))}
        <p className="text-xs text-brand-muted">출처: 국토교통부 공공데이터(실거래가·공동주택 공시가격) · 한국부동산원 전국주택가격동향조사</p>
      </div>
    </BrandPage>
  );
}
