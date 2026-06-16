/**
 * 홈 즐겨찾기 칩 slice(0,10) + "+N개 더보기" 테스트 (세션 299 A2)
 * 실행: npx vitest run src/app/__tests__/home-favorites-slice.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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

/** favorite_complexes 시드 — toggleFavorite(unshift) 답습으로 최신이 앞 */
function seedFavorites(count: number) {
  const items = Array.from({ length: count }, (_, i) => ({
    complex_no: `C${i + 1}`,
    complex_name: `단지${i + 1}`,
    added_at: 1000 + count - i,
  }));
  localStorage.setItem("favorite_complexes", JSON.stringify(items));
}

function renderHome() {
  return render(<HomePage />, { wrapper: TestQueryProvider });
}

describe("홈 — 즐겨찾기 칩 10개 제한 + 더보기", () => {
  beforeEach(() => {
    mockRouter.push.mockClear();
    localStorage.clear();
  });

  it("12개 저장 시 앞 10개만 노출 + '+2개 더보기' 버튼", async () => {
    seedFavorites(12);
    renderHome();

    // localStorage 는 effect 에서 읽음 → 칩 등장 대기
    expect(await screen.findByRole("button", { name: /단지1$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /단지10$/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /단지11$/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+2개 더보기" })).toBeInTheDocument();
  });

  it("'+N개 더보기' 클릭 → 전체 노출 + 버튼 사라짐", async () => {
    seedFavorites(12);
    renderHome();

    fireEvent.click(await screen.findByRole("button", { name: "+2개 더보기" }));
    expect(screen.getByRole("button", { name: /단지12$/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+2개 더보기" })).not.toBeInTheDocument();
  });

  it("정확히 10개면 더보기 버튼 미노출 (경계값)", async () => {
    seedFavorites(10);
    renderHome();

    expect(await screen.findByRole("button", { name: /단지10$/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /더보기/ })).not.toBeInTheDocument();
  });

  it("칩 클릭 시 단지 상세로 이동 (기존 동작 유지)", async () => {
    seedFavorites(3);
    renderHome();

    fireEvent.click(await screen.findByRole("button", { name: /단지2$/ }));
    expect(mockRouter.push).toHaveBeenCalledWith("/complex/C2");
  });
});
