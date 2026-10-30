import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";

/**
 * 모든 봇 공통 차단 — 인증·관리자·잠긴 페이지 + 아직 닫아 둔 미분양 상세·검색·비교.
 * 단지(/complex/)는 세션 485 PR 3c-2 에서 열었다(서버 렌더 + 본문 robots 메타가 등급별로 색인을 정한다).
 */
export const COMMON_DISALLOW = [
  "/admin",
  "/admin/",
  "/login",
  "/signup",
  "/forgot-password",
  "/verify",
  "/compare",
  "/mibunyang/compare",
  "/mibunyang/",
  "/search",
  // 세션 400 무료 전환 — 잠긴 페이지(리다이렉트만으론 기존 색인·스니펫이 오래 남음)
  "/pricing",
];

/**
 * AI 학습용 수집 봇(결정 18 · v2 Y4) — 단지·지역 장은 학습에 내주지 않는다. 검색·인용 봇(OAI-SearchBot·ChatGPT-User·
 * Claude-SearchBot·Claude-User·PerplexityBot 등)은 넣지 않는다(`*` 묶음으로 허용). 이름마다 제공사 공식 문서(2026-10-29 확인):
 */
export const AI_TRAINING_BOTS = [
  // https://developers.openai.com/api/docs/bots — "used to crawl content that may be used in training our generative AI foundation models"
  "GPTBot",
  // https://support.claude.com/en/articles/8896518 — "collecting web content that could potentially contribute to their training"
  "ClaudeBot",
  // https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers — 쓰임 = training future generations of Gemini models · 구글 검색 노출엔 영향 없음
  "Google-Extended",
  // https://support.apple.com/en-us/119829 — "opt out of their website content being used to train Apple's general purpose foundation models"
  "Applebot-Extended",
  // https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/ — "crawls the web for use cases such as training foundation AI models"
  "meta-externalagent",
  // https://commoncrawl.org/ccbot — 공개 웹 보관소 수집 봇. 공식 문서에 '학습' 문구는 없지만 결정 18 이 이름으로 막기로 함
  // (👤 2026-10-29 재확인 — 여러 AI 학습 자료의 출처라서)
  "CCBot",
];

/**
 * `Allow: /` 줄은 두지 않는다(세션 488) — 막지 않은 경로는 원래 허용이라 없어도 같고, 구글·네이버는 순서와 무관하게
 * 더 구체적인 경로를 따른다(네이버 안내 예시 `Disallow: /` 뒤 `Allow: /$` 가 그 방식). 다만 위에서부터 처음 맞는 줄을
 * 따르는 해석기(파이썬 표준 urllib.robotparser 등)는 맨 앞 `Allow: /` 에서 멈춰 학습 봇의 /complex/·/admin 까지 허용으로 읽었다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", disallow: COMMON_DISALLOW },
      { userAgent: AI_TRAINING_BOTS, disallow: [...COMMON_DISALLOW, "/complex/", "/region/"] },
    ],
    sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/sitemaps/complexes.xml`, `${SITE_URL}/sitemaps/regions.xml`],
    host: SITE_URL,
  };
}
