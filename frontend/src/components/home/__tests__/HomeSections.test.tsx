/**
 * HomeSections 대기 화면(정적 프리렌더 = 첫 HTML) 모양 + 가이드 고르기(세션 508)
 * - interactive=false: JS 없이 /?q= 로 가는 GET 검색 · 대출 판·지역·계산기·가이드는 그대로 · 즐겨찾기 없음 · 시세 카드는 자리만
 * 실행: npx vitest run src/components/home/__tests__/HomeSections.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import HomeSections from "../HomeSections";
import { HomeSearchBoxStatic } from "../HomeSearchBox";
import { homeGuidePosts } from "../HomeGuide";
import type { BlogPost } from "@/app/blog/posts";

describe("HomeSections — 대기 화면", () => {
  it("GET 검색 form(action=/ · name=q) 과 홈 칸들을 그린다", () => {
    const { container } = render(<HomeSections search={<HomeSearchBoxStatic />} interactive={false} />);
    const form = container.querySelector("form");
    expect(form).toHaveAttribute("action", "/");
    expect(form).toHaveAttribute("method", "get");
    expect(screen.getByLabelText("단지 또는 지역 검색")).toHaveAttribute("name", "q");
    expect(screen.getByRole("heading", { level: 2, name: "집을 담보로 더 받을 수 있는 한도부터 확인하세요" })).toBeInTheDocument();
    expect(container.querySelectorAll('a[href^="/region#"]')).toHaveLength(17);
    expect(container.querySelector('a[href="/tools/second-mortgage"]')).not.toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "지역 시세 흐름" })).toBeInTheDocument();
    expect(screen.getByText("불러오는 중...")).toBeInTheDocument();
    expect(screen.queryByText("즐겨찾기")).not.toBeInTheDocument();
  });
});

describe("homeGuidePosts", () => {
  const post = (slug: string, date: string, draft = false): BlogPost =>
    ({ slug, title: slug, description: "", date, category: "도구 활용", readingTime: 1, draft }) as BlogPost;

  it("대출 글을 맨 앞에 두고 나머지는 최신순 · 초안 제외 · 3편", () => {
    const picks = homeGuidePosts([
      post("old", "2026-01-01"),
      post("illegal-loan-filter", "2026-05-01"),
      post("new", "2026-11-01"),
      post("mid", "2026-08-01"),
      post("draft", "2026-12-01", true),
    ]);
    expect(picks.map((p) => p.slug)).toEqual(["illegal-loan-filter", "new", "mid"]);
  });

  it("대출 글이 없으면 최신 3편", () => {
    const picks = homeGuidePosts([post("a", "2026-01-01"), post("b", "2026-02-01"), post("c", "2026-03-01"), post("d", "2026-04-01")]);
    expect(picks.map((p) => p.slug)).toEqual(["d", "c", "b"]);
  });
});
