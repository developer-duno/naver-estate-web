import "server-only";

/**
 * 단지·지역 사이트맵 응답 만들기(세션 485 PR 3c-2, 설계 pr3c §2-4 + v2 R1·O7·Y8).
 *
 * route 파일(`app/sitemaps/*.xml/route.ts`)은 GET 만 내보내고 여기를 부른다 — route 는 정해진 이름 밖을 내보낼 수 없어서.
 * - 200: `<loc>` 만(lastmod 없음 — O6) · CDN 하루 캐시 머리(route 는 force-dynamic 이라 빌드 때 그리지 않는다 — R1)
 * - 실패(네트워크·비 2xx·모양 이상)·빈 목록: 503 + Retry-After + no-store — 빈 사이트맵 200 을 굳히지 않는다(error-propagation)
 * - 한 파일 상한(50,000) 초과: 500 + no-store + 로그 한 줄 — 그때는 파일을 나눠야 한다
 */
import { COMPLEX_NO_RE, ssrKeyHeaders } from "./public-summary";
import { fetchSitemapCodes, DONG10_RE, SIGUNGU5_RE } from "./region-pages";
import { SITE_URL } from "@/lib/constants";
import { REGION_PAGES_ENABLED, complexPath, dongPagePath, regionHubPath } from "@/lib/seo/complex-page";
import { REGION_INDEX_PATH, REGION_PAGES_INDEX } from "@/lib/seo/region-page";

/** 사이트맵 한 파일에 넣을 수 있는 주소 수 상한(sitemaps.org 규약) */
export const SITEMAP_URL_LIMIT = 50000;

/** 200 응답 캐시 머리 — CDN 하루, 만료 뒤 한 시간은 옛것을 주며 새로 그린다 */
export const SITEMAP_CACHE_OK = "public, s-maxage=86400, stale-while-revalidate=3600";

/** 실패 응답 뒤 다시 와 볼 시각(초) */
export const SITEMAP_RETRY_AFTER_SEC = 3600;

const XML_TYPE = "application/xml; charset=utf-8";

const XML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}

/** 경로 목록 → `<urlset>` 글자(주소 앞에 SITE_URL) */
export function urlsetXml(paths: string[]): string {
  const rows = paths.map((p) => `<url><loc>${escapeXml(`${SITE_URL}${p}`)}</loc></url>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...rows,
    "</urlset>",
    "",
  ].join("\n");
}

function unavailable(): Response {
  return new Response(null, {
    status: 503,
    headers: { "Retry-After": String(SITEMAP_RETRY_AFTER_SEC), "Cache-Control": "no-store" },
  });
}

/** 경로 목록 → 응답(비었으면 503 · 상한 넘으면 500 · 아니면 200 XML) */
function sitemapResponse(name: string, paths: string[]): Response {
  if (paths.length === 0) return unavailable();
  if (paths.length > SITEMAP_URL_LIMIT) {
    console.error(`[sitemap] ${name} 주소 ${paths.length}개가 한 파일 상한 ${SITEMAP_URL_LIMIT}개를 넘었어요 — 파일을 나눠야 해요`);
    return new Response(null, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  return new Response(urlsetXml(paths), {
    status: 200,
    headers: { "Content-Type": XML_TYPE, "Cache-Control": SITEMAP_CACHE_OK },
  });
}

function isStringArray(v: unknown, re: RegExp): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string" && re.test(x));
}

/** 등급 A 단지 사이트맵 */
export async function complexesSitemapResponse(): Promise<Response> {
  const base = process.env.NEXT_PUBLIC_API_URL || "";
  if (!base) return unavailable();
  let items: unknown;
  try {
    const res = await fetch(`${base}/api/complexes/sitemap-ids?grade=A`, {
      headers: ssrKeyHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return unavailable();
    items = ((await res.json()) as { items?: unknown })?.items;
  } catch {
    return unavailable();
  }
  if (!isStringArray(items, COMPLEX_NO_RE)) return unavailable();
  return sitemapResponse("complexes", items.map(complexPath));
}

export interface RegionSitemapSwitches {
  enabled: boolean;
  index: boolean;
}

/** 지역 사이트맵 — /region + 시군구 허브 + 동 페이지. 지역 장이 꺼졌거나 색인 스위치가 꺼져 있으면 503(v2 O7) */
export async function regionsSitemapResponse(
  switches: RegionSitemapSwitches = { enabled: REGION_PAGES_ENABLED, index: REGION_PAGES_INDEX },
): Promise<Response> {
  if (!switches.enabled || !switches.index) return unavailable();
  let hubs: unknown;
  let dongs: unknown;
  try {
    const codes = await fetchSitemapCodes();
    hubs = codes?.hubs;
    dongs = codes?.dongs;
  } catch {
    return unavailable();
  }
  if (!isStringArray(hubs, SIGUNGU5_RE) || !isStringArray(dongs, DONG10_RE)) return unavailable();
  if (hubs.length === 0 && dongs.length === 0) return unavailable();
  const paths = [
    REGION_INDEX_PATH,
    ...hubs.map(regionHubPath),
    ...dongs.map((d) => dongPagePath(d.slice(0, 5), d)),
  ];
  return sitemapResponse("regions", paths);
}
