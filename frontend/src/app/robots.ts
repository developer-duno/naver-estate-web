import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://2u.pe.kr";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // 도구 페이지(구독자 전용 가치 데이터) + 인증/관리자 페이지 차단.
        // 단지·미분양 상세는 robots.txt 차단 + 본문 noindex 메타 양면으로 보호.
        disallow: [
          "/admin",
          "/admin/",
          "/login",
          "/signup",
          "/forgot-password",
          "/verify",
          "/compare",
          "/mibunyang/compare",
          "/complex/",
          "/mibunyang/",
          "/search",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
