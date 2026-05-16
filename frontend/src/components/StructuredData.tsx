/** SEO 구조화 데이터(JSON-LD) 헬퍼. server component 에서 직접 렌더 */

import { SITE_URL } from "@/lib/constants";

/** JSON-LD 직렬화 — `</script>` 조기 종료 방지를 위해 `<`/`>` 를 유니코드 이스케이프 */
function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

interface WebSiteJsonLdProps {
  name: string;
  url: string;
  description?: string;
}

export function WebSiteJsonLd({ name, url, description }: WebSiteJsonLdProps) {
  const data = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    url,
    ...(description ? { description } : {}),
    inLanguage: "ko-KR",
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}

interface BlogPostingJsonLdProps {
  headline: string;
  description: string;
  /** 절대 URL (호출측에서 SITE_URL prefix 완료) */
  image: string;
  datePublished: string;
  /** 미전달 시 datePublished 로 fallback */
  dateModified?: string;
  /** 절대 canonical URL */
  url: string;
  articleSection: string;
}

/** 블로그 글 페이지용 BlogPosting JSON-LD. server component 에서 직접 렌더 */
export function BlogPostingJsonLd({
  headline,
  description,
  image,
  datePublished,
  dateModified,
  url,
  articleSection,
}: BlogPostingJsonLdProps) {
  const organization = {
    "@type": "Organization",
    name: "2u부동산",
    url: SITE_URL,
  };
  const data = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline,
    description,
    image,
    datePublished,
    dateModified: dateModified ?? datePublished,
    author: organization,
    publisher: organization,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    inLanguage: "ko-KR",
    articleSection,
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
