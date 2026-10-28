/**
 * 전국 지역 목록(/region) — 시도별 시군구 허브 링크(세션 484 PR 3c-1b, 결정 34 · v2 O4).
 *
 * 이름표(lib/seo/region-codes.ts — backend/data/region_codes.json 복사) 253곳 전부를 백엔드 호출 없이 정적으로 그린다(메인 결정 10-28 ⓐ —
 * 빌드 때 그려지는 장이라 백엔드에 기대면 CI 빌드(placeholder 주소)가 깨진다). 색인 밖 허브(영양군)도 손님용 링크는 둔다.
 * REGION_PAGES_ENABLED=false 면 404(v2 O7). robots 는 색인 스위치 REGION_PAGES_INDEX 만 따른다.
 */
import Link from "next/link";
import type { Metadata } from "next";
import { loadRegionIndex } from "@/lib/server/region-pages";
import { regionHubPath } from "@/lib/seo/complex-page";
import { INDEX_TITLE, indexCrumbs, indexMetadata } from "@/lib/seo/region-page";
import ComplexBreadcrumb from "@/components/complex/public/ComplexBreadcrumb";

export const metadata: Metadata = indexMetadata();

export default function RegionIndexPage() {
  const groups = loadRegionIndex();
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <ComplexBreadcrumb crumbs={indexCrumbs()} />
      <div className="space-y-1">
        <h1 className="text-lg md:text-2xl font-bold">{INDEX_TITLE}</h1>
        <p className="text-sm text-gray-600">
          시군구 {total.toLocaleString()}곳 — 시군구를 누르면 동별 아파트 단지의 실거래가 범위·공시가격을 볼 수 있어요.
        </p>
      </div>
      {groups.map((g) => (
        <section key={g.sido} id={g.sido} aria-labelledby={`sido-${g.sido}`} className="space-y-2 scroll-mt-20">
          <h2 id={`sido-${g.sido}`} className="text-base font-bold text-gray-900">{g.sido}</h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
            {g.items.map((it) => (
              <li key={it.code}>
                {/* 미리 받기 끔 — 253 링크가 화면에 들어오면 허브 장을 전부 미리 그리게 된다(v2 O3) */}
                <Link href={regionHubPath(it.code)} prefetch={false} className="text-blue-700 hover:underline">
                  {it.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-xs text-gray-400">출처: 국토교통부 공공데이터(실거래가·공동주택 공시가격) · 한국부동산원 전국주택가격동향조사</p>
    </div>
  );
}
