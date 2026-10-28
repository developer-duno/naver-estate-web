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
    theme_color: "#3b82f6",
    lang: "ko",
    icons: [
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png",
      },
    ],
  };
}
