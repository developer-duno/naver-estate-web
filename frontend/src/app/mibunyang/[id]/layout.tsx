import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "미분양 상세 | 아파트·오피스텔",
  description: "미분양 아파트 상세 정보 — 분양가, 혜택, 주변 환경, 거래 통계, 미분양 추이",
  robots: { index: false, follow: true },
};

export default function MbDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
