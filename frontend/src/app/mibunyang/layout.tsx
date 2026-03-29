import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "미분양 현황 | 아파트·오피스텔",
  description: "전국 미분양 아파트 현황, 지역 통계, 실거래 정보를 조회하세요.",
};

export default function MibunyangLayout({ children }: { children: React.ReactNode }) {
  const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  return (
    <>
      {clientId && (
        <Script
          src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpClientId=${clientId}`}
          strategy="afterInteractive"
        />
      )}
      {children}
    </>
  );
}
