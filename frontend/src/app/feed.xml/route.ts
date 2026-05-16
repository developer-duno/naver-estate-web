import { POSTS } from "@/app/blog/posts";
import { buildRssFeed } from "@/lib/rss";

/**
 * 블로그 RSS 2.0 피드 — /feed.xml.
 *
 * 네이버 서치어드바이저·구글·피드 리더가 새 글 발행을 자동 감지하는 채널.
 * POSTS 는 배포 시에만 바뀌므로 정적 생성을 허용(dynamic 지시자 생략)하고
 * CDN 1시간 캐시를 둔다.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://2u.pe.kr";

export function GET() {
  const xml = buildRssFeed(POSTS, SITE_URL);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
