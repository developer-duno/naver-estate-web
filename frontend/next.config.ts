import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const isDev = process.env.NODE_ENV !== "production";

// Vercel 은 배포마다 고유 VERCEL_GIT_COMMIT_SHA / VERCEL_DEPLOYMENT_ID 주입.
// 이를 빌드 ID 로 써서 브라우저가 자기 버전을 알게 한다 (VersionWatcher 가 참조).
const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_DEPLOYMENT_ID ||
  process.env.NEXT_PUBLIC_BUILD_ID ||
  `dev-${Date.now()}`;

const nextConfig: NextConfig = {
  // .mdx 파일을 페이지/라우트로 인식. Turbopack·webpack 양쪽 호환 위해 문자열 플러그인.
  pageExtensions: ["ts", "tsx", "md", "mdx"],
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  generateBuildId: async () => buildId,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.naver.net" },
      { protocol: "https", hostname: "**.pstatic.net" },
    ],
  },
  async redirects() {
    return [
      // 메모 기능 폐기 (세션 132) — 외부 색인 영구 리다이렉트
      { source: "/blog/article-notes-workflow", destination: "/blog", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://oapi.map.naver.com https://openapi.map.naver.com https://vercel.live`,
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://*.naver.net https://*.pstatic.net https://vercel.live https://vercel.com",
              "connect-src 'self' http://localhost:* https://*.supabase.co https://*.railway.app https://api.2u.pe.kr https://oapi.map.naver.com https://openapi.map.naver.com https://vercel.live wss://ws-us3.pusher.com",
              "frame-src 'self' https://vercel.live",
              "media-src 'self' data:",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

// Turbopack 호환을 위해 plugin 을 문자열로 전달 (함수 직렬화 불가).
const withMDX = createMDX({
  options: {
    remarkPlugins: [["remark-gfm", {}]],
    rehypePlugins: [],
  },
});

export default withMDX(nextConfig);
