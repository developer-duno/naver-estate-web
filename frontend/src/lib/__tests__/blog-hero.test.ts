import { describe, it, expect } from "vitest";
import { getHeroAsset } from "../blog-hero";

describe("getHeroAsset", () => {
  it("slug.webp 자산이 있으면 우선 매핑 (mdx 4편)", () => {
    expect(getHeroAsset({ slug: "jeonse-ratio", category: "시세 분석" })).toBe(
      "/blog-hero/jeonse-ratio.webp",
    );
    expect(
      getHeroAsset({ slug: "complex-price-analysis", category: "시세 분석" }),
    ).toBe("/blog-hero/complex-price-analysis.webp");
  });

  it("slug.svg 폴백 (property-tax-tool-guide 1편)", () => {
    expect(
      getHeroAsset({ slug: "property-tax-tool-guide", category: "도구 활용" }),
    ).toBe("/blog-hero/property-tax-tool-guide.svg");
  });

  it("slug.svg compare-workflow / realtime-listing 신설 매핑", () => {
    expect(
      getHeroAsset({ slug: "compare-workflow", category: "도구 활용" }),
    ).toBe("/blog-hero/compare-workflow.svg");
    expect(
      getHeroAsset({ slug: "realtime-listing", category: "도구 활용" }),
    ).toBe("/blog-hero/realtime-listing.svg");
  });

  it("slug 자산 부재 시 카테고리 폴백 (4 카테고리)", () => {
    expect(getHeroAsset({ slug: "no-asset-1", category: "시세 분석" })).toBe(
      "/blog-hero/category-price.webp",
    );
    expect(getHeroAsset({ slug: "no-asset-2", category: "세금" })).toBe(
      "/blog-hero/category-tax.webp",
    );
    expect(getHeroAsset({ slug: "no-asset-3", category: "도구 활용" })).toBe(
      "/blog-hero/category-tools.webp",
    );
    expect(getHeroAsset({ slug: "no-asset-4", category: "미분양" })).toBe(
      "/blog-hero/category-mibunyang.webp",
    );
  });

  it("최종 폴백 _fallback.svg (slug + 카테고리 모두 부재)", () => {
    expect(
      getHeroAsset({
        slug: "no-asset",
        category: "unknown" as never,
      }),
    ).toBe("/blog-hero/_fallback.svg");
  });
});
