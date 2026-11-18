/**
 * 동 페이지 — ISR 서버 렌더(세션 484 PR 3c-1b, 설계 pr3c §2-2 + v2 실패 길 · 결정 15·19·30·33 · 목업 ②).
 *
 * 빌드 때는 그리지 않고 첫 요청 때 그려 하루 저장한다. 쿠키·세션 안 읽음.
 * 본문 = 남색 띠(빵부스러기(시군구 = 허브 링크) · h1 · 한 줄) · 단지 카드(띠에 걸침 · 준공 포함) · 행정동별 동네 정보 · 다른 동 칩 + 시군구 전체 보기.
 * 새 틀(세션 526 B40 PR 2b · E13): 단지가 많으면 20곳까지 표 하나 + 나머지는 <details> 안 둘째 표(스크립트 0 · 첫 HTML 에 전부).
 * 동 페이지가 사라진 옛 주소(그 동이 허브엔 있음) = 허브 안 그 동 묶음으로 307(임시 — 되살아날 수 있다) · 그 밖 = 404 — 판정은 lib/server/region-pages.ts loadDong.
 */
import Link from "next/link";
import type { Metadata } from "next";
import { loadDong, resolveDong } from "@/lib/server/region-pages";
import { dongPagePath, regionHubPath } from "@/lib/seo/complex-page";
import {
  dongCrumbs,
  dongMetadata,
  dongTitle,
  recentRangeCount,
  sortComplexes,
} from "@/lib/seo/region-page";
import BrandCard from "@/components/brand/BrandCard";
import BrandPage from "@/components/brand/BrandPage";
import PageBand from "@/components/brand/PageBand";
import ComplexBreadcrumb from "@/components/complex/public/ComplexBreadcrumb";
import ComplexTable from "@/components/region/ComplexTable";
import DongChips from "@/components/region/DongChips";
import { NeighborhoodFull } from "@/components/complex/consumer/NeighborhoodSection";

export const revalidate = 86400;

/** 동 장에서 처음 펼쳐 두는 단지 수 — 넘으면 「나머지 N곳 보기」(E13 · T10) */
const DONG_FIRST_ROWS = 20;

export function generateStaticParams(): { sigungu5: string; dong10: string }[] {
  return [];
}

type PageProps = { params: Promise<{ sigungu5: string; dong10: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { sigungu5, dong10 } = await params;
  const r = await resolveDong(sigungu5, dong10);
  // 이동(307)·404 는 페이지 본문 한 곳에서만 던진다(보완 F11) — 그 경우 메타는 최소(색인·따라가기 안 함)만.
  // 같은 요청의 판정은 cache 로 한 번만(loadDong 도 기본값이면 인자 2개로 부른다). 첫 요청 location 두 줄은 원인 미상 — region-pages.ts 주석.
  if (r.kind !== "page") return { robots: { index: false, follow: false } };
  return dongMetadata(r.page);
}

export default async function DongPageView({ params }: PageProps) {
  const { sigungu5, dong10 } = await params;
  const d = await loadDong(sigungu5, dong10);
  const k = recentRangeCount(d.complexes);
  const line = [`단지 ${d.complexes.length.toLocaleString()}곳`, k > 0 ? `실거래 범위 있는 단지 ${k.toLocaleString()}곳` : null]
    .filter(Boolean)
    .join(" · ");
  const siblings = d.sibling_dongs.map((s) => ({ name: s.dong_name, href: dongPagePath(d.sigungu_code, s.dong_code) }));
  const sorted = sortComplexes(d.complexes);
  const first = sorted.slice(0, DONG_FIRST_ROWS);
  const rest = sorted.slice(DONG_FIRST_ROWS);
  const caption = `${d.dong_name} 아파트·오피스텔 단지`;

  return (
    <BrandPage>
      <PageBand
        overlap
        innerClassName="mx-auto max-w-5xl px-4"
        eyebrow={<ComplexBreadcrumb crumbs={dongCrumbs(d)} tone="navy" />}
        title={dongTitle(d)}
        description={<span data-testid="region-dong-line">{line}</span>}
      />
      <div className="mx-auto max-w-5xl space-y-5 px-4 pb-6">
        {/* 띠에 걸치는 첫 요소 = 단지 카드 */}
        <BrandCard className="-mt-16 space-y-2 p-4 sm:p-5" data-testid="dong-complexes">
          <ComplexTable complexes={first} caption={caption} showYear />
          {rest.length > 0 && (
            <details>
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center rounded-lg border border-brand-line text-sm font-bold text-brand-navy hover:bg-brand-bg [&::-webkit-details-marker]:hidden">
                나머지 {rest.length.toLocaleString()}곳 보기
              </summary>
              <div className="mt-2">
                <ComplexTable complexes={rest} caption={`${caption} — 나머지`} showYear />
              </div>
            </details>
          )}
        </BrandCard>
        {d.neighborhood.length > 0 && (
          <section aria-labelledby="dong-neighborhood" className="space-y-3">
            <h2 id="dong-neighborhood" className="text-[15px] font-black text-brand-navy">{d.dong_name} 동네 정보</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {d.neighborhood.map((n) => (
                <BrandCard key={n.emd_cd} className="p-4 sm:p-5" data-testid="dong-neighborhood-card">
                  <NeighborhoodFull n={n} />
                </BrandCard>
              ))}
            </div>
          </section>
        )}
        <BrandCard as="section" aria-labelledby="dong-others" className="space-y-3 p-4 sm:p-5">
          <h2 id="dong-others" className="text-[15px] font-black text-brand-navy">{d.sigungu_name} 다른 동</h2>
          <DongChips chips={siblings} label={`${d.sigungu_name} 다른 동`} />
          <p className="text-sm">
            <Link href={regionHubPath(d.sigungu_code)} prefetch={false} className="font-bold text-brand-orange-text hover:underline">
              {d.sigungu_name} 전체 보기
            </Link>
          </p>
        </BrandCard>
        <p className="text-xs text-brand-muted">
          출처: 국토교통부 공공데이터(실거래가·공동주택 공시가격) · 단지 표의 범위는 대표 면적의 최근 6개월 거래
        </p>
      </div>
    </BrandPage>
  );
}
