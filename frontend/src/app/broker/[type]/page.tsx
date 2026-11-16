import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CHECKLIST_TYPES, getChecklist } from "@/lib/broker/checklists";
import { formatDateDot } from "@/lib/broker/upcoming-dates";

/** 거래 유형별 체크 목록(세션 513 PR 2a) — 서버 정적 장. 자료 = lib/broker/checklists.ts 한 목록. */
export const dynamicParams = false;

export function generateStaticParams() {
  return CHECKLIST_TYPES.map((type) => ({ type }));
}

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }): Promise<Metadata> {
  const { type } = await params;
  const list = getChecklist(type);
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

const cardClass = "rounded-xl bg-white p-[18px] sm:rounded-2xl sm:p-6";
const cardTitleClass = "text-lg font-black tracking-tight text-brand-navy sm:text-xl";

export default async function BrokerChecklistPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const list = getChecklist(type);
  if (!list) notFound();

  // 단계마다 이어지는 번호(1~N) — 각 단계 <ol> 의 start
  const starts: number[] = [];
  list.stages.reduce((n, s) => {
    starts.push(n);
    return n + s.items.length;
  }, 1);

  return (
    <div className="-mb-16 bg-brand-bg pb-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <section className="mb-6 sm:mb-8">
          <Link href="/broker" className="text-sm text-brand-muted hover:underline">
            ← 중개 실무
          </Link>
          <h1 className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-brand-navy">{list.h1}</h1>
          <p className="mt-2 text-sm sm:text-base text-brand-muted leading-relaxed">{list.description}</p>
          <p className="mt-1 text-sm text-brand-muted">
            법령 기준일 <time dateTime={list.checkedAt}>{formatDateDot(list.checkedAt)}</time>
          </p>
        </section>

        <div className="flex flex-col gap-3 sm:gap-4">
          {list.stages.map((stage, si) => (
            <section key={stage.id} aria-labelledby={`stage-${stage.id}`} className={cardClass}>
              <h2 id={`stage-${stage.id}`} className={cardTitleClass}>
                {stage.title}
              </h2>
              <ol
                start={starts[si]}
                className="mt-3 flex list-decimal flex-col divide-y divide-brand-line-soft pl-6 marker:font-bold marker:text-brand-orange-text"
              >
                {stage.items.map((item) => (
                  <li key={item.id} id={item.id} className="py-3 first:pt-0 last:pb-0">
                    <h3 className="text-base font-bold leading-snug text-brand-navy">{item.title}</h3>
                    {item.detail && <p className="mt-1 text-sm text-brand-muted leading-relaxed">{item.detail}</p>}
                    {item.links && item.links.length > 0 && (
                      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                        {item.links.map((l) =>
                          l.href.startsWith("/") ? (
                            <Link
                              key={l.href}
                              href={l.href}
                              className="text-brand-orange-text underline hover:text-brand-navy"
                            >
                              {l.label} →
                            </Link>
                          ) : (
                            <a
                              key={l.href}
                              href={l.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-orange-text underline hover:text-brand-navy"
                            >
                              {l.label} ↗
                            </a>
                          ),
                        )}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-brand-muted leading-relaxed">
                      <span className="font-bold">근거</span>{" "}
                      {item.laws.map((law, li) => (
                        <span key={law.label}>
                          {li > 0 && " · "}
                          <a
                            href={law.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-brand-navy"
                          >
                            {law.label} ↗
                          </a>
                        </span>
                      ))}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>

        <p className="mt-6 text-sm text-brand-muted leading-relaxed">
          이 목록에 넣지 않은 것: {list.notCovered.join(" · ")} · 조문 원문은 각 링크(법제처)에서 현행 내용을 봅니다.
        </p>
      </div>
    </div>
  );
}
