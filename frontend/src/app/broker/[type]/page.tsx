import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BROKER_TYPES, getChecklist, type ChecklistType } from "@/lib/broker/checklists";
import DealChecklist from "@/components/broker/DealChecklist";
import { formatDateDot } from "@/lib/broker/upcoming-dates";
import { HUG_LIMIT_PATH, hasHugItem } from "@/lib/broker/hug-guarantee";

/**
 * 거래 유형별 체크 목록(세션 513 PR 2a) — 서버 정적 장. 자료 = lib/broker/checklists.ts 한 목록.
 * 단계 카드·체크 상자·「내 거래」 줄은 클라이언트 부품 DealChecklist(PR 2b — 이 기기 저장). 글자는 첫 HTML 에 그대로 들어간다.
 * 중개사용(audience broker) 목록만 연다 — 세입자·집주인용은 /checklist/[type](세션 514).
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return BROKER_TYPES.map((type) => ({ type }));
}

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }): Promise<Metadata> {
  const { type } = await params;
  const list = getChecklist(type, "broker");
  if (!list) return {};
  const path = `/broker/${list.type}`;
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

export default async function BrokerChecklistPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const list = getChecklist(type, "broker");
  if (!list) notFound();
  // 손님에게 보낼 당사자용 목록(세션 514) — 짝은 자료의 partyTypes 에서 읽는다(전세·월세·매매)
  const partyLists = (list.partyTypes ?? []).flatMap((t) => {
    const p = getChecklist(t, "party");
    return p ? [p] : [];
  });

  return (
    <div className="-mb-16 bg-brand-bg pb-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <section className="mb-6 sm:mb-8">
          <Link href="/broker" className="text-sm text-brand-muted hover:underline">
            ← 중개 실무
          </Link>
          <h1 className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-brand-navy">{list.h1}</h1>
          <p className="mt-2 text-sm sm:text-base text-brand-muted leading-relaxed">{list.description}</p>
          {partyLists.length > 0 && (
            <p className="mt-1 text-sm text-brand-muted">
              손님에게 보낼 목록:{" "}
              {partyLists.map((p, i) => (
                <span key={p.type}>
                  {i > 0 && " · "}
                  <Link
                    href={`/checklist/${p.type}`}
                    className="font-bold text-brand-orange-text underline hover:text-brand-navy"
                  >
                    {p.name}
                  </Link>
                </span>
              ))}
            </p>
          )}
          <p className="mt-1 text-sm text-brand-muted">
            법령 기준일 <time dateTime={list.checkedAt}>{formatDateDot(list.checkedAt)}</time>
          </p>
        </section>

        <DealChecklist type={list.type as ChecklistType} />

        <p className="mt-6 text-sm text-brand-muted leading-relaxed">
          이 목록에 넣지 않은 것: {list.notCovered.join(" · ")} · 조문 원문은 각 링크(법제처)에서 현행 내용을 봅니다.
          {hasHugItem(list.notCovered) && (
            <>
              {" "}
              <Link href={HUG_LIMIT_PATH} className="font-bold text-brand-orange-text underline hover:text-brand-navy">
                한도 계산 →
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
