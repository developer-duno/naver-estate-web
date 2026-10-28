/**
 * 동 페이지 — ISR 서버 렌더(세션 484 PR 3c-1b, 설계 pr3c §2-2 + v2 실패 길 · 결정 15·19·30·33 · 목업 ②).
 *
 * 빌드 때는 그리지 않고 첫 요청 때 그려 하루 저장한다. 쿠키·세션 안 읽음.
 * 본문 = 빵부스러기(시군구 = 허브 링크) · h1 · 한 줄 · 단지 표(전부, 준공 포함) · 행정동별 동네 정보 · 다른 동 칩 + 시군구 전체 보기.
 * 동 페이지가 사라진 옛 주소(그 동이 허브엔 있음) = 허브 안 그 동 묶음으로 308 · 그 밖 = 404 — 판정은 lib/server/region-pages.ts loadDong.
 */
import Link from "next/link";
import type { Metadata } from "next";
import { loadDong } from "@/lib/server/region-pages";
import { dongPagePath, regionHubPath } from "@/lib/seo/complex-page";
import {
  dongCrumbs,
  dongMetadata,
  dongTitle,
  recentRangeCount,
  sortComplexes,
} from "@/lib/seo/region-page";
import ComplexBreadcrumb from "@/components/complex/public/ComplexBreadcrumb";
import ComplexTable from "@/components/region/ComplexTable";
import DongChips from "@/components/region/DongChips";
import { NeighborhoodFull } from "@/components/complex/consumer/NeighborhoodSection";

export const revalidate = 86400;

export function generateStaticParams(): { sigungu5: string; dong10: string }[] {
  return [];
}

type PageProps = { params: Promise<{ sigungu5: string; dong10: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { sigungu5, dong10 } = await params;
  return dongMetadata(await loadDong(sigungu5, dong10));
}

export default async function DongPageView({ params }: PageProps) {
  const { sigungu5, dong10 } = await params;
  const d = await loadDong(sigungu5, dong10);
  const k = recentRangeCount(d.complexes);
  const line = [`단지 ${d.complexes.length.toLocaleString()}곳`, k > 0 ? `실거래 범위 있는 단지 ${k.toLocaleString()}곳` : null]
    .filter(Boolean)
    .join(" · ");
  const siblings = d.sibling_dongs.map((s) => ({ name: s.dong_name, href: dongPagePath(d.sigungu_code, s.dong_code), page: true }));

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <ComplexBreadcrumb crumbs={dongCrumbs(d)} />
      <div className="space-y-1">
        <h1 className="text-lg md:text-2xl font-bold">{dongTitle(d)}</h1>
        <p className="text-sm text-gray-600" data-testid="region-dong-line">{line}</p>
      </div>
      <ComplexTable complexes={sortComplexes(d.complexes)} caption={`${d.dong_name} 아파트 단지`} showYear />
      {d.neighborhood.length > 0 && (
        <section aria-labelledby="dong-neighborhood" className="space-y-3">
          <h2 id="dong-neighborhood" className="text-base font-bold text-gray-900">{d.dong_name} 동네 정보</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {d.neighborhood.map((n) => (
              <div key={n.emd_cd} className="rounded-lg border border-gray-200 bg-white p-4" data-testid="dong-neighborhood-card">
                <NeighborhoodFull n={n} />
              </div>
            ))}
          </div>
        </section>
      )}
      <section aria-labelledby="dong-others" className="space-y-2">
        <h2 id="dong-others" className="text-base font-bold text-gray-900">{d.sigungu_name} 다른 동</h2>
        <DongChips chips={siblings} label={`${d.sigungu_name} 다른 동`} />
        <p className="text-sm">
          <Link href={regionHubPath(d.sigungu_code)} prefetch={false} className="text-blue-700 hover:underline">
            {d.sigungu_name} 전체 보기
          </Link>
        </p>
      </section>
      <p className="text-xs text-gray-400">
        출처: 국토교통부 공공데이터(실거래가·공동주택 공시가격) · 단지 표의 범위는 대표 면적의 최근 6개월 거래
      </p>
    </div>
  );
}
