import type { MetadataRoute } from "next";
import { POSTS } from "./blog/posts";
import { SITE_URL } from "@/lib/constants";

/**
 * 정적 페이지(도구·요금·약관 등)의 lastModified 기준일.
 * 빌드 시각(new Date())을 쓰면 콘텐츠가 안 바뀐 페이지도 매 배포 "수정됨"으로 찍혀
 * 검색엔진이 lastmod 신뢰를 거둔다 → 실제 페이지 개편 시에만 이 날짜를 손으로 갱신한다.
 * blog 글은 각 글의 발행일(p.date)을 쓰므로 이미 정확.
 */
const STATIC_PAGE_LASTMOD = new Date("2026-06-29");

export default function sitemap(): MetadataRoute.Sitemap {
  const lastmod = STATIC_PAGE_LASTMOD;

  // 마케팅·공개 페이지만 노출. 도구 페이지(/search, /complex, /mibunyang)는 구독자 전용이라 제외.
  // /blog/[slug]: draft:true 글은 본문 채워질 때까지 sitemap 제외 (빈 글 색인 방지).
  const publishedPosts = POSTS.filter((p) => !p.draft).map((p) => ({
    url: `${SITE_URL}/blog/${p.slug}`,
    lastModified: new Date(p.date),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [
    { url: SITE_URL, lastModified: lastmod, changeFrequency: "weekly", priority: 1.0 },
    { url: `${SITE_URL}/pricing`, lastModified: lastmod, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/tools/brokerage-fee`, lastModified: lastmod, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/tools/acquisition-tax`, lastModified: lastmod, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/tools/transfer-tax`, lastModified: lastmod, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/tools/property-tax`, lastModified: lastmod, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/tools/area-converter`, lastModified: lastmod, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/blog`, lastModified: lastmod, changeFrequency: "weekly", priority: 0.8 },
    ...publishedPosts,
    { url: `${SITE_URL}/help`, lastModified: lastmod, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/terms`, lastModified: lastmod, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, lastModified: lastmod, changeFrequency: "yearly", priority: 0.3 },
  ];
}
