import type { Metadata } from "next";
import Link from "next/link";
import { UPCOMING_DATES, formatDateDot } from "@/lib/broker/upcoming-dates";
import { CHECKLISTS, BROKER_TYPES } from "@/lib/broker/checklists";

export const metadata: Metadata = {
  title: "중개 실무 — 공인중개사 날짜·서식·계산",
  description:
    "아파트 매매·전세·월세 중개에 쓰는 날짜·서식·계산을 한곳에. 다가오는 제도 날짜, 확인·설명서와 표준계약서 원문, 중개수수료·세금 계산기.",
  alternates: { canonical: "/broker" },
  openGraph: {
    url: "/broker",
    title: "중개 실무 — 공인중개사 날짜·서식·계산 | 2u부동산",
    description: "아파트 매매·전세·월세 중개에 쓰는 날짜·서식·계산을 한곳에",
    // openGraph 직접 지정 시 root opengraph-image 자동 상속이 끊겨 브랜드 PNG og 를 명시(seo-metadata 룰 2)
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "2u부동산" }],
  },
};

const CALC_LINKS = [
  { href: "/tools/brokerage-fee", label: "중개수수료" },
  { href: "/tools/acquisition-tax", label: "취득세" },
  { href: "/tools/transfer-tax", label: "양도소득세" },
  { href: "/tools/property-tax", label: "보유세" },
];

/**
 * 서식 원문 — 공식 누리집 주소만(사본 파일은 두지 않는다). 세션 511 에 원문을 열어 확인:
 * ⓐ 법제처 국가법령정보센터 별표·서식 화면(제목 「중개대상물 확인ㆍ설명서[Ⅰ] (주거용 건축물)」, 공인중개사법 시행규칙
 *   [시행 2026. 8. 28.] 서식 20) — 서식 자체의 개정일은 원문 화면에서 확인하지 못해 적지 않는다.
 *   세션 513: 판 번호 없는 한글 주소로 교체 — 11-16 메인 실측 같은 서식.
 * ⓑ 법무부 게시글 「주택임대차 표준계약서(2023. 10. 6. 개정) 다운받기」(글번호 575868).
 */
const FORM_LINKS = [
  {
    title: "중개대상물 확인·설명서(주거용 건축물)",
    meta: "공인중개사법 시행규칙 별지 제20호서식",
    sourceLabel: "법제처 국가법령정보센터",
    url: "https://www.law.go.kr/법령별표서식/(공인중개사법시행규칙,서식20)",
  },
  {
    title: "주택임대차 표준계약서",
    meta: "2023. 10. 6. 개정",
    sourceLabel: "법무부",
    url: "https://www.moj.go.kr/bbs/moj/118/575868/artclView.do",
  },
];

const cardClass = "rounded-xl bg-white p-[18px] sm:rounded-2xl sm:p-6";
const cardTitleClass = "text-lg font-black tracking-tight text-brand-navy sm:text-xl";

export default function BrokerHubPage() {
  return (
    <div className="-mb-16 bg-brand-bg pb-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <section className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-brand-navy">중개 실무</h1>
          <p className="mt-2 text-sm sm:text-base text-brand-muted leading-relaxed">
            아파트 매매·전세·월세 중개에 쓰는 날짜·서식·계산을 한곳에 모았습니다. 로그인 없이 볼 수 있습니다.
          </p>
        </section>

        <div className="flex flex-col gap-3 sm:gap-4">
          <section aria-labelledby="broker-dates" className={cardClass}>
            <h2 id="broker-dates" className={cardTitleClass}>다가오는 날짜</h2>
            <ul className="mt-3 flex flex-col divide-y divide-brand-line-soft">
              {UPCOMING_DATES.map((d) => (
                <li key={`${d.date}-${d.title}`} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-sm font-bold text-brand-orange-text">
                    <time dateTime={d.date}>{formatDateDot(d.date)}</time>
                  </p>
                  <p className="mt-0.5 text-base font-bold leading-snug text-brand-navy">{d.title}</p>
                  <p className="mt-1 text-sm text-brand-muted leading-relaxed">{d.note}</p>
                  <p className="mt-1 text-xs text-brand-muted">
                    <a
                      href={d.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-brand-navy"
                    >
                      출처: {d.sourceLabel} ↗
                    </a>
                    <span className="ml-2">원문 확인 {formatDateDot(d.checkedAt)}</span>
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="broker-checklists" className={cardClass}>
            <h2 id="broker-checklists" className={cardTitleClass}>거래 유형별 체크 목록</h2>
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {BROKER_TYPES.map((t) => (
                <li key={t}>
                  <Link
                    href={`/broker/${t}`}
                    className="flex min-h-11 items-center justify-center rounded-lg border border-brand-line px-3 text-sm font-bold text-brand-navy hover:bg-brand-bg"
                  >
                    {CHECKLISTS[t].name} →
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="broker-calcs" className={cardClass}>
            <h2 id="broker-calcs" className={cardTitleClass}>자주 쓰는 계산</h2>
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CALC_LINKS.map((c) => (
                <li key={c.href}>
                  <Link
                    href={c.href}
                    className="flex min-h-11 items-center justify-center rounded-lg border border-brand-line px-3 text-sm font-bold text-brand-navy hover:bg-brand-bg"
                  >
                    {c.label}
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/tools" className="mt-3 inline-block text-sm text-brand-muted hover:underline">
              계산기 전체 →
            </Link>
          </section>

          <section aria-labelledby="broker-forms" className={cardClass}>
            <h2 id="broker-forms" className={cardTitleClass}>서식 원문</h2>
            <ul className="mt-3 flex flex-col divide-y divide-brand-line-soft">
              {FORM_LINKS.map((f) => (
                <li key={f.url} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-base font-bold leading-snug text-brand-navy">{f.title}</p>
                  <p className="mt-0.5 text-sm text-brand-muted">{f.meta}</p>
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block text-sm text-brand-orange-text underline hover:text-brand-navy"
                  >
                    {f.sourceLabel}에서 원문 보기 ↗
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="broker-verify" className={cardClass}>
            <h2 id="broker-verify" className={cardTitleClass}>중개사 인증</h2>
            <p className="mt-3 text-sm text-brand-muted leading-relaxed">
              공인중개사 인증을 받으면 단지 화면에서 매물 엑셀 내보내기, 최신 매물을 다시 받는 데이터 갱신, 화면 인쇄를 쓸 수
              있습니다.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/verify"
                className="inline-flex min-h-11 items-center rounded-lg bg-brand-navy px-4 text-sm font-bold text-white hover:bg-brand-navy/90"
              >
                공인중개사 인증하기
              </Link>
              <Link
                href="/"
                className="inline-flex min-h-11 items-center rounded-lg border border-brand-line px-4 text-sm font-bold text-brand-navy hover:bg-brand-bg"
              >
                단지 찾기
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
