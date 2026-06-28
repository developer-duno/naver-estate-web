import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { POSTS, getPostBySlug } from "../posts";
import Article from "./Article";
import { BlogPostingJsonLd } from "@/components/StructuredData";
import { SITE_URL } from "@/lib/constants";

export const dynamicParams = false;

export function generateStaticParams() {
  return POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};
  // og:image 는 동적 라우트 blog/[slug]/opengraph-image.tsx 가 PNG 로 자동 주입한다.
  // (화면 hero 는 getHeroAsset 의 SVG 라 카톡·페북 썸네일 미지원 → 동적 PNG 로 분리)
  // 여기서 openGraph.images 를 또 지정하면 중복되므로 생략한다.
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      title: `${post.title} | 2u부동산`,
      description: post.description,
      type: "article",
      publishedTime: post.date,
    },
    robots: post.draft ? { index: false, follow: true } : undefined,
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const { default: MdxContent } = await import(`@/content/blog/${slug}.mdx`);

  return (
    <>
      {!post.draft && (
        <BlogPostingJsonLd
          headline={post.title}
          description={post.description}
          // 검색엔진 대표 이미지도 동적 PNG og(blog/[slug]/opengraph-image)로 통일 — SVG 회피
          image={`${SITE_URL}/blog/${slug}/opengraph-image`}
          datePublished={post.date}
          url={`${SITE_URL}/blog/${slug}`}
          articleSection={post.category}
        />
      )}
      <Article post={post}>
        <MdxContent />
      </Article>
    </>
  );
}
