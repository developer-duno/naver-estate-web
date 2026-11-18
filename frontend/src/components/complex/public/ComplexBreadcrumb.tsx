import Link from "next/link";
import { breadcrumbJsonLd, type Crumb } from "@/lib/seo/complex-page";

/**
 * 빵부스러기(서버가 그림, 세션 483 PR 3b · 세션 484 PR 3c-1b 부터 지역 장도 같이 씀) — 홈 › 시도 › 시군구 › 동 › 단지.
 * 링크는 미리 받기 끔(prefetch false — 단지 장마다 허브·동 장을 미리 그리지 않게, v2 O3).
 * 갈 페이지가 없는 단계(시도·지역 페이지 열리기 전의 시군구·동)는 글자만. 마지막(이 단지)은 aria-current.
 * 같은 값으로 BreadcrumbList JSON-LD 를 함께 싣는다.
 */
/** 글자 색 두 벌 — default = 지금 그대로(지역 3장) · navy = 남색 띠 안(단지 장, 세션 524 B40 PR 1) */
const TONES = {
  default: { nav: "text-xs text-gray-500", current: "text-gray-700" },
  navy: { nav: "text-[13px] text-brand-orange", current: "text-brand-on-navy-muted" },
} as const;

export default function ComplexBreadcrumb({ crumbs, tone = "default" }: { crumbs: Crumb[]; tone?: keyof typeof TONES }) {
  const last = crumbs.length - 1;
  const t = TONES[tone];
  return (
    <>
      <nav aria-label="현재 위치" className={t.nav}>
        <ol className="flex flex-wrap items-center gap-1">
          {crumbs.map((c, i) => (
            <li key={`${i}-${c.name}`} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden="true">›</span>}
              {i === last ? (
                <span aria-current="page" className={t.current}>{c.name}</span>
              ) : c.href ? (
                <Link href={c.href} prefetch={false} className="hover:underline">{c.name}</Link>
              ) : (
                <span>{c.name}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <script
        type="application/ld+json"
        // StructuredData.tsx 와 같은 방식 — 우리가 만든 객체만 직렬화, "<"·">" 를 유니코드로 바꿔 </script> 조기 종료 방지
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbJsonLd(crumbs)).replace(/</g, "\\u003c").replace(/>/g, "\\u003e"),
        }}
      />
    </>
  );
}
