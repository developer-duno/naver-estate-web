import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "2u부동산 — 공인중개사 매물·시세 분석 도구",
    short_name: "2u부동산",
    description:
      "공인중개사가 빠르게 매물·시세·미분양·실거래가를 분석하는 전국 부동산 데이터 도구",
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
