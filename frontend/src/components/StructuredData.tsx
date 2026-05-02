/** SEO 구조화 데이터(JSON-LD) 헬퍼. server component 에서 직접 렌더 */

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
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
