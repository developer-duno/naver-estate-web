import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";

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
          // 세션 400 무료 전환 — 잠긴 페이지(리다이렉트만으론 기존 색인·스니펫이 오래 남음)
          "/pricing",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
