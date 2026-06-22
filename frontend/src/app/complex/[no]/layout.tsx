import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "단지 상세",
  description: "아파트·오피스텔 단지의 매물 목록, 시세 통계, 면적별 정보를 확인하세요.",
  openGraph: {
    title: "단지 상세 | 아파트·오피스텔",
    description: "아파트·오피스텔 단지의 매물 목록, 시세 통계, 면적별 정보를 확인하세요",
  },
  robots: { index: false, follow: true },
};

export default function ComplexLayout({ children }: { children: React.ReactNode }) {
  const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  return (
    <>
      {clientId && (
        <Script
          src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}`}
          strategy="afterInteractive"
        />
      )}
      {children}
    </>
  );
}
