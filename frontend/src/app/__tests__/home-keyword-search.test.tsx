/**
 * 홈 단지명 검색창 테스트 — 세션 314 홈/검색 통합 후 정정.
 * 홈이 SearchExperience 를 품어 검색 시 같은 페이지(/?q=)에서 결과 표시. 빈 값 가드 유지.
 * 실행: npx vitest run src/app/__tests__/home-keyword-search.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";

const { mockRouter, mockSearchParams } = vi.hoisted(() => ({
  mockRouter: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
  mockSearchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/",
}));

vi.mock("@/lib/api", () => ({
  getStats: vi.fn().mockResolvedValue({ complex_count: 100, article_count: 200 }),
  getRegions: vi.fn().mockResolvedValue({}),
  searchComplexes: vi.fn().mockResolvedValue({ complexes: [] }),
  getComplexesByRegion: vi.fn().mockResolvedValue({ complexes: [] }),
}));

import HomePage from "../page";

function renderHome() {
  return render(<HomePage />, { wrapper: TestQueryProvider });
}

describe("홈 — 단지명 검색창 (홈/검색 통합)", () => {
  beforeEach(() => { mockRouter.push.mockClear(); });
  afterEach(() => { localStorage.removeItem("search_history"); });

  it("단지명 입력 후 Enter → 홈(/?q=)에서 검색하고 히스토리에 저장된다", () => {
    renderHome();
    const input = screen.getByLabelText("단지명 검색");
    fireEvent.change(input, { target: { value: "래미안" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    const url = mockRouter.push.mock.calls[0][0] as string;
    // 홈에서 검색 → 같은 페이지(/) 기준 URL (검색 메뉴 없이 홈 한 화면)
    expect(url).toContain(`q=${encodeURIComponent("래미안")}`);
    expect(url.startsWith("/?")).toBe(true);
    expect(localStorage.getItem("search_history")).toContain("래미안");
  });

  it("검색 버튼 클릭으로도 동일하게 검색한다", () => {
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
});
