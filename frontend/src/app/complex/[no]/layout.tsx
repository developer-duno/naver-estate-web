import Script from "next/script";

// 메타(제목·설명·canonical·robots)는 page.tsx generateMetadata 가 단지마다 정한다(세션 483 PR 3b — 옛 정적 noindex 삭제)

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
