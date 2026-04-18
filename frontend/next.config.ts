import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Vercel 은 배포마다 고유 VERCEL_GIT_COMMIT_SHA / VERCEL_DEPLOYMENT_ID 주입.
// 이를 빌드 ID 로 써서 브라우저가 자기 버전을 알게 한다 (VersionWatcher 가 참조).
const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_DEPLOYMENT_ID ||
  process.env.NEXT_PUBLIC_BUILD_ID ||
  `dev-${Date.now()}`;

const nextConfig: NextConfig = {
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

export default nextConfig;
