import type { Metadata } from "next";
import Link from "next/link";
import BrokerageCalculator from "./BrokerageCalculator";

export const metadata: Metadata = {
  title: "중개수수료 계산기",
  description:
    "거래유형·매물유형·금액을 입력하면 공인중개사법 시행규칙(2021.10.19 개정) 기준 법정 한도 수수료와 부가세를 즉시 계산합니다.",
  alternates: { canonical: "/tools/brokerage-fee" },
  openGraph: {
    title: "중개수수료 계산기 | 2u부동산",
    description: "공인중개사를 위한 중개수수료 자동 계산 — 매매·전세·월세·오피스텔·토지 모두 지원",
  },
};

export default function BrokerageFeeToolPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <section className="text-center mb-8 sm:mb-12">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 leading-tight mb-3">
          중개수수료 계산기
        </h1>
        <p className="text-sm sm:text-base text-gray-600 mb-4 leading-relaxed">
          공인중개사법 시행규칙 별표1(2021.10.19 개정) 기준
          <br className="hidden sm:inline" /> 법정 한도 수수료를 즉시 계산합니다.
        </p>
        <div className="mt-4 p-3 sm:p-4 bg-amber-50 border border-amber-200 rounded-lg text-left text-xs sm:text-sm text-amber-900">
          <strong>안내:</strong> 본 계산은 표준 요율 기준 참고치입니다. 실제 보수는 협의에 따라 달라질 수 있으며,
          정확한 금액은 관할 시·군·구청 또는 한국공인중개사협회에 확인하세요.
        </div>
      </section>

      <BrokerageCalculator />

      <section className="mt-10 text-center">
        <p className="text-sm text-gray-600">
          다른 부동산 계산기는{" "}
          <Link href="/blog/realestate-calculators" className="text-blue-600 hover:underline">
            계산기 모음 안내
          </Link>
          에서 출시 일정을 확인하세요.
        </p>
      </section>
    </div>
  );
}
