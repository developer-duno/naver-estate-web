/**
 * 시군구 허브 — ISR 서버 렌더(세션 484 PR 3c-1b, 설계 pr3c §2-2 + v2 · 결정 15·19·20·32·33·35 · 목업 ①).
 *
 * 빌드 때는 그리지 않고(generateStaticParams 빈 배열) 첫 요청 때 그려 하루 저장한다. 쿠키·세션 안 읽음(모든 방문자 같은 HTML).
 * 본문 = 빵부스러기 · h1 · 한 줄 · 2년 흐름 카드 · 동 칩 목차 · 동별 단지 표(동 페이지 있는 동은 12곳 + 전체 링크) · 출처.
 * 모양 아님·없는 시군구 = 404 · 옛 코드 = 새 허브로 308 · 5xx = throw(404 로 굳히지 않는다) — 판정은 lib/server/region-pages.ts loadHub.
 */
import Link from "next/link";
import type { Metadata } from "next";
import { loadHub } from "@/lib/server/region-pages";
import { dongPagePath } from "@/lib/seo/complex-page";
import {
  HUB_DONG_LIMIT,
  dongAnchor,
  hubBasis,
  hubCrumbs,
  hubMetadata,
  hubTitle,
  sortComplexes,
} from "@/lib/seo/region-page";
import ComplexBreadcrumb from "@/components/complex/public/ComplexBreadcrumb";
import ComplexTable from "@/components/region/ComplexTable";
import DongChips from "@/components/region/DongChips";
import RegionTrendCard from "@/components/region/RegionTrendCard";
import type { RegionHubDong } from "@/types/region-pages";

export const revalidate = 86400;

export function generateStaticParams(): { sigungu5: string }[] {
  return [];
}

type PageProps = { params: Promise<{ sigungu5: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { sigungu5 } = await params;
  return hubMetadata(await loadHub(sigungu5));
}

/** 동 묶음 하나 — 동 페이지 있는 동은 세대수 큰 순 12곳 + 그 동 전체 링크, 작은 동은 전부(결정 35) */
function DongGroup({ sigungu5, d }: { sigungu5: string; d: RegionHubDong }) {
  const page = d.has_page ? dongPagePath(sigungu5, d.dong_code) : null;
  const sorted = sortComplexes(d.complexes);
  const shown = page ? sorted.slice(0, HUB_DONG_LIMIT) : sorted;
  return (
    <section id={d.dong_code} aria-labelledby={`dong-title-${d.dong_code}`} className="space-y-2 scroll-mt-20">
      <h2 id={`dong-title-${d.dong_code}`} className="text-base font-bold text-gray-900">
        {page ? (
          <Link href={page} prefetch={false} className="text-blue-700 hover:underline">{d.dong_name}</Link>
        ) : (
          d.dong_name
        )}
        <span className="ml-2 text-xs font-normal text-gray-500">단지 {d.complex_count.toLocaleString()}곳</span>
      </h2>
      <ComplexTable complexes={shown} caption={`${d.dong_name} 아파트·오피스텔 단지`} />
      {page && (
        <p className="text-sm">
          <Link href={page} prefetch={false} className="text-blue-700 hover:underline">
            {d.dong_name} 단지 전체 {d.complex_count.toLocaleString()}곳 →
          </Link>
        </p>
      )}
    </section>
  );
}

export default async function RegionHubPage({ params }: PageProps) {
  const { sigungu5 } = await params;
  const hub = await loadHub(sigungu5);
  const basis = hubBasis(hub);
  const line = [
    `단지 ${hub.complex_count.toLocaleString()}곳`,
    `동 ${hub.dongs.length.toLocaleString()}곳`,
    basis ? `자료 기준 ${basis}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const chips = hub.dongs.map((d) => ({
    name: d.dong_name,
    href: d.has_page ? dongPagePath(hub.sigungu_code, d.dong_code) : dongAnchor(d.dong_code),
    page: d.has_page,
  }));

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <ComplexBreadcrumb crumbs={hubCrumbs(hub)} />
      <div className="space-y-1">
        <h1 className="text-lg md:text-2xl font-bold">{hubTitle(hub)}</h1>
        <p className="text-sm text-gray-600" data-testid="region-hub-line">{line}</p>
      </div>
      {hub.region_trend && <RegionTrendCard trend={hub.region_trend} />}
      <DongChips chips={chips} label={`${hub.sigungu_name} 동 목록`} />
      {hub.dongs.map((d) => (
        <DongGroup key={d.dong_code} sigungu5={hub.sigungu_code} d={d} />
      ))}
      <p className="text-xs text-gray-400">
        출처: 국토교통부 공공데이터(실거래가·공동주택 공시가격)
        {hub.region_trend?.items?.length ? ` · ${hub.region_trend.source}` : ""} · 단지 표의 범위는 대표 면적의 최근 6개월 거래
      </p>
    </div>
  );
}
