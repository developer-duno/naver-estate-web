import { complexesSitemapResponse } from "@/lib/server/sitemaps";

/**
 * 단지 사이트맵 — /sitemaps/complexes.xml (세션 485 PR 3c-2). 등급 A 단지만, `<loc>` 만.
 * 요청 때 그린다(v2 R1): revalidate 를 두면 빌드 때 미리 그려져 실패 응답이 굳을 수 있다 — 캐시는 응답 머리(CDN 하루)로.
 */
export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return complexesSitemapResponse();
}
