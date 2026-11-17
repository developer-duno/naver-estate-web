import type { Metadata } from "next";
import Link from "next/link";
import HugLimitCalculator from "@/components/broker/HugLimitCalculator";

/**
 * 전세보증 한도(세션 520 · B37 PR 5) — 서버 정적 장 + 클라이언트 계산기(components/broker/HugLimitCalculator).
 * 계산 = lib/broker/hug-guarantee.ts(HUG 누리집 원문 · 확인일은 그 파일 상수). /broker/[type] 보다 이 정적 폴더가 먼저 잡힌다.
 */
const DESCRIPTION =
  "주택가격·선순위채권·전세보증금으로 HUG 전세보증금반환보증의 보증한도와 보증금 조건 세 가지를 계산합니다. 아파트·오피스텔·연립·다세대.";

export const metadata: Metadata = {
  title: "전세보증 한도 계산 — HUG 전세보증금반환보증",
  description: DESCRIPTION,
  alternates: { canonical: "/broker/jeonse-guarantee" },
  openGraph: {
    url: "/broker/jeonse-guarantee",
    title: "전세보증 한도 계산 — HUG 전세보증금반환보증 | 2u부동산",
    description: DESCRIPTION,
    type: "website",
    // openGraph 직접 지정 시 root opengraph-image 자동 상속이 끊겨 브랜드 PNG og 를 명시(seo-metadata 룰 2)
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "2u부동산" }],
  },
};

export default function JeonseGuaranteePage() {
  return (
    <div className="-mb-16 bg-brand-bg pb-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <section className="mb-6 sm:mb-8">
          <Link href="/broker" className="text-sm text-brand-muted hover:underline">
            ← 중개 실무
          </Link>
          <h1 className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-brand-navy">전세보증 한도</h1>
          <p className="mt-2 text-sm sm:text-base text-brand-muted leading-relaxed">
            HUG 전세보증금반환보증의 한도 산식으로 계산합니다. 아파트·오피스텔·연립·다세대.
          </p>
        </section>

        <HugLimitCalculator />
      </div>
    </div>
  );
}
