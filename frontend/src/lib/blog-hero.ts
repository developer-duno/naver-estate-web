import type { BlogPost, BlogCategory } from "@/types/blog";

const SLUG_ASSET: Record<string, string> = {
  "jeonse-ratio": "/blog-hero/jeonse-ratio.webp",
  "complex-price-analysis": "/blog-hero/complex-price-analysis.webp",
  "asking-vs-actual-price": "/blog-hero/asking-vs-actual-price.webp",
  "agent-verification-guide": "/blog-hero/agent-verification-guide.webp",
  "property-tax-tool-guide": "/blog-hero/property-tax-tool-guide.svg",
};

const CATEGORY_FALLBACK: Record<BlogCategory, string> = {
  "시세 분석": "/blog-hero/category-price.webp",
  "세금": "/blog-hero/category-tax.webp",
  "도구 활용": "/blog-hero/category-tools.webp",
  "미분양": "/blog-hero/category-mibunyang.webp",
};

const FINAL_FALLBACK = "/blog-hero/_fallback.svg";

export function getHeroAsset(post: Pick<BlogPost, "slug" | "category">): string {
  return SLUG_ASSET[post.slug] ?? CATEGORY_FALLBACK[post.category] ?? FINAL_FALLBACK;
}
