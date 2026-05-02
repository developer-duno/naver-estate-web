import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://2u.pe.kr";
  const now = new Date();

  // 마케팅·공개 페이지만 노출. 도구 페이지(/search, /complex, /mibunyang)는 구독자 전용이라 제외.
  // 추후 신설 예정: /pricing, /about, /blog/* — 만들면 이 배열에 추가.
  return [
    { url: baseUrl, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${baseUrl}/help`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${baseUrl}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
