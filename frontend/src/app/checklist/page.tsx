import type { Metadata } from "next";
import Link from "next/link";
import { CHECKLISTS, PARTY_TYPES } from "@/lib/broker/checklists";

/**
 * 계약 체크 목록 모음 장(세션 514) — 세입자·집주인 같은 거래 당사자용 목록을 모은다. 서버 정적 장.
 * 카드는 PARTY_TYPES 한 목록에서 만든다(손으로 두 번 적지 않는다) — 새 당사자용 목록이 생기면 카드도 저절로 생긴다.
 */
const DESCRIPTION =
  "아파트 전세·월세·매매 계약에서 세입자·집주인, 사는 사람·파는 사람이 각자 챙길 일을 법 조문과 함께 정리했습니다.";

export const metadata: Metadata = {
  title: "계약 체크 목록",
  description: DESCRIPTION,
  alternates: { canonical: "/checklist" },
  openGraph: {
    url: "/checklist",
    title: "계약 체크 목록 | 2u부동산",
    description: DESCRIPTION,
    type: "website",
    // openGraph 직접 지정 시 root opengraph-image 자동 상속이 끊겨 브랜드 PNG og 를 명시(seo-metadata 룰 2)
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "2u부동산" }],
  },
};

const cardClass = "rounded-xl bg-white p-[18px] sm:rounded-2xl sm:p-6";

export default function ChecklistHubPage() {
  return (
    <div className="-mb-16 bg-brand-bg pb-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <section className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-brand-navy">계약 체크 목록</h1>
          <p className="mt-2 text-sm sm:text-base text-brand-muted leading-relaxed">{DESCRIPTION}</p>
        </section>

        <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          {PARTY_TYPES.map((t) => {
            const list = CHECKLISTS[t];
            const count = list.stages.reduce((n, s) => n + s.items.length, 0);
            return (
              <li key={t} className={cardClass}>
                <h2 className="text-lg font-black tracking-tight text-brand-navy sm:text-xl">
                  <Link href={`/checklist/${t}`} className="hover:underline">
                    {list.h1} →
                  </Link>
                </h2>
                <p className="mt-1 text-sm font-bold text-brand-orange-text">{count}항목</p>
                <p className="mt-2 text-sm text-brand-muted leading-relaxed">{list.description}</p>
              </li>
            );
          })}
        </ul>

        <p className="mt-6 text-sm text-brand-muted">
          공인중개사용 목록은{" "}
          <Link href="/broker" className="underline hover:text-brand-navy">
            중개 실무
          </Link>
          에 있습니다.
        </p>
      </div>
    </div>
  );
}
