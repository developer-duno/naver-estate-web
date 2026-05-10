/**
 * BlogHero 컴포넌트 테스트 — slug 자동 매핑 + priority 전파 + alt 정합
 * 실행: npx vitest run src/components/blog/__tests__/BlogHero.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import BlogHero from "../BlogHero";
import type { BlogPost } from "@/types/blog";

function makePost(overrides: Partial<BlogPost> = {}): Pick<BlogPost, "slug" | "category" | "title"> {
  return {
    slug: "test-slug",
    category: "시세 분석",
    title: "테스트 글 제목",
    ...overrides,
  };
}

describe("BlogHero", () => {
  it("post.slug 자산이 있으면 해당 webp 렌더 (jeonse-ratio)", () => {
    render(<BlogHero post={makePost({ slug: "jeonse-ratio", category: "시세 분석" })} />);
    const img = screen.getByRole("img");
    // next/Image src 는 _next/image 로 변환되므로 src 안에 jeonse-ratio.webp 가 인코딩되어 있는지 확인
    expect(img.getAttribute("src")).toContain("jeonse-ratio");
  });

  it("slug 자산 부재 시 카테고리 폴백 webp 렌더 (시세 분석 → category-price)", () => {
    render(<BlogHero post={makePost({ slug: "no-such-slug", category: "시세 분석" })} />);
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toContain("category-price");
  });

  it("priority prop 명시 호출 시 next/Image priority 전파", () => {
    render(<BlogHero post={makePost()} priority />);
    const img = screen.getByRole("img");
    // next/Image priority=true 시 fetchpriority="high" 또는 loading 미설정
    // fetchpriority 속성 박제 확인 (Next.js 14+)
    expect(img.getAttribute("loading")).not.toBe("lazy");
  });

  it("alt 텍스트 = post.title (스크린리더 정합)", () => {
    render(<BlogHero post={makePost({ title: "전세가율 계산법" })} />);
    const img = screen.getByRole("img");
    expect(img.getAttribute("alt")).toBe("전세가율 계산법");
  });

  it("acquisition-tax-tool-guide slug 자산 svg 렌더 (카테고리 폴백 우회)", () => {
    render(<BlogHero post={makePost({ slug: "acquisition-tax-tool-guide", category: "도구 활용" })} />);
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toContain("acquisition-tax-tool-guide");
  });

  it("transfer-tax-tool-guide slug 자산 svg 렌더 (카테고리 폴백 우회)", () => {
    render(<BlogHero post={makePost({ slug: "transfer-tax-tool-guide", category: "도구 활용" })} />);
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toContain("transfer-tax-tool-guide");
  });
});
