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
  it("Hero 제목과 15편 카드가 모두 렌더된다", () => {
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
  it("POSTS — slug 가 모두 unique 하고 발행 글 15편 (전체)", () => {
    expect(POSTS.length).toBe(15);
    const slugs = POSTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(15);
    const publishedSlugs = POSTS.filter((p) => !p.draft).map((p) => p.slug).sort();
    expect(publishedSlugs).toEqual([
      "acquisition-tax-tool-guide",
      "agent-verification-guide",
      "article-notes-workflow",
      "asking-vs-actual-price",
      "compare-workflow",
      "complex-price-analysis",
      "jeonse-ratio",
      "mibunyang-for-agents",
      "mibunyang-radar-weights",
      "property-tax-guide",
      "property-tax-tool-guide",
      "realestate-calculators",
      "realtime-listing",
      "transfer-tax-guide",
      "transfer-tax-tool-guide",
    ]);
  });

  it("realestate-calculators 메타 — 5종 출시 완료 톤", () => {
    const post = getPostBySlug("realestate-calculators");
    expect(post).toBeDefined();
    expect(post?.draft).toBeUndefined();
    expect(post?.title).toContain("계산기");
    expect(post?.description).toMatch(/5종|출시 완료/);
    expect(post?.category).toBe("세금");
  });

  it("property-tax-guide 메타 — 출시 톤, 보유세 키워드", () => {
    const post = getPostBySlug("property-tax-guide");
    expect(post).toBeDefined();
    expect(post?.draft).toBeUndefined();
    expect(post?.title).toContain("보유세");
    expect(post?.description).toMatch(/12억|9억|농특세|중과/);
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

  it("compare-workflow 메타 — 도구 활용 카테고리, /compare 24행 키워드", () => {
    const post = getPostBySlug("compare-workflow");
    expect(post).toBeDefined();
    expect(post?.draft).toBeUndefined();
    expect(post?.title).toContain("24행");
    expect(post?.description).toMatch(/평당가|차트|엑셀|5분/);
    expect(post?.category).toBe("도구 활용");
  });

  it("article-notes-workflow 메타 — 도구 활용 카테고리, 매물 메모 키워드", () => {
    const post = getPostBySlug("article-notes-workflow");
    expect(post).toBeDefined();
    expect(post?.draft).toBeUndefined();
    expect(post?.title).toContain("매물 메모");
    expect(post?.description).toMatch(/500자|즐겨찾기|3 진입점|localStorage/);
    expect(post?.category).toBe("도구 활용");
  });

  it("property-tax-tool-guide 메타 — 도구 활용 카테고리, 보유세 도구 키워드", () => {
    const post = getPostBySlug("property-tax-tool-guide");
    expect(post).toBeDefined();
    expect(post?.draft).toBeUndefined();
    expect(post?.title).toContain("보유세");
    expect(post?.description).toMatch(/공동명의|합산배제|법인|보유기간/);
    expect(post?.category).toBe("도구 활용");
  });

  it("transfer-tax-tool-guide 메타 — 도구 활용 카테고리, 양도세 도구 키워드", () => {
    const post = getPostBySlug("transfer-tax-tool-guide");
    expect(post).toBeDefined();
    expect(post?.draft).toBeUndefined();
    expect(post?.title).toContain("양도세");
    expect(post?.description).toMatch(/12억|단기|중과|한시배제|미등기/);
    expect(post?.category).toBe("도구 활용");
  });

  it("asking-vs-actual-price 메타 — 시세 분석 카테고리, 호가 vs 실거래가 키워드", () => {
    const post = getPostBySlug("asking-vs-actual-price");
    expect(post).toBeDefined();
    expect(post?.draft).toBeUndefined();
    expect(post?.title).toContain("호가");
    expect(post?.description).toMatch(/실거래가|격차|협상|공공데이터/);
    expect(post?.category).toBe("시세 분석");
  });

  it("acquisition-tax-tool-guide 메타 — 도구 활용 카테고리, 취득세 도구 키워드", () => {
    const post = getPostBySlug("acquisition-tax-tool-guide");
    expect(post).toBeDefined();
    expect(post?.draft).toBeUndefined();
    expect(post?.title).toContain("취득세");
    expect(post?.description).toMatch(/표준세율|중과|생애최초|85m²|보간/);
    expect(post?.category).toBe("도구 활용");
  });

  it("mibunyang-radar-weights 메타 — 미분양 카테고리, 레이더 가중치 키워드", () => {
    const post = getPostBySlug("mibunyang-radar-weights");
    expect(post).toBeDefined();
    expect(post?.draft).toBeUndefined();
    expect(post?.title).toContain("레이더");
    expect(post?.description).toMatch(/13축|가중치|프리셋|78점|성향/);
    expect(post?.category).toBe("미분양");
  });

  it("agent-verification-guide 메타 — 도구 활용 카테고리, 인증 워크플로 키워드", () => {
    const post = getPostBySlug("agent-verification-guide");
    expect(post).toBeDefined();
    expect(post?.draft).toBeUndefined();
    expect(post?.title).toContain("공인중개사 인증");
    expect(post?.description).toMatch(/사업자등록|자격증|JPG|상태 4|전문가/);
    expect(post?.category).toBe("도구 활용");
  });

  it("getPostBySlug — 존재 slug 반환, 미존재 slug 는 undefined", () => {
    const post = getPostBySlug("jeonse-ratio");
    expect(post?.title).toContain("전세가율");
    expect(getPostBySlug("does-not-exist")).toBeUndefined();
  });
});
