import type { BlogPost, BlogCategory } from "@/types/blog";

const SLUG_ASSET: Record<string, string> = {
  "jeonse-ratio": "/blog-hero/jeonse-ratio.webp",
  "complex-price-analysis": "/blog-hero/complex-price-analysis.webp",
  "asking-vs-actual-price": "/blog-hero/asking-vs-actual-price.webp",
  "agent-verification-guide": "/blog-hero/agent-verification-guide.webp",
  "property-tax-tool-guide": "/blog-hero/property-tax-tool-guide.svg",
  "acquisition-tax-tool-guide": "/blog-hero/acquisition-tax-tool-guide.svg",
  "transfer-tax-tool-guide": "/blog-hero/transfer-tax-tool-guide.svg",
  "compare-workflow": "/blog-hero/compare-workflow.svg",
  "realtime-listing": "/blog-hero/realtime-listing.svg",
  "mibunyang-radar-weights": "/blog-hero/mibunyang-radar-weights.svg",
  "mibunyang-for-agents": "/blog-hero/mibunyang-for-agents.svg",
};

const CATEGORY_FALLBACK: Record<BlogCategory, string> = {
  "시세 분석": "/blog-hero/category-price.webp",
  "세금": "/blog-hero/category-tax.webp",
  "도구 활용": "/blog-hero/category-tools.webp",
  "미분양": "/blog-hero/category-mibunyang.webp",
  // 분류 '대출'(세션 502)은 전용 그림이 아직 없어 마지막 대체 그림과 같은 파일을 쓴다.
  "대출": "/blog-hero/_fallback.svg",
};

const FINAL_FALLBACK = "/blog-hero/_fallback.svg";

export function getHeroAsset(post: Pick<BlogPost, "slug" | "category">): string {
  return SLUG_ASSET[post.slug] ?? CATEGORY_FALLBACK[post.category] ?? FINAL_FALLBACK;
}
