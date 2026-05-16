import type { BlogPost } from "@/types/blog";

/**
 * RSS 2.0 피드 생성 — 블로그 글 목록을 검색엔진·피드 리더용 XML 로 변환.
 *
 * sitemap.ts 와 동일하게 POSTS 를 소스로 쓰되, RSS 는 발행일 내림차순 정렬이
 * 필수다(리더가 최신 글을 위에 노출). XML escape 는 JSON-LD 의 serializeJsonLd
 * 와 달리 `&` 까지 처리해야 하므로 RSS 전용 escapeXml 을 따로 둔다.
 */

/** XML 텍스트 노드용 escape. `&` 를 반드시 가장 먼저 치환해 이중 이스케이프를 막는다. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** ISO date(`"2026-05-17"`) → RFC822(`"Sat, 17 May 2026 00:00:00 GMT"`). RSS pubDate 형식. */
export function toRfc822(isoDate: string): string {
  return new Date(isoDate).toUTCString();
}

/** 발행 글(draft 제외)을 RSS 2.0 XML 문자열로 조립. 글은 발행일 내림차순 정렬. */
export function buildRssFeed(posts: BlogPost[], baseUrl: string): string {
  const published = posts
    .filter((p) => !p.draft)
    .sort((a, b) => b.date.localeCompare(a.date));

  const lastBuildDate =
    published.length > 0 ? toRfc822(published[0].date) : new Date().toUTCString();

  const items = published
    .map(
      (p) => `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${baseUrl}/blog/${p.slug}</link>
      <guid isPermaLink="true">${baseUrl}/blog/${p.slug}</guid>
      <description>${escapeXml(p.description)}</description>
      <category>${escapeXml(p.category)}</category>
      <pubDate>${toRfc822(p.date)}</pubDate>
    </item>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>2u부동산 블로그</title>
    <link>${baseUrl}/blog</link>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>전세가율·시세 분석·미분양·세금 — 공인중개사 실무 인사이트</description>
    <language>ko</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
${items}
  </channel>
</rss>`;
}
