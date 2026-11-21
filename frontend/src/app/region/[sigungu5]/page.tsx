/**
 * 시군구 허브 — ISR 서버 렌더(세션 484 PR 3c-1b, 설계 pr3c §2-2 + v2 · 결정 15·19·20·33 · 목업 ①).
 *
 * 빌드 때는 그리지 않고(generateStaticParams 빈 배열) 첫 요청 때 그려 하루 저장한다. 쿠키·세션 안 읽음(모든 방문자 같은 HTML).
 * 본문 = 남색 띠(빵부스러기 · h1 · 한 줄) · 2년 흐름 카드(띠에 걸침) · 동 칩 · 동별 단지 카드(동 페이지 있는 동은 12곳 + 전체 링크) · 출처.
 * 새 틀(세션 526 B40 PR 2b · 👤 11-18 결정 2): 칩을 누르면 그 동 카드만 보인다(DongTabs) — 첫 HTML 엔 동 묶음 전부(숨김 0).
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
import BrandCard from "@/components/brand/BrandCard";
import BrandPage from "@/components/brand/BrandPage";
import PageBand from "@/components/brand/PageBand";
import ComplexBreadcrumb from "@/components/complex/public/ComplexBreadcrumb";
import ComplexTable from "@/components/region/ComplexTable";
import DongTabs from "@/components/region/DongTabs";
import RegionTrendCard, { hasRegionTrend } from "@/components/region/RegionTrendCard";
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

/** 동 묶음 하나 — 동 페이지 있는 동은 거래 있는 단지 먼저 12곳 + 그 동 전체 링크, 작은 동은 전부 */
function DongGroup({ sigungu5, d }: { sigungu5: string; d: RegionHubDong }) {
  const page = d.has_page ? dongPagePath(sigungu5, d.dong_code) : null;
  const sorted = sortComplexes(d.complexes);
  const shown = page ? sorted.slice(0, HUB_DONG_LIMIT) : sorted;
  return (
    <BrandCard
      as="section"
      id={d.dong_code}
      data-dong-group=""
      aria-labelledby={`dong-title-${d.dong_code}`}
      className="scroll-mt-20 space-y-2 p-4 sm:p-5"
    >
      <h2 id={`dong-title-${d.dong_code}`} className="text-[15px] font-black text-brand-navy">
        {page ? (
          <Link href={page} prefetch={false} className="hover:underline">{d.dong_name}</Link>
        ) : (
          d.dong_name
        )}
        <span className="font-normal text-brand-muted"> · 단지 {d.complex_count.toLocaleString()}곳</span>
      </h2>
      <ComplexTable complexes={shown} caption={`${d.dong_name} 아파트·오피스텔 단지`} />
      {page && (
        <Link
          href={page}
          prefetch={false}
          className="flex min-h-11 w-full items-center justify-center rounded-lg border border-brand-line text-sm font-bold text-brand-navy hover:bg-brand-bg"
        >
          {d.dong_name} 단지 전체 {d.complex_count.toLocaleString()}곳 →
        </Link>
      )}
    </BrandCard>
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
  const tabs = hub.dongs.map((d) => ({ code: d.dong_code, name: d.dong_name, count: d.complex_count, href: dongAnchor(d.dong_code) }));
  // 띠에 걸치는 첫 요소 = 2년 흐름 카드 — 없으면 띠를 걸치지 않고 동 칩이 띠 바로 아래 첫 요소
  const trend = hub.region_trend && hasRegionTrend(hub.region_trend) ? hub.region_trend : null;

  return (
    <BrandPage>
      <PageBand
        overlap={!!trend}
        innerClassName="mx-auto max-w-5xl px-4"
        eyebrow={<ComplexBreadcrumb crumbs={hubCrumbs(hub)} tone="navy" />}
        title={hubTitle(hub)}
        description={<span data-testid="region-hub-line">{line}</span>}
      />
      <div className={`mx-auto max-w-5xl space-y-5 px-4 pb-6 ${trend ? "" : "pt-5"}`}>
        {trend && (
          <div className="-mt-16">
            <RegionTrendCard trend={trend} />
          </div>
        )}
        <DongTabs label={`${hub.sigungu_name} 동 목록`} tabs={tabs}>
          {hub.dongs.map((d) => (
            <DongGroup key={d.dong_code} sigungu5={hub.sigungu_code} d={d} />
          ))}
        </DongTabs>
        <p className="text-xs text-brand-muted">
          출처: 국토교통부 공공데이터(실거래가·공동주택 공시가격)
          {hub.region_trend?.items?.length ? ` · ${hub.region_trend.source}` : ""} · 단지 표의 범위는 대표 면적의 최근 6개월 거래
        </p>
      </div>
    </BrandPage>
  );
}
