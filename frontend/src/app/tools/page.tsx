import type { Metadata } from "next";
import Link from "next/link";
import BrandCard from "@/components/brand/BrandCard";
import ToolPage from "@/components/tools/ToolPage";

export const metadata: Metadata = {
  title: "부동산 계산기 6종",
  description:
    "후순위 대출 한도·취득세·양도소득세·보유세·중개수수료·평㎡ 변환을 한곳에서. 부동산 계산기 모음.",
  alternates: { canonical: "/tools" },
  openGraph: {
    url: "/tools",
    title: "부동산 계산기 6종 | 2u부동산",
    description: "후순위 대출 한도·취득세·양도소득세·보유세·중개수수료·평㎡ 변환 — 부동산 계산기 모음",
    // openGraph 직접 지정 시 root opengraph-image 자동 상속이 끊겨 브랜드 PNG og 를 명시(빌드 실측 확인)
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "2u부동산" }],
  },
};

type CalcCard = {
  href: string;
  title: string;
  desc: string;
};

const CALCS: CalcCard[] = [
  {
    href: "/tools/second-mortgage",
    title: "후순위 대출 한도",
    desc: "추가 대출 한도 · 매달 이자",
  },
  {
    href: "/tools/brokerage-fee",
    title: "중개수수료",
    desc: "법정 한도 수수료 · 부가세",
  },
  {
    href: "/tools/acquisition-tax",
    title: "취득세",
    desc: "집을 살 때 내는 세금",
  },
  {
    href: "/tools/transfer-tax",
    title: "양도소득세",
    desc: "집을 팔 때 내는 세금",
  },
  {
    href: "/tools/property-tax",
    title: "보유세",
    desc: "해마다 내는 재산세 · 종부세",
  },
  {
    href: "/tools/area-converter",
    title: "평·㎡ 변환",
    desc: "면적 단위 바꾸기",
  },
];

/** 계산기 모음(세션 530 · B40 PR 3a) — 새 틀 띠 + 흰 카드 한 장 안에 6줄. 링크는 이 6개뿐(시험이 수를 고정) */
export default function ToolsHubPage() {
  return (
    <ToolPage eyebrow="로그인 없이 · 무료" title="부동산 계산기 6종" description="대출 한도, 세금, 수수료, 면적을 한곳에서">
      <BrandCard className="divide-y divide-brand-line-soft overflow-hidden">
        {CALCS.map(({ href, title, desc }) => (
          <Link
            key={href}
            href={href}
            aria-label={`${title} — ${desc}`}
            className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-brand-bg sm:px-5"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold text-brand-navy">{title}</span>
              <span className="mt-0.5 block text-sm text-brand-muted">{desc}</span>
            </span>
            <span aria-hidden className="shrink-0 text-xl text-brand-muted">
              ›
            </span>
          </Link>
        ))}
      </BrandCard>
      <p className="mt-4 text-center text-xs text-brand-muted">
        세금·수수료 결과는 참고용입니다. 최종 금액은 관할 기관에서 확인하세요.
      </p>
    </ToolPage>
  );
}
