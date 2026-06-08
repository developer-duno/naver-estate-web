import type { Metadata } from "next";
import Link from "next/link";
import { Receipt, Landmark, TrendingUp, Home, Ruler } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const metadata: Metadata = {
  title: "부동산 계산기 5종",
  description:
    "취득세·양도소득세·보유세·중개수수료·평㎡ 변환을 한곳에서. 공인중개사를 위한 부동산 계산기 모음.",
  alternates: { canonical: "/tools" },
  openGraph: {
    title: "부동산 계산기 5종 | 2u부동산",
    description: "취득세·양도소득세·보유세·중개수수료·평㎡ 변환 — 부동산 계산기 모음",
  },
};

type CalcCard = {
  href: string;
  Icon: LucideIcon;
  title: string;
  desc: string;
};

const CALCS: CalcCard[] = [
  {
    href: "/tools/brokerage-fee",
    Icon: Receipt,
    title: "중개수수료",
    desc: "법정 한도 수수료·부가세",
  },
  {
    href: "/tools/acquisition-tax",
    Icon: Landmark,
    title: "취득세",
    desc: "매매·증여 취득세",
  },
  {
    href: "/tools/transfer-tax",
    Icon: TrendingUp,
    title: "양도소득세",
    desc: "양도차익 세액",
  },
  {
    href: "/tools/property-tax",
    Icon: Home,
    title: "보유세",
    desc: "재산세·종부세",
  },
  {
    href: "/tools/area-converter",
    Icon: Ruler,
    title: "평·㎡ 변환",
    desc: "면적 단위 변환",
  },
];

export default function ToolsHubPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <section className="text-center mb-8 sm:mb-12">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 leading-tight mb-3">
          부동산 계산기 5종
        </h1>
        <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
          취득세·양도소득세·보유세·중개수수료·평㎡ 변환을 한곳에서 빠르게 계산하세요.
        </p>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {CALCS.map(({ href, Icon, title, desc }) => (
          <Link
            key={href}
            href={href}
            aria-label={`${title} — ${desc}`}
            className="rounded-lg border bg-white p-4 hover:bg-gray-50 transition-colors"
          >
            <Icon aria-hidden className="h-6 w-6 text-blue-600" />
            <span className="mt-2 block text-base font-semibold text-gray-800">{title}</span>
            <p className="mt-0.5 text-sm text-gray-500">{desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
