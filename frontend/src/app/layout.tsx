import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Serif_KR } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ErrorBoundary from "@/components/ErrorBoundary";
import Providers from "@/components/Providers";
import { WebSiteJsonLd } from "@/components/StructuredData";
import { SITE_URL } from "@/lib/constants";

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

const notoSerifKr = Noto_Serif_KR({
  variable: "--font-noto-serif-kr",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

const GOOGLE_VERIFICATION = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;
const NAVER_VERIFICATION = process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "공인중개사를 위한 부동산 매물·시세 분석 도구 | 2u부동산",
    template: "%s | 2u부동산",
  },
  description:
    "공인중개사가 빠르게 매물·시세·미분양·실거래가를 한 번에 분석하는 전국 부동산 데이터 도구. 실시간 단지 시세, 평당가 비교, 미분양 현황 제공.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "2u부동산",
    url: SITE_URL,
    title: "공인중개사를 위한 부동산 매물·시세 분석 도구",
    description:
      "공인중개사가 빠르게 매물·시세·미분양을 분석하는 전국 부동산 데이터 도구",
  },
  twitter: {
    card: "summary_large_image",
    title: "공인중개사를 위한 부동산 매물·시세 분석 도구",
    description:
      "공인중개사가 빠르게 매물·시세·미분양을 분석하는 전국 부동산 데이터 도구",
  },
  robots: {
    index: true,
    follow: true,
  },
  ...(GOOGLE_VERIFICATION || NAVER_VERIFICATION
    ? {
        verification: {
          ...(GOOGLE_VERIFICATION ? { google: GOOGLE_VERIFICATION } : {}),
          ...(NAVER_VERIFICATION
            ? { other: { "naver-site-verification": NAVER_VERIFICATION } }
            : {}),
        },
      }
    : {}),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${notoSerifKr.variable} antialiased bg-gray-50 min-h-screen`}
        suppressHydrationWarning
      >
        <WebSiteJsonLd
          name="2u부동산"
          url={SITE_URL}
          description="공인중개사를 위한 부동산 매물·시세 분석 도구"
        />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-white focus:px-4 focus:py-2 focus:rounded focus:shadow-lg focus:text-blue-600 focus:text-sm"
        >
          본문으로 건너뛰기
        </a>
        <Providers>
          <Header />
          <ErrorBoundary>
            <main id="main-content">{children}</main>
          </ErrorBoundary>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
