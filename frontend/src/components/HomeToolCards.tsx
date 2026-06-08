import Link from "next/link";
import { TrendingDown, Calculator, Newspaper, HelpCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * HomeToolCards — 홈 도구 발견성 카드 4종 (미분양/계산기/블로그/도움말)
 * 순수 표현 컴포넌트(데이터 페칭 없음). 검색 영역 아래 2×2 그리드로 진입점 노출.
 * 설계: docs/superpowers/specs/2026-06-08-home-tool-cards-design.md
 */
type ToolCard = {
  href: string;
  Icon: LucideIcon;
  title: string;
  desc: string;
  aria: string;
};

const CARDS: ToolCard[] = [
  {
    href: "/mibunyang",
    Icon: TrendingDown,
    title: "미분양 현황",
    desc: "전국 미분양·지역 통계",
    aria: "미분양 현황 — 전국 미분양·지역 통계",
  },
  {
    href: "/tools",
    Icon: Calculator,
    title: "부동산 계산기",
    desc: "세금·중개수수료·평 변환",
    aria: "부동산 계산기 — 세금·중개수수료·평 변환",
  },
  {
    href: "/blog",
    Icon: Newspaper,
    title: "블로그",
    desc: "시세·세금 분석 글",
    aria: "블로그 — 시세·세금 분석 글",
  },
  {
    href: "/help",
    Icon: HelpCircle,
    title: "도움말",
    desc: "사용법·자주 묻는 질문",
    aria: "도움말 — 사용법·자주 묻는 질문",
  },
];

export default function HomeToolCards() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {CARDS.map(({ href, Icon, title, desc, aria }) => (
        <Link
          key={href}
          href={href}
          aria-label={aria}
          className="rounded-lg border bg-white p-4 hover:bg-gray-50 transition-colors"
        >
          <Icon aria-hidden className="h-5 w-5 text-blue-600" />
          <span className="mt-2 block text-sm font-semibold text-gray-800">{title}</span>
          <p className="mt-0.5 text-xs text-gray-500">{desc}</p>
        </Link>
      ))}
    </div>
  );
}
