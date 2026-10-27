/**
 * 단지 화면 서버 껍데기 — ISR(세션 483 PR 3b, 설계 v2 §4-1 · O4·O7 · 결정 13).
 *
 * 빌드 때는 그리지 않고(generateStaticParams 빈 배열) 첫 요청 때 그려 하루(revalidate) 저장한다.
 * 모든 방문자에게 같은 HTML(쿠키·세션 안 읽음 — 클로킹 0): 빵부스러기 · h1 단지명 · '한눈에 보기' · 같은 동 다른 단지.
 * 그 아래 로그인 분기 화면은 클라이언트(ComplexClientView)가 그린다.
 *
 * 번호가 숫자 1~8자리가 아니면 백엔드를 부르지 않고 404 · 백엔드 404 면 404 · 429·5xx 는 throw(404 로 굳히지 않는다) —
 * 판정은 lib/server/public-summary.ts loadSummary 한 곳.
 */
import { Suspense } from "react";
import type { Metadata } from "next";
import { clientSeedOf, loadSummary } from "@/lib/server/public-summary";
import { complexCrumbs, complexMetadata } from "@/lib/seo/complex-page";
import ComplexBreadcrumb from "@/components/complex/public/ComplexBreadcrumb";
import ComplexGlance from "@/components/complex/public/ComplexGlance";
import NearbyComplexes from "@/components/complex/public/NearbyComplexes";
import { SkeletonPage } from "@/components/Skeleton";
import ComplexClientView from "./ComplexClientView";

export const revalidate = 86400;

export function generateStaticParams(): { no: string }[] {
  return [];
}

type PageProps = { params: Promise<{ no: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { no } = await params;
  return complexMetadata(await loadSummary(no));
}

export default async function ComplexPage({ params }: PageProps) {
  const { no } = await params;
  const summary = await loadSummary(no);
  const glance = <ComplexGlance summary={summary} />;
  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      <ComplexBreadcrumb crumbs={complexCrumbs(summary)} />
      {/* h1 옆 자리 — 소비자 화면의 ★·비교 버튼이 클라이언트에서 이리로 온다(ConsumerHeader TITLE_ACTIONS_ID, 승인 그림 A안) */}
      <div className="flex items-center gap-2 md:gap-3 flex-wrap">
        <h1 className="text-lg md:text-2xl font-bold">{summary.name}</h1>
        <div id="complex-title-actions" className="flex items-center gap-2" />
      </div>
      {/* 클라이언트 화면은 useSearchParams(필터 주소)를 써서 서버에서 그리지 못하고 클라이언트로 넘어간다 —
          자체 Suspense 로 그 범위를 이 칸에만 가둔다. 없으면 루트 loading.tsx 까지 넘어가 h1·요약·링크가 첫 HTML 에서
          통째로 빠진다(seo-metadata 룰 3, 세션 483 build 실측). 대기 화면에도 '한눈에 보기'를 그대로 둔다. */}
      <Suspense
        fallback={
          <div className="space-y-8">
            {glance}
            <SkeletonPage message="단지 정보를 불러오는 중..." />
          </div>
        }
      >
        <ComplexClientView complexNo={summary.complex_no} seed={clientSeedOf(summary)} glance={glance} />
      </Suspense>
      <NearbyComplexes summary={summary} />
    </div>
  );
}
