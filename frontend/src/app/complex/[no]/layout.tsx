import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "단지 상세",
  description: "아파트·오피스텔 단지의 매물 목록, 시세 통계, 면적별 정보를 확인하세요.",
  openGraph: {
    title: "단지 상세 | 아파트·오피스텔",
    description: "아파트·오피스텔 단지의 매물 목록, 시세 통계, 면적별 정보를 확인하세요",
  },
};

export default function ComplexLayout({ children }: { children: React.ReactNode }) {
  return children;
}
