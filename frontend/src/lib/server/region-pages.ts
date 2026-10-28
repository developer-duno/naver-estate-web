import "server-only";

/**
 * 지역 페이지 재료 받기 — 서버 렌더(ISR) 전용(세션 484 PR 3c-1b, 설계 pr3c §2-2 + v2 O7·실패 길).
 * public-summary.ts 와 같은 틀: 서버 렌더 열쇠 머리 · next.revalidate 하루 · 404 → null · 그 밖 실패(429·5xx·네트워크) → throw
 * (진짜 지역이 404 로 하루 굳지 않게). 모양 검사(시군구 5자리·동 10자리·동 코드가 시군구 코드로 시작)는 백엔드 부르기 전.
 * REGION_PAGES_ENABLED=false 면 세 장(/region·허브·동) 모두 notFound — 플래그를 되돌리면 장도 같이 사라진다(v2 O7).
 */
import { notFound, permanentRedirect } from "next/navigation";
import { REGION_PAGES_ENABLED, regionHubPath } from "@/lib/seo/complex-page";
import { REGION_CODES } from "@/lib/seo/region-codes";
import { REGION_CODE_REDIRECTS, dongAnchor, regionIndexGroups, type RegionIndexGroup } from "@/lib/seo/region-page";
import type { DongPage, RegionHub, RegionSitemapCodes } from "@/types/region-pages";
import { ssrKeyHeaders } from "./public-summary";

export const SIGUNGU5_RE = /^\d{5}$/;
export const DONG10_RE = /^\d{10}$/;

/** ISR·데이터 캐시 수명(초) — 페이지 revalidate 와 같은 값 */
export const REGION_REVALIDATE_SEC = 86400;

function apiBase(): string {
  const base = process.env.NEXT_PUBLIC_API_URL || "";
  if (!base) throw new Error("백엔드 주소가 없어 지역 자료를 받지 못했어요");
  return base;
}

async function getJson<T>(path: string, what: string): Promise<T | null> {
  const res = await fetch(`${apiBase()}${path}`, {
    headers: ssrKeyHeaders(),
    next: { revalidate: REGION_REVALIDATE_SEC },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${what} (HTTP ${res.status})`);
  return (await res.json()) as T;
}

/** 사이트맵용 코드(PR 3c-2 사이트맵이 쓴다) — 404 도 실패(빈 목록을 굳히지 않는다) */
export async function fetchSitemapCodes(): Promise<RegionSitemapCodes> {
  const codes = await getJson<RegionSitemapCodes>("/api/regions/sitemap-codes", "지역 목록을 받지 못했어요");
  if (!codes) throw new Error("지역 목록을 받지 못했어요 (HTTP 404)");
  return codes;
}

export async function fetchRegionHub(sigungu5: string): Promise<RegionHub | null> {
  return getJson<RegionHub>(`/api/regions/${encodeURIComponent(sigungu5)}/hub`, "시군구 자료를 받지 못했어요");
}

export async function fetchDongPage(sigungu5: string, dong10: string): Promise<DongPage | null> {
  return getJson<DongPage>(
    `/api/regions/${encodeURIComponent(sigungu5)}/dongs/${encodeURIComponent(dong10)}`,
    "동 자료를 받지 못했어요",
  );
}

/** 동 코드 모양이 맞고 그 시군구 안인가 */
export function isDongOf(sigungu5: string, dong10: string): boolean {
  return SIGUNGU5_RE.test(sigungu5) && DONG10_RE.test(dong10) && dong10.startsWith(sigungu5);
}

/**
 * /region 목록 재료 — 플래그 false 면 notFound. 이름표 253곳 전부를 시도별로(백엔드 호출 0 — 빌드 때 그려도 백엔드에 기대지 않는다,
 * 메인 결정 10-28 ⓐ).
 */
export function loadRegionIndex(enabled: boolean = REGION_PAGES_ENABLED): RegionIndexGroup[] {
  if (!enabled) notFound();
  return regionIndexGroups(REGION_CODES);
}

/** 허브 재료 — 플래그 false·모양 아님·없는 시군구 = notFound · 옛 코드 = 새 허브로 permanentRedirect(결정 20) */
export async function loadHub(
  sigungu5: string,
  enabled: boolean = REGION_PAGES_ENABLED,
  redirects: Record<string, string> = REGION_CODE_REDIRECTS,
): Promise<RegionHub> {
  if (!enabled) notFound();
  if (!SIGUNGU5_RE.test(sigungu5)) notFound();
  const moved = redirects[sigungu5];
  if (moved) permanentRedirect(regionHubPath(moved));
  const hub = await fetchRegionHub(sigungu5);
  if (!hub) notFound();
  return hub;
}

/**
 * 동 페이지 재료 — 플래그 false·모양 아님(동 코드가 시군구 코드로 시작 안 함 포함) = notFound.
 * 백엔드 404 면: 그 동이 허브에 있으면(단지 수가 줄어 동 페이지만 사라진 옛 주소) 허브 안 그 동 묶음으로 permanentRedirect,
 * 허브에도 없는 동(없는 코드)·없는 시군구면 notFound(v2 실패 길).
 */
export async function loadDong(sigungu5: string, dong10: string, enabled: boolean = REGION_PAGES_ENABLED): Promise<DongPage> {
  if (!enabled) notFound();
  if (!isDongOf(sigungu5, dong10)) notFound();
  const page = await fetchDongPage(sigungu5, dong10);
  if (page) return page;
  const hub = await fetchRegionHub(sigungu5);
  if (hub?.dongs.some((d) => d.dong_code === dong10)) {
    permanentRedirect(`${regionHubPath(sigungu5)}${dongAnchor(dong10)}`);
  }
  notFound();
}
