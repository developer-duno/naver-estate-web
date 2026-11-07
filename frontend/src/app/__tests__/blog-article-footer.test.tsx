/**
 * 블로그 글 아래 가입 상자 — '대출' 분류 글에는 붙이지 않는다 (세션 502)
 * 대출 경고 글 바로 아래 「무료로 시작하기」가 대출 신청 단추처럼 읽히지 않게.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Article from "../blog/[slug]/Article";
import { getPostBySlug } from "../blog/posts";

describe("블로그 글 아래 가입 상자", () => {
  it("'대출' 분류 글에는 가입 단추가 없다", () => {
    const post = getPostBySlug("illegal-loan-filter")!;
    expect(post.category).toBe("대출");
    render(<Article post={post}><p>본문</p></Article>);
    expect(screen.queryByRole("link", { name: /무료로 시작하기/ })).not.toBeInTheDocument();
  });

  it("다른 분류 글에는 가입 단추가 그대로 있다", () => {
    const post = getPostBySlug("jeonse-ratio")!;
    render(<Article post={post}><p>본문</p></Article>);
    expect(screen.getByRole("link", { name: /무료로 시작하기/ })).toHaveAttribute("href", "/signup");
  });
});
