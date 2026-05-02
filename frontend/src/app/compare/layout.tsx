import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "단지 비교",
  description: "아파트·오피스텔 단지를 한눈에 비교 — 평당가, 시세, 면적, 단지 정보 표 + 차트",
  robots: { index: false, follow: true },
};

export default function CompareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
