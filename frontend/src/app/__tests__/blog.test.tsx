/**
 * /blog 목록 페이지 + posts 메타데이터 테스트
 * 실행: npx vitest run src/app/__tests__/blog.test.tsx
 *
 * NOTE: /blog/[slug] 상세 페이지는 dynamic import 와 async server component 라
 * vitest jsdom 에서 직접 렌더하기 어렵다 — 메타데이터 단계까지만 검증한다.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import BlogIndexPage from "../blog/page";
import { POSTS, getPostBySlug } from "../blog/posts";

describe("/blog 목록 페이지", () => {
  it("Hero 제목과 5편 카드가 모두 렌더된다", () => {
    const { container } = render(<BlogIndexPage />);
    expect(screen.getByRole("heading", { name: /부동산 인사이트/, level: 1 })).toBeInTheDocument();
    // 모든 글 제목이 카드에 표시
    POSTS.forEach((post) => {
      expect(container.textContent).toContain(post.title);
    });
  });

  it("draft 글은 '준비 중' 뱃지를 달고 비클릭, 발행 글만 클릭 가능", () => {
    render(<BlogIndexPage />);
    const draftCount = POSTS.filter((p) => p.draft).length;
    const publishedCount = POSTS.filter((p) => !p.draft).length;
    // draft 0개여도 단언 가능하도록 queryAllByText 사용 (getAllByText는 0건이면 throw)
    expect(screen.queryAllByText("준비 중").length).toBe(draftCount);
    // 발행 글만 /blog/[slug] 로 링크됨
    const links = screen.getAllByRole("link");
    const blogPostLinks = links.filter((a) => a.getAttribute("href")?.startsWith("/blog/"));
    expect(blogPostLinks.length).toBe(publishedCount);
    const publishedSlugs = POSTS.filter((p) => !p.draft).map((p) => p.slug).sort();
    const linkedSlugs = blogPostLinks
      .map((a) => a.getAttribute("href")?.replace("/blog/", "") ?? "")
      .sort();
    expect(linkedSlugs).toEqual(publishedSlugs);
  });

  it("CTA 푸터가 /signup 으로 링크된다", () => {
    render(<BlogIndexPage />);
    const links = screen.getAllByRole("link");
    const signupLinks = links.filter((a) => a.getAttribute("href") === "/signup");
    expect(signupLinks.length).toBeGreaterThanOrEqual(1);
  });
});

describe("blog/posts 메타데이터", () => {
  it("POSTS — slug 가 모두 unique 하고 발행 글 6편 (전체)", () => {
    expect(POSTS.length).toBe(6);
    const slugs = POSTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(6);
    const publishedSlugs = POSTS.filter((p) => !p.draft).map((p) => p.slug).sort();
    expect(publishedSlugs).toEqual([
      "complex-price-analysis",
      "jeonse-ratio",
      "mibunyang-for-agents",
      "realestate-calculators",
      "realtime-listing",
      "transfer-tax-guide",
    ]);
  });

  it("realestate-calculators 메타 — 출시 톤, /tools/brokerage-fee 안내 키워드", () => {
    const post = getPostBySlug("realestate-calculators");
    expect(post).toBeDefined();
    expect(post?.draft).toBeUndefined();
    expect(post?.title).toContain("중개수수료");
    expect(post?.description).toMatch(/중개수수료|출시/);
    expect(post?.category).toBe("세금");
  });

  it("transfer-tax-guide 메타 — 출시 톤, /tools/transfer-tax 안내 키워드", () => {
    const post = getPostBySlug("transfer-tax-guide");
    expect(post).toBeDefined();
    expect(post?.draft).toBeUndefined();
    expect(post?.title).toContain("양도소득세");
    expect(post?.description).toMatch(/12억|중과|미등기/);
    expect(post?.category).toBe("세금");
  });

  it("getPostBySlug — 존재 slug 반환, 미존재 slug 는 undefined", () => {
    const post = getPostBySlug("jeonse-ratio");
    expect(post?.title).toContain("전세가율");
    expect(getPostBySlug("does-not-exist")).toBeUndefined();
  });
});
