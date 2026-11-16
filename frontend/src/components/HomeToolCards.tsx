import Link from "next/link";

/**
 * HomeToolCards — 홈 「계산기 모음」 7칸(세션 508 · 승인 항목 12). 후순위 대출 한도는 주황 강조 + 기존 계산기 5종
 * + 계산기는 아니지만 일반인이 들어오는 문으로 「계약 체크 목록」(/checklist · 세션 514 — 제목은 그대로 두기로 결정).
 * 순수 표현 컴포넌트(데이터 페칭 없음). 옛 4칸(미분양·계산기·블로그·도움말)은 머리 메뉴·가이드 칸으로 옮겨 갔다.
 */
type ToolCard = {
  href: string;
  title: string;
  desc: string;
  accent?: boolean;
};

const CARDS: ToolCard[] = [
  { href: "/tools/second-mortgage", title: "후순위 대출 한도", desc: "추가 한도 · 매달 이자", accent: true },
  { href: "/tools/acquisition-tax", title: "취득세", desc: "살 때 내는 세금" },
  { href: "/tools/transfer-tax", title: "양도소득세", desc: "팔 때 내는 세금" },
  { href: "/tools/property-tax", title: "보유세", desc: "재산세 · 종부세" },
  { href: "/tools/brokerage-fee", title: "중개수수료", desc: "복비 계산" },
  { href: "/tools/area-converter", title: "평 · ㎡ 변환", desc: "면적 계산" },
  { href: "/checklist", title: "계약 체크 목록", desc: "전세 세입자 · 집주인" },
];

export default function HomeToolCards() {
  return (
    <section aria-labelledby="home-tools">
      <h2 id="home-tools" className="text-[22px] font-black tracking-tight text-brand-navy sm:text-[26px]">
        계산기 모음
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-2.5 text-[15px] font-bold sm:mt-5 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] sm:gap-3 sm:text-base">
        {CARDS.map(({ href, title, desc, accent }) => (
          <Link
            key={href}
            href={href}
            aria-label={`${title} — ${desc}`}
            className={`rounded-xl px-3.5 py-[18px] text-brand-navy hover:underline sm:rounded-[14px] sm:px-[18px] sm:py-[22px] ${
              accent ? "bg-brand-orange" : "bg-white"
            }`}
          >
            {title}
            <span className={`mt-0.5 block text-xs font-medium sm:text-[13px] ${accent ? "text-brand-navy" : "text-brand-muted"}`}>
              {desc}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
