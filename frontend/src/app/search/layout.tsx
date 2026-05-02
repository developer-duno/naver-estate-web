import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "단지 검색",
  description: "전국 아파트·오피스텔 단지를 키워드 또는 지역으로 검색하세요. 실시간 매물 정보를 제공합니다.",
  openGraph: {
    title: "단지 검색 | 아파트·오피스텔",
    description: "전국 아파트·오피스텔 단지를 키워드 또는 지역으로 검색하세요",
  },
  robots: { index: false, follow: true },
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
