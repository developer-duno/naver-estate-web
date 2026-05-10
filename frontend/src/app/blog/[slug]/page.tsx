import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { POSTS, getPostBySlug } from "../posts";
import Article from "./Article";
import { getHeroAsset } from "@/lib/blog-hero";

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
  const heroAsset = getHeroAsset(post);
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      title: `${post.title} | 2u부동산`,
      description: post.description,
      type: "article",
      publishedTime: post.date,
      images: [
        {
          url: heroAsset,
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
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
    <Article post={post}>
      <MdxContent />
    </Article>
  );
}
