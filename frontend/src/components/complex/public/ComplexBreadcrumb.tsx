import Link from "next/link";
import { breadcrumbJsonLd, type Crumb } from "@/lib/seo/complex-page";

/**
 * 빵부스러기(서버가 그림, 세션 483 PR 3b · 세션 484 PR 3c-1b 부터 지역 장도 같이 씀) — 홈 › 시도 › 시군구 › 동 › 단지.
 * 링크는 미리 받기 끔(prefetch false — 단지 장마다 허브·동 장을 미리 그리지 않게, v2 O3).
 * 갈 페이지가 없는 단계(시도·지역 페이지 열리기 전의 시군구·동)는 글자만. 마지막(이 단지)은 aria-current.
 * 같은 값으로 BreadcrumbList JSON-LD 를 함께 싣는다.
 */
export default function ComplexBreadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  const last = crumbs.length - 1;
  return (
    <>
      <nav aria-label="현재 위치" className="text-xs text-gray-500">
        <ol className="flex flex-wrap items-center gap-1">
          {crumbs.map((c, i) => (
            <li key={`${i}-${c.name}`} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden="true">›</span>}
              {i === last ? (
                <span aria-current="page" className="text-gray-700">{c.name}</span>
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
