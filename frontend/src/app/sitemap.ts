import type { MetadataRoute } from "next";
import { POSTS } from "./blog/posts";
import { SITE_URL } from "@/lib/constants";
import { getPublicUpdates } from "@/lib/api/opinions";

/**
 * 정적 페이지의 lastModified — 장마다 "화면 글자나 title·description 이 마지막으로 바뀐 날"(세션 507).
 * **손으로 갱신 · 빌드 시각(new Date()) 금지**: 빌드 시각을 쓰면 콘텐츠가 안 바뀐 페이지도 매 배포 "수정됨"으로 찍혀
 * 검색엔진이 lastmod 신뢰를 거둔다. 그 장의 화면 글자·제목·설명을 바꾸는 PR 에서 그 줄 날짜만 고친다
 * (모든 장이 함께 쓰는 머리·바닥글·클래스 이름·og 그림만 바뀐 것은 제외).
 * 근거 커밋(세션 507 `git log -p` 판정): / = 3e0bfe30(비로그인 '즐겨찾기 매물' 링크 숨김) · /tools = 9b0f2292(안내 문단) ·
 * 계산기 넷 = 30dcf3a6(바닥 안내 글) · 보유세 = 26af5c99(입력 칸 이름) · /help = c6d3b2c7('의견 보내기' 절) ·
 * /terms·/privacy = 9b0f2292(제목·설명 신설).
 * 세션 508: /(홈 개편) · /tools(6종으로 제목·설명) · /tools/second-mortgage(새 장) = 2026-11-15.
 * 세션 509: / = 2026-11-16(즐겨찾기 0개일 때의 안내 문장 삭제 · 즐겨찾기 줄을 검색 상자 안으로 — 푸터 문구·지역 단추 칸 수는 제외 대상).
 * 세션 511: /broker(중개 실무 · 새 장) = 2026-11-16.
 * /blog 는 공개 글 중 가장 최근 발행일, /updates 는 updatesLastModified() 가 정한다(이 표에 없음).
 */
const STATIC_PAGE_LASTMOD = {
  "/": "2026-11-16",
  "/broker": "2026-11-16",
  "/tools": "2026-11-15",
  "/tools/second-mortgage": "2026-11-15",
  "/tools/brokerage-fee": "2026-06-09",
  "/tools/acquisition-tax": "2026-06-09",
  "/tools/transfer-tax": "2026-06-09",
  "/tools/property-tax": "2026-08-25",
  "/tools/area-converter": "2026-06-09",
  "/help": "2026-10-06",
  "/terms": "2026-10-09",
  "/privacy": "2026-10-09",
} as const;

/** /updates 를 못 읽었거나 공개 글이 0편일 때의 고정 날짜(세션 437 PR C 부터 같은 값 — 빌드 시각을 쓰지 않는다). */
const FALLBACK_LASTMOD = new Date("2026-06-29");

/**
 * /updates("고쳤습니다")의 lastModified = 가장 최근에 공개한 항목의 published_at(목록이 공개 시각 내림차순).
 * 백엔드 주소가 없거나·실패·빈 목록·날짜를 못 읽으면 고정 날짜로 둔다(빌드 시각을 쓰지 않는다 — 위 주석과 같은 이유).
 */
async function updatesLastModified(): Promise<Date> {
  if (!process.env.NEXT_PUBLIC_API_URL) return FALLBACK_LASTMOD;
  try {
    const first = (await getPublicUpdates(1)).items[0];
    const d = first?.published_at ? new Date(first.published_at) : null;
    return d && !Number.isNaN(d.getTime()) ? d : FALLBACK_LASTMOD;
  } catch {
    return FALLBACK_LASTMOD;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastmod = (path: keyof typeof STATIC_PAGE_LASTMOD) => new Date(STATIC_PAGE_LASTMOD[path]);
  const updatesLastmod = await updatesLastModified();

  // 마케팅·공개 페이지만 노출. 도구 페이지(/search, /complex, /mibunyang)는 구독자 전용이라 제외.
  // /blog/[slug]: draft:true 글은 본문 채워질 때까지 sitemap 제외 (빈 글 색인 방지).
  const publishedPosts = POSTS.filter((p) => !p.draft).map((p) => ({
    url: `${SITE_URL}/blog/${p.slug}`,
    lastModified: new Date(p.date),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  // /blog = 공개 글 중 가장 최근 발행일(글이 하나도 없으면 1970 이 아니라 고정 날짜)
  const blogLastmod = publishedPosts.reduce<Date>(
    (latest, p) => (p.lastModified > latest ? p.lastModified : latest),
    FALLBACK_LASTMOD,
  );

  return [
    { url: SITE_URL, lastModified: lastmod("/"), changeFrequency: "weekly", priority: 1.0 },
    // 세션 400: /pricing 은 무료 전환으로 잠긴 페이지라 sitemap 제외 (lib/locked-paths.ts)
    { url: `${SITE_URL}/broker`, lastModified: lastmod("/broker"), changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/tools`, lastModified: lastmod("/tools"), changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/tools/second-mortgage`, lastModified: lastmod("/tools/second-mortgage"), changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/tools/brokerage-fee`, lastModified: lastmod("/tools/brokerage-fee"), changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/tools/acquisition-tax`, lastModified: lastmod("/tools/acquisition-tax"), changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/tools/transfer-tax`, lastModified: lastmod("/tools/transfer-tax"), changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/tools/property-tax`, lastModified: lastmod("/tools/property-tax"), changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/tools/area-converter`, lastModified: lastmod("/tools/area-converter"), changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/blog`, lastModified: blogLastmod, changeFrequency: "weekly", priority: 0.8 },
    ...publishedPosts,
    { url: `${SITE_URL}/updates`, lastModified: updatesLastmod, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/help`, lastModified: lastmod("/help"), changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/terms`, lastModified: lastmod("/terms"), changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, lastModified: lastmod("/privacy"), changeFrequency: "yearly", priority: 0.3 },
  ];
}
