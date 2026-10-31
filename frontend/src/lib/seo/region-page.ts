/**
 * 지역 페이지(/region · 시군구 허브 · 동 페이지) 글자 — 제목·설명·메타·빵부스러기·사실 배지·정렬
 * (세션 484 PR 3c-1b, 설계 pr3c §2-2 + v2 개정 · 결정 15·19·20·33·34·35).
 * 순수 함수(DOM·네트워크 0) — 서버 페이지와 시험이 같이 쓴다. 숫자는 받은 자료에 실제로 있는 값만, 없는 항목은 문장째 뺀다.
 */
import type { Metadata } from "next";
import { formatKoreanPrice } from "@/lib/format";
import { ymDot } from "@/components/complex/consumer/consumer-format";
import type { RegionTrend } from "@/types";
import type { DongPage, RegionComplexCard, RegionHub } from "@/types/region-pages";
import { dongPagePath, regionHubPath, type Crumb } from "./complex-page";

/**
 * 지역 장 색인 스위치(v2 O7 · 결정 37) — 켜져 있다(세션 485 PR 3c-2, robots 가 /complex/ 를 연 것과 같이).
 * true = indexable 따라 index,follow / noindex,follow · regions.xml 사이트맵을 낸다.
 * false = 지역 장 셋(/region·허브·동) 전부 robots "noindex, nofollow"(링크·장은 그대로) + regions.xml 503.
 * 되돌리기 순서: ① 이것을 false 로 배포 → ② 서치콘솔에서 지역 장이 빠지는 것 확인 → ③ 그 뒤에야 robots·REGION_PAGES_ENABLED.
 */
export const REGION_PAGES_INDEX = true;

/** 전국 목록 주소 */
export const REGION_INDEX_PATH = "/region";

/** 허브의 동 묶음 하나에 보이는 단지 수 — 동 페이지가 있는 동만(결정 35). 작은 동은 전부 */
export const HUB_DONG_LIMIT = 12;

/** 옛 시군구 코드 → 새 코드(행정구역 개편 때 한 줄씩 — 결정 20). 페이지가 permanentRedirect */
export const REGION_CODE_REDIRECTS: Record<string, string> = {};

// ── 이름 ───────────────────────────────────────────────────────────────

/** 시군구 화면 이름 — 이름표의 시군구가 빈 줄(세종)이면 "세종시"(백엔드 region_display_name 과 같은 규칙) */
export function sigunguLabel(sido: string, sigungu: string): string {
  return sigungu || `${sido}시`;
}

/**
 * "{시도} {시군구}" — 같은 이름 구(중구·동구…)가 여러 시도에 있어 시도를 늘 붙인다(미분양 교훈).
 * 단 시군구가 시도와 같거나 "{시도}시"(세종 "세종시"·제주 "제주시")면 한 번만(v2 Y7). "부산진구"처럼 시도로 시작할 뿐인 이름은 그대로 붙인다.
 */
export function sidoRedundant(sido: string | null | undefined, sigungu: string): boolean {
  return !sido || sido === sigungu || sigungu === `${sido}시`;
}

export function regionName(sido: string | null | undefined, sigungu: string): string {
  return sidoRedundant(sido, sigungu) ? sigungu : `${sido} ${sigungu}`;
}

/** 전국 목록 시도 순서(행정 표준 순) — 이름표에 없는 시도가 생기면 맨 뒤 */
export const SIDO_ORDER = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];

export interface RegionIndexGroup {
  sido: string;
  items: { code: string; name: string }[];
}

/**
 * 전국 목록 — 이름표(코드 → 시도·시군구) 전부를 시도별로 묶는다(결정 34 · 메인 결정 10-28 ⓐ: 백엔드 호출 없이 정적, 253곳 전부).
 * 색인 밖 허브(영양군)도 손님용 링크는 둔다(그 허브 자체가 noindex). 단지 0곳 시군구가 생기면 그 링크는 허브 404(notFound).
 * 시도 안 순서 = 코드 순.
 */
export function regionIndexGroups(codes: Record<string, { sido: string; sigungu: string }>): RegionIndexGroup[] {
  const by = new Map<string, { code: string; name: string }[]>();
  for (const code of Object.keys(codes).sort()) {
    const { sido, sigungu } = codes[code];
    if (!by.has(sido)) by.set(sido, []);
    by.get(sido)!.push({ code, name: sigunguLabel(sido, sigungu) });
  }
  const rank = (s: string) => (SIDO_ORDER.includes(s) ? SIDO_ORDER.indexOf(s) : SIDO_ORDER.length);
  return [...by.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0], "ko"))
    .map(([sido, items]) => ({ sido, items }));
}

// ── 제목 ───────────────────────────────────────────────────────────────

export const INDEX_TITLE = "전국 아파트 실거래가·공시가격 — 시도·시군구별";

export function indexTitle(): string {
  return INDEX_TITLE;
}

export function hubTitle(h: Pick<RegionHub, "sido" | "sigungu_name">): string {
  return `${regionName(h.sido, h.sigungu_name)} 아파트 실거래가·공시가격`;
}

export function dongTitle(d: Pick<DongPage, "sido" | "sigungu_name" | "dong_name">): string {
  return `${regionName(d.sido, d.sigungu_name)} ${d.dong_name} 아파트 실거래가·공시가격`;
}

// ── 설명 ───────────────────────────────────────────────────────────────

/** 지역 추이에서 중위 매매가가 있는 마지막 달 — 없으면 null(지역 통계 중위는 예외로 보인다: 부동산원 공식 통계) */
export function latestRegionSale(trend: RegionTrend | null | undefined): { period: string; value: number } | null {
  const items = trend?.items ?? [];
  for (let i = items.length - 1; i >= 0; i--) {
    const v = items[i].sale_price_median;
    if (v != null) return { period: items[i].period, value: v };
  }
  return null;
}

/** 허브 '자료 기준' — 지역 추이의 마지막 달("2026.09"), 없으면 null */
export function hubBasis(h: Pick<RegionHub, "region_trend">): string | null {
  const items = h.region_trend?.items ?? [];
  return items.length > 0 ? ymDot(items[items.length - 1].period) : null;
}

export function hubDescription(h: RegionHub): string {
  const name = regionName(h.sido, h.sigungu_name);
  const out = [`${name} 아파트·오피스텔 단지 ${h.complex_count.toLocaleString()}곳·${h.dongs.length.toLocaleString()}개 동.`];
  const sale = latestRegionSale(h.region_trend);
  const tail = "단지별 실거래가 범위·공시가격.";
  out.push(sale ? `최근 중위 매매가 ${formatKoreanPrice(sale.value)}(한국부동산원 ${ymDot(sale.period)}), ${tail}` : tail);
  return out.join(" ");
}

/** 대표 면적 최근 6개월 실거래 범위가 있는 단지 수 */
export function recentRangeCount(list: RegionComplexCard[]): number {
  return list.filter((c) => c.recent6_min != null && c.recent6_max != null).length;
}

export function dongDescription(d: DongPage): string {
  const name = `${regionName(d.sido, d.sigungu_name)} ${d.dong_name}`;
  const k = recentRangeCount(d.complexes);
  const head = `${name} 아파트·오피스텔 단지 ${d.complexes.length.toLocaleString()}곳${k > 0 ? `, 실거래 범위 있는 단지 ${k.toLocaleString()}곳` : ""}.`;
  return `${head} 단지별 실거래가 범위·공시가격·동네 통계.`;
}

// ── 메타 ───────────────────────────────────────────────────────────────

/** 색인 스위치가 꺼져 있으면 noindex,nofollow(결정 37) · 켜져 있으면 indexable 따라 index,follow / noindex,follow */
export function regionRobots(indexable: boolean, indexSwitch: boolean = REGION_PAGES_INDEX): Metadata["robots"] {
  if (!indexSwitch) return { index: false, follow: false };
  return indexable ? { index: true, follow: true } : { index: false, follow: true };
}

function pageMeta(title: string, description: string, url: string, robots: Metadata["robots"]): Metadata {
  return {
    title,
    description,
    alternates: { canonical: url },
    // openGraph 를 직접 쓰면 루트 opengraph-image·site_name·locale 상속이 끊긴다 → 명시(seo-metadata 룰 2 · complex-page.ts 와 같이)
    openGraph: {
      type: "website",
      siteName: "2u부동산",
      locale: "ko_KR",
      title,
      description,
      url,
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "2u부동산" }],
    },
    twitter: { card: "summary_large_image", title, description },
    robots,
  };
}

export function indexMetadata(index: boolean = REGION_PAGES_INDEX): Metadata {
  return pageMeta(
    INDEX_TITLE,
    "전국 시도·시군구별 아파트 단지의 실거래가 범위·공시가격·동네 통계를 누구나 무료로.",
    REGION_INDEX_PATH,
    regionRobots(true, index),
  );
}

export function hubMetadata(h: RegionHub, index: boolean = REGION_PAGES_INDEX): Metadata {
  return pageMeta(hubTitle(h), hubDescription(h), regionHubPath(h.sigungu_code), regionRobots(h.indexable, index));
}

export function dongMetadata(d: DongPage, index: boolean = REGION_PAGES_INDEX): Metadata {
  return pageMeta(dongTitle(d), dongDescription(d), dongPagePath(d.sigungu_code, d.dong_code), regionRobots(d.indexable, index));
}

// ── 빵부스러기 ──────────────────────────────────────────────────────────

/** 홈 › 전국 */
export function indexCrumbs(): Crumb[] {
  return [
    { name: "홈", href: "/" },
    { name: "전국", href: REGION_INDEX_PATH },
  ];
}

/** 홈 › 시도(글자 — 시도 페이지 없음) › 시군구 */
export function hubCrumbs(h: Pick<RegionHub, "sido" | "sigungu_code" | "sigungu_name">): Crumb[] {
  const out: Crumb[] = [{ name: "홈", href: "/" }];
  // 시도 단계 = 제목과 같은 규칙(세종: 홈 › 세종시)
  if (!sidoRedundant(h.sido, h.sigungu_name)) out.push({ name: h.sido!, href: null });
  out.push({ name: h.sigungu_name, href: regionHubPath(h.sigungu_code) });
  return out;
}

/** 홈 › 시도 › 시군구(허브 링크) › 동 */
export function dongCrumbs(d: Pick<DongPage, "sido" | "sigungu_code" | "sigungu_name" | "dong_code" | "dong_name">): Crumb[] {
  return [...hubCrumbs(d), { name: d.dong_name, href: dongPagePath(d.sigungu_code, d.dong_code) }];
}

// ── 단지 표 ─────────────────────────────────────────────────────────────

/**
 * 사실 배지 — 등급 글자(A/B/C)는 화면에 안 보인다(결정 33). 글자는 결정 38: A = 최근 2년 실거래 · B = 실거래 없음 ·
 * C = 빈칸(배지 요소를 그리지 않는다). 글자 상수는 여기 한 곳
 */
export const GRADE_LABELS: Record<RegionComplexCard["grade"], string> = {
  A: "최근 2년 실거래",
  B: "실거래 없음",
  C: "",
};

export function gradeLabel(grade: RegionComplexCard["grade"]): string {
  return GRADE_LABELS[grade];
}

/** 같은 장 안 동 묶음 앵커 */
export function dongAnchor(dong10: string): string {
  return `#${dong10}`;
}

/** 세대수 큰 순(없으면 뒤) → 같으면 이름 순. 원본은 그대로 둔다 */
export function sortComplexes(list: RegionComplexCard[]): RegionComplexCard[] {
  return [...list].sort((a, b) => {
    const ha = a.household_count;
    const hb = b.household_count;
    if (ha != null && hb != null && ha !== hb) return hb - ha;
    if (ha == null && hb != null) return 1;
    if (ha != null && hb == null) return -1;
    return a.name.localeCompare(b.name, "ko");
  });
}
