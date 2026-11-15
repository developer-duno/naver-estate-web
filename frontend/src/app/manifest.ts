import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "2u부동산 — 아파트 실거래가·공시가격",
    short_name: "2u부동산",
    description:
      "전국 아파트·오피스텔의 실거래가 범위·공시가격·관리비·동네 통계를 누구나 무료로. 공인중개사는 네이버 매물·시세까지 한 번에.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0b1f3a",
    lang: "ko",
    icons: [
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png",
      },
      // 홈 화면·앱 설치용 큰 그림(세션 509) — public/ 정적 PNG · scripts/gen-app-icons.py 로 만든다
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
