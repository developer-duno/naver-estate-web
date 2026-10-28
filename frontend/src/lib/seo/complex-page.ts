/**
 * 단지 화면 서버 렌더 글자 — 제목·설명·메타·빵부스러기·JSON-LD (세션 483 PR 3b, 설계 v2 §4-1·4-2).
 * 순수 함수(DOM·네트워크 0) — 서버 페이지와 시험이 같이 쓴다. 숫자는 공개 요약에 실제로 있는 값만 쓰고,
 * 없는 항목은 문장째 뺀다(빈 값·부풀린 문장 금지 — 결정 14).
 */
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/constants";
import { formatKoreanPrice } from "@/lib/format";
import {
  kaptCostText,
  officialForArea,
  priceRangeText,
  representativeOfficial,
  wonToManwon,
} from "@/components/complex/consumer/consumer-format";
import type { OfficialPriceItem } from "@/types";
import type { PublicSummary, PublicSummaryAreaRange } from "@/types/public-summary";

/**
 * 지역 페이지(/region/*)가 열렸나 — 세션 484 PR 3c-1b 에서 true. false 면 지역 이름은 글자만(404 로 가는 링크 금지)이고
 * 지역 장 셋(/region·허브·동)도 notFound(v2 O7 — 플래그를 되돌리면 장도 같이 사라진다). 색인만 끄는 스위치 = region-page.ts REGION_PAGES_INDEX.
 */
export const REGION_PAGES_ENABLED = true;

export function complexPath(no: string): string {
  return `/complex/${no}`;
}

export function regionHubPath(sigungu5: string): string {
  return `/region/${sigungu5}`;
}

export function dongPagePath(sigungu5: string, dong10: string): string {
  return `/region/${sigungu5}/${dong10}`;
}

// ── 제목 ───────────────────────────────────────────────────────────────

/** 같은 지역 안 같은 이름 단지와 가르는 꼬리 — 판정은 백엔드(title_suffix) 한 곳 */
export function titleTail(s: PublicSummary): string {
  const dong = s.breadcrumb?.dong_name;
  if (!dong) return "";
  switch (s.title_suffix) {
    case "dong":
      return ` (${dong})`;
    case "dong_households":
      return s.household_count != null ? ` (${dong} ${s.household_count.toLocaleString()}세대)` : ` (${dong})`;
    case "dong_year":
      return s.use_approve_year != null ? ` (${dong} ${s.use_approve_year}년)` : ` (${dong})`;
    case "dong_no":
      return ` (${dong} ${s.complex_no})`;
    default:
      return "";
  }
}

/**
 * 제목 단어 = 실제 있는 자료만(맹점🟡) — A: 실거래가 + (공시가격 있으면) 공시가격 / B·C: 공시가격·관리비 중 있는 것.
 * 아무것도 없으면 "단지 정보". + 꼬리. 템플릿 "%s | 2u부동산" 은 루트 layout.
 */
export function complexTitle(s: PublicSummary): string {
  const hasOfficial = (s.official_price?.items ?? []).length > 0;
  const hasKapt = s.kapt_cost != null;
  const words = s.grade === "A"
    ? ["실거래가", hasOfficial ? "공시가격" : null]
    : [hasOfficial ? "공시가격" : null, hasKapt ? "관리비" : null];
  const kind = words.filter(Boolean).join("·") || "단지 정보";
  return `${s.name} ${kind}${titleTail(s)}`;
}

// ── 대표 값(요약 표·설명 공용) ─────────────────────────────────────────────

/** 대표 면적 범위 묶음 — rep_area_key 가 있으면 그 면적, 없으면 첫 면적 */
export function repAreaRange(s: PublicSummary): PublicSummaryAreaRange | null {
  const list = s.area_ranges ?? [];
  if (s.rep_area_key != null) {
    const hit = list.find((a) => a.area_key === s.rep_area_key);
    if (hit) return hit;
  }
  return list[0] ?? null;
}

/** 대표 공시가격 — 화면·백엔드와 같은 규칙(대표 면적 ±1㎡, 면적을 모르면 호수 많은 평형) */
export function repOfficial(s: PublicSummary): OfficialPriceItem | null {
  const items = s.official_price?.items ?? [];
  if (items.length === 0) return null;
  return s.rep_area_key != null ? officialForArea(items, s.rep_area_key) : representativeOfficial(items);
}

/** "202609" → "2026년 9월" */
export function ymKorean(ym: string | null | undefined): string | null {
  if (!ym || !/^\d{6}/.test(ym)) return null;
  return `${ym.slice(0, 4)}년 ${Number(ym.slice(4, 6))}월`;
}

// ── 설명 ───────────────────────────────────────────────────────────────

export function complexDescription(s: PublicSummary): string {
  const bc = s.breadcrumb;
  const head = [bc?.sigungu_name, bc?.dong_name, s.name].filter(Boolean).join(" ");
  const facts = [
    s.household_count != null ? `${s.household_count.toLocaleString()}세대` : null,
    s.use_approve_year != null ? `${s.use_approve_year}년` : null,
  ].filter(Boolean).join("·");
  const sentences = [`${head}${facts ? ` ${facts}` : ""}.`];

  const parts: string[] = [];
  const rep = repAreaRange(s);
  if (rep?.recent6) {
    parts.push(`${rep.exclusive_area}㎡ 최근 6개월 실거래 ${priceRangeText(rep.recent6.min, rep.recent6.max)}(${rep.recent6.count}건)`);
  } else if (rep?.recent24) {
    parts.push(`${rep.exclusive_area}㎡ 최근 2년 ${priceRangeText(rep.recent24.min, rep.recent24.max)}`);
  }
  const off = repOfficial(s);
  if (off) parts.push(`공시가격 ${formatKoreanPrice(wonToManwon(off.price_median))}`);
  const kapt = kaptCostText(s.kapt_cost?.monthly_total);
  if (kapt) parts.push(`관리비 월 ${kapt}`);
  if (parts.length > 0) sentences.push(`${parts.join(", ")}.`);

  const sources = [rep || off ? "국토교통부" : null, kapt ? "K-apt" : null].filter(Boolean);
  if (sources.length > 0) sentences.push(`${sources.join("·")} 공공데이터.`);
  return sentences.join(" ");
}

// ── 메타 ───────────────────────────────────────────────────────────────

export function complexMetadata(s: PublicSummary): Metadata {
  const title = complexTitle(s);
  const description = complexDescription(s);
  const url = complexPath(s.complex_no);
  return {
    title,
    description,
    alternates: { canonical: url },
    // openGraph 를 직접 쓰면 루트 opengraph-image 상속이 끊긴다 → images 명시(seo-metadata 룰 2)
    openGraph: {
      type: "website",
      // 루트 layout 과 같은 값 — openGraph 를 직접 쓰면 루트의 site_name·locale 도 상속이 끊긴다(적대🟡4)
      siteName: "2u부동산",
      locale: "ko_KR",
      title,
      description,
      url,
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "2u부동산" }],
    },
    twitter: { card: "summary_large_image", title, description },
    robots: s.indexable ? { index: true, follow: true } : { index: false, follow: true },
  };
}

// ── 빵부스러기 ──────────────────────────────────────────────────────────

export interface Crumb {
  name: string;
  /** 갈 페이지 — 없으면 글자만 */
  href: string | null;
}

/** 홈 › 시도 › 시군구 › 동 › 단지. 지역이 없으면 홈 › 단지. 시도는 늘 글자만(갈 페이지 없음) */
export function complexCrumbs(s: PublicSummary, regionPages: boolean = REGION_PAGES_ENABLED): Crumb[] {
  const out: Crumb[] = [{ name: "홈", href: "/" }];
  const bc = s.breadcrumb;
  if (bc) {
    const hub = regionHubPath(bc.sigungu_code);
    if (bc.sido) out.push({ name: bc.sido, href: null });
    if (bc.sigungu_name) out.push({ name: bc.sigungu_name, href: regionPages ? hub : null });
    if (bc.dong_name) {
      // 동 페이지가 없는 동 = 허브 안 그 동 묶음(앵커, v2 O3)
      const dongHref = bc.dong_has_page ? dongPagePath(bc.sigungu_code, bc.dong_code) : `${hub}#${bc.dong_code}`;
      out.push({ name: bc.dong_name, href: regionPages ? dongHref : null });
    }
  }
  out.push({ name: s.name, href: complexPath(s.complex_no) });
  return out;
}

function absolute(path: string): string {
  return new URL(path, SITE_URL).toString();
}

/** 주소에서 앵커(#…)를 뗀 경로 */
function pathOnly(href: string): string {
  return href.split("#")[0];
}

/**
 * BreadcrumbList — 화면 빵부스러기에서 갈 페이지가 있는 단계만 싣는다.
 * 구글 문서(2026-09-08 갱신): 마지막 단계가 아니면 item(주소)이 필수 — 주소 없는 시도·(플래그 false 동안) 시군구·동을
 * item 없이 넣으면 "item 누락" 오류가 된다. 그래서 그 단계는 JSON-LD 에서 뺀다(position 은 남은 단계로 다시 센다).
 * 같은 경로(앵커 뗀 주소)가 두 번이면 뒤 단계를 뺀다 — 동 페이지 없는 동(허브#동코드)이 허브와 같은 주소가 되지 않게(🟡9).
 */
export function breadcrumbJsonLd(crumbs: Crumb[]): Record<string, unknown> {
  const seen = new Set<string>();
  const linked = (crumbs.filter((c) => c.href != null) as { name: string; href: string }[]).filter((c) => {
    const p = pathOnly(c.href);
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: linked.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absolute(c.href),
    })),
  };
}

/** "2026-10" → "202610"(띠 그래프 마지막 달) */
export function basisToYm(basis: string | null | undefined): string | undefined {
  if (!basis || !/^\d{4}-\d{2}$/.test(basis)) return undefined;
  return basis.replace("-", "");
}
