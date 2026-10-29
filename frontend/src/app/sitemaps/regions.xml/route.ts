import { regionsSitemapResponse } from "@/lib/server/sitemaps";

/**
 * 지역 사이트맵 — /sitemaps/regions.xml (세션 485 PR 3c-2). /region + 시군구 허브 + 동 페이지.
 * REGION_PAGES_ENABLED 나 REGION_PAGES_INDEX 가 false 면 503(v2 O7).
 * 요청 때 그린다(v2 R1): revalidate 를 두면 빌드 때 미리 그려져 실패 응답이 굳을 수 있다 — 캐시는 응답 머리(CDN 하루)로.
 */
export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return regionsSitemapResponse();
}
