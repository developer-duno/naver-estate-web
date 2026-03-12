import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "네이버 아파트 매물 조회",
    template: "%s | 아파트 매물",
  },
  description: "전국 아파트 매물을 검색하고 필터링하세요. 실시간 시세, 면적별 가격 통계를 제공합니다.",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "아파트 매물 조회",
    title: "네이버 아파트 매물 조회",
    description: "전국 아파트 매물을 검색하고 필터링하세요",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 min-h-screen`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-white focus:px-4 focus:py-2 focus:rounded focus:shadow-lg focus:text-blue-600 focus:text-sm"
        >
          본문으로 건너뛰기
        </a>
        <Header />
        <main id="main-content">{children}</main>
      </body>
    </html>
  );
}
