import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "미분양 현황 | 아파트·오피스텔",
  description: "전국 미분양 아파트 현황, 지역 통계, 실거래 정보를 조회하세요.",
};

export default function MibunyangLayout({ children }: { children: React.ReactNode }) {
  return children;
}
