/**
 * 홈 단지명 검색창 테스트 (세션 295) — 입력+Enter/버튼 → /search?q= 이동, 빈 값 가드
 * 실행: npx vitest run src/app/__tests__/home-keyword-search.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";

const { mockRouter } = vi.hoisted(() => ({
  mockRouter: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

vi.mock("@/lib/api", () => ({
  getStats: vi.fn().mockResolvedValue({ complex_count: 100, article_count: 200 }),
  getRegions: vi.fn().mockResolvedValue({}),
}));

import HomePage from "../page";

function renderHome() {
  return render(<HomePage />, { wrapper: TestQueryProvider });
}

describe("홈 — 단지명 검색창", () => {
  beforeEach(() => { mockRouter.push.mockClear(); });
  afterEach(() => { localStorage.removeItem("search_history"); });

  it("단지명 입력 후 Enter → /search?q= 로 이동하고 히스토리에 저장된다", () => {
    renderHome();
    const input = screen.getByLabelText("단지명 검색");
    fireEvent.change(input, { target: { value: "래미안" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    const url = mockRouter.push.mock.calls[0][0] as string;
    expect(url).toContain("/search?");
    expect(url).toContain(`q=${encodeURIComponent("래미안")}`);
    expect(localStorage.getItem("search_history")).toContain("래미안");
  });

  it("검색 버튼 클릭으로도 동일하게 이동한다", () => {
    renderHome();
    fireEvent.change(screen.getByLabelText("단지명 검색"), { target: { value: "힐스테이트" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push.mock.calls[0][0]).toContain(`q=${encodeURIComponent("힐스테이트")}`);
  });

  it("빈 값/공백만 입력은 이동하지 않는다 (trim 가드)", () => {
    renderHome();
    const input = screen.getByLabelText("단지명 검색");
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("매물유형 탭을 좁히면 types 파라미터가 함께 전달된다 (기본 APT 단독 선택)", () => {
    renderHome();
    fireEvent.change(screen.getByLabelText("단지명 검색"), { target: { value: "래미안" } });
    fireEvent.keyDown(screen.getByLabelText("단지명 검색"), { key: "Enter" });
    // 홈 기본 selectedTypes = ["APT"] (전체 7종보다 좁음) → types=APT 포함
    expect(mockRouter.push.mock.calls[0][0]).toContain("types=APT");
  });
});
