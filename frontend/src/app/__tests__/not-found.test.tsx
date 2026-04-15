/**
 * 404 페이지 테스트 — 홈/검색 링크 존재 확인
 * 실행: npx vitest run src/app/__tests__/not-found.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import NotFound from "../not-found";

// ErrorActions 는 useSmartBack → next/navigation 에 의존하므로 router 모킹
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

describe("NotFound 404 페이지", () => {
  it("'404' 헤더와 안내 메시지가 렌더된다", () => {
    render(<NotFound />);
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText(/페이지를 찾을 수 없습니다/)).toBeInTheDocument();
  });

  it("홈/검색/이전 페이지 액션이 모두 존재한다", () => {
    render(<NotFound />);
    // Link 는 <a> 로 렌더
    expect(screen.getByRole("link", { name: "홈으로" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "검색" })).toHaveAttribute("href", "/search");
    expect(screen.getByRole("button", { name: "이전 페이지" })).toBeInTheDocument();
  });
});
