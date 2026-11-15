import type { Metadata } from "next";
import Link from "next/link";
import SecondMortgageCalculator from "@/components/SecondMortgageCalculator";

export const metadata: Metadata = {
  title: "후순위 대출 한도 계산기",
  description:
    "우리 집 시세·남아 있는 대출·담보 인정 비율·연 이자율을 넣으면 집을 담보로 더 받을 수 있는 한도와 매달 낼 이자를 계산합니다.",
  alternates: { canonical: "/tools/second-mortgage" },
  openGraph: {
    url: "/tools/second-mortgage",
    title: "후순위 대출 한도 계산기 | 2u부동산",
    description: "집 시세에서 남는 만큼 — 추가 대출 한도와 매달 이자 계산",
    // openGraph 직접 지정 시 root opengraph-image 자동 상속이 끊겨 브랜드 PNG og 를 명시(seo-metadata 룰 2)
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "2u부동산" }],
  },
};

export default function SecondMortgageToolPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <section className="text-center mb-8 sm:mb-12">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-brand-navy leading-tight mb-3">
          후순위 대출 한도 계산기
        </h1>
        <p className="text-sm sm:text-base text-brand-muted leading-relaxed">
          이미 받은 대출이 있어도, 집 시세에서 남는 만큼을 담보로 추가 대출을 받는 방법입니다.
          <br className="hidden sm:inline" /> 한도와 매달 낼 이자를 먼저 계산해 보세요.
        </p>
      </section>

      <div className="rounded-2xl border border-brand-line-soft bg-white p-5 sm:p-8">
        <SecondMortgageCalculator />
      </div>

      <section className="mt-10 text-center">
        <p className="text-sm text-brand-muted">
          다른 계산기는{" "}
          <Link href="/tools" className="font-medium text-brand-orange-text hover:underline">
            계산기 모음
          </Link>
          에서 찾아보세요. 대출 광고를 볼 때는{" "}
          <Link href="/blog/illegal-loan-filter" className="font-medium text-brand-orange-text hover:underline">
            불법 대출 광고 거르는 법
          </Link>
          을 먼저 읽어 보세요.
        </p>
      </section>
    </div>
  );
}
