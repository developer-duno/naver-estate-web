import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PARTY_TYPES, getChecklist, type ChecklistType } from "@/lib/broker/checklists";
import DealChecklist from "@/components/broker/DealChecklist";
import { formatDateDot } from "@/lib/broker/upcoming-dates";

/**
 * 계약 체크 목록 — 세입자·집주인용(세션 514). 서버 정적 장 · 자료 = lib/broker/party-checklists.ts(레지스트리 checklists.ts).
 * /broker/[type] 와 같은 꼴이되 거래 당사자(audience party) 목록만 연다. 체크는 같은 이 기기 저장(broker_deals_v1)이고,
 * 「거래 고르기·새 거래·계약일」 줄 없이 「비우기」만 두는 single 모양. 글자는 첫 HTML 에 그대로 들어간다.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return PARTY_TYPES.map((type) => ({ type }));
}

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }): Promise<Metadata> {
  const { type } = await params;
  const list = getChecklist(type, "party");
  if (!list) return {};
  const path = `/checklist/${list.type}`;
  return {
    title: list.h1,
    description: list.description,
    alternates: { canonical: path },
    openGraph: {
      url: path,
      title: `${list.h1} | 2u부동산`,
      description: list.description,
      type: "website",
      // openGraph 직접 지정 시 root opengraph-image 자동 상속이 끊겨 브랜드 PNG og 를 명시(seo-metadata 룰 2)
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "2u부동산" }],
    },
  };
}

export default async function PartyChecklistPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const list = getChecklist(type, "party");
  if (!list) notFound();

  return (
    <div className="-mb-16 bg-brand-bg pb-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <section className="mb-6 sm:mb-8">
          <Link href="/checklist" className="text-sm text-brand-muted hover:underline">
            ← 계약 체크 목록
          </Link>
          <h1 className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-brand-navy">{list.h1}</h1>
          <p className="mt-2 text-sm sm:text-base text-brand-muted leading-relaxed">{list.description}</p>
          <p className="mt-1 text-sm text-brand-muted">
            법령 기준일 <time dateTime={list.checkedAt}>{formatDateDot(list.checkedAt)}</time>
          </p>
        </section>

        <DealChecklist type={list.type as ChecklistType} single />

        <p className="mt-6 text-sm text-brand-muted leading-relaxed">
          이 목록에 넣지 않은 것: {list.notCovered.join(" · ")} · 조문 원문은 각 링크(법제처)에서 현행 내용을 봅니다.
        </p>
      </div>
    </div>
  );
}
