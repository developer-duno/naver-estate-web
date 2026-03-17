import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "단지 검색",
  description: "전국 아파트 단지를 키워드 또는 지역으로 검색하세요. 실시간 매물 정보를 제공합니다.",
  openGraph: {
    title: "단지 검색 | 아파트 매물",
    description: "전국 아파트 단지를 키워드 또는 지역으로 검색하세요",
  },
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
