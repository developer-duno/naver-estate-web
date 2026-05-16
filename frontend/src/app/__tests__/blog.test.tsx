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
  it("Hero 제목과 23편 카드가 모두 렌더된다", () => {
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
  it("POSTS — slug 가 모두 unique 하고 발행 글 23편 (전체)", () => {
    expect(POSTS.length).toBe(23);
    const slugs = POSTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(23);
    const publishedSlugs = POSTS.filter((p) => !p.draft).map((p) => p.slug).sort();
    expect(publishedSlugs).toEqual([
      "acquisition-tax-tool-guide",
      "agent-verification-guide",
      "asking-price-trend",
      "asking-vs-actual-price",
      "buy-timing-signals",
      "compare-workflow",
      "complex-price-analysis",
      "jeonse-ratio",
      "mibunyang-detail-bars-guide",
      "mibunyang-detail-sections-guide",
      "mibunyang-for-agents",
      "mibunyang-price-discount-guide",
      "mibunyang-radar-weights",
      "print-excel-workflow",
      "property-tax-exclusion-guide",
      "property-tax-guide",
      "property-tax-tool-guide",
      "realestate-calculators",
      "realtime-listing",
      "search-history-workflow",
      "transfer-tax-exemption-guide",
      "transfer-tax-guide",
      "transfer-tax-tool-guide",
    ]);
  });

  it("buy-timing-signals 메타 — 시세 분석 카테고리, 3 축 신호 키워드", () => {
    const post = getPostBySlug("buy-timing-signals");
    expect(post).toBeDefined();
    expect(post?.draft).toBeUndefined();
    expect(post?.title).toContain("매수 타이밍");
    expect(post?.description).toMatch(/시세 추이|거래량|미분양율/);
    expect(post?.category).toBe("시세 분석");
  });

  it("realestate-calculators 메타 — 5종 출시 완료 톤", () => {
    const post = getPostBySlug("realestate-calculators");
    expect(post).toBeDefined();
    expect(post?.draft).toBeUndefined();
    expect(post?.title).toContain("계산기");
    expect(post?.description).toMatch(/5종|출시 완료/);
    expect(post?.category).toBe("세금");
  });

  it("property-tax-exclusion-guide 메타 — 세금 카테고리, 합산배제 키워드", () => {
    const post = getPostBySlug("property-tax-exclusion-guide");
    expect(post).toBeDefined();
    expect(post?.draft).toBeUndefined();
    expect(post?.title).toContain("합산배제");
    expect(post?.description).toMatch(/임대주택|사원용|9종/);
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

  it("transfer-tax-exemption-guide 메타 — 세금 카테고리, 비과세 요건 키워드", () => {
    const post = getPostBySlug("transfer-tax-exemption-guide");
    expect(post).toBeDefined();
    expect(post?.draft).toBeUndefined();
    expect(post?.title).toContain("비과세");
    expect(post?.description).toMatch(/거주요건|조정대상지역|2년|12억/);
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

  it("asking-price-trend 메타 — 시세 분석 카테고리, 호가 변동 추이 키워드", () => {
    const post = getPostBySlug("asking-price-trend");
    expect(post).toBeDefined();
    expect(post?.draft).toBeUndefined();
    expect(post?.title).toContain("호가 변동");
    expect(post?.description).toMatch(/가격 변동 이력|화살표|협상|매도자/);
    expect(post?.category).toBe("시세 분석");
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

  it("mibunyang-detail-bars-guide 메타 — 미분양 카테고리, 진행바 14종 키워드", () => {
    const post = getPostBySlug("mibunyang-detail-bars-guide");
    expect(post).toBeDefined();
    expect(post?.draft).toBeUndefined();
    expect(post?.title).toContain("진행바");
    expect(post?.description).toMatch(/세대수|최고층|주차|건폐율|미분양률|전세율|취소율|소음도/);
    expect(post?.category).toBe("미분양");
  });

  it("mibunyang-detail-sections-guide 메타 — 미분양 카테고리, 5 단원 도해 키워드", () => {
    const post = getPostBySlug("mibunyang-detail-sections-guide");
    expect(post).toBeDefined();
    expect(post?.draft).toBeUndefined();
    expect(post?.title).toContain("5 단원");
    expect(post?.description).toMatch(/개요|분양|거래|주변환경|위치|진행바 14종/);
    expect(post?.category).toBe("미분양");
    expect(post?.date).toBe("2026-05-16");
  });

  it("mibunyang-price-discount-guide 메타 — 미분양 카테고리, 분양가·할인율·평당가 키워드", () => {
    const post = getPostBySlug("mibunyang-price-discount-guide");
    expect(post).toBeDefined();
    expect(post?.draft).toBeUndefined();
    expect(post?.title).toContain("분양가");
    expect(post?.description).toMatch(/분양가|할인율|평당가|평형별|HUG/);
    expect(post?.category).toBe("미분양");
    expect(post?.date).toBe("2026-05-16");
  });

  it("agent-verification-guide 메타 — 도구 활용 카테고리, 인증 워크플로 키워드", () => {
    const post = getPostBySlug("agent-verification-guide");
    expect(post).toBeDefined();
    expect(post?.draft).toBeUndefined();
    expect(post?.title).toContain("공인중개사 인증");
    expect(post?.description).toMatch(/사업자등록|자격증|JPG|상태 4|전문가/);
    expect(post?.category).toBe("도구 활용");
  });

  it("search-history-workflow 메타 — 도구 활용 카테고리, 검색 히스토리 키워드", () => {
    const post = getPostBySlug("search-history-workflow");
    expect(post).toBeDefined();
    expect(post?.draft).toBeUndefined();
    expect(post?.title).toContain("검색 히스토리");
    expect(post?.description).toMatch(/10개|재방문|브라우저|북마크/);
    expect(post?.category).toBe("도구 활용");
  });

  it("print-excel-workflow 메타 — 도구 활용 카테고리, 인쇄·엑셀 키워드", () => {
    const post = getPostBySlug("print-excel-workflow");
    expect(post).toBeDefined();
    expect(post?.draft).toBeUndefined();
    expect(post?.title).toContain("인쇄·엑셀");
    expect(post?.description).toMatch(/단지비교|미분양|인쇄|수식 인젝션/);
    expect(post?.category).toBe("도구 활용");
  });

  it("getPostBySlug — 존재 slug 반환, 미존재 slug 는 undefined", () => {
    const post = getPostBySlug("jeonse-ratio");
    expect(post?.title).toContain("전세가율");
    expect(getPostBySlug("does-not-exist")).toBeUndefined();
  });
});
