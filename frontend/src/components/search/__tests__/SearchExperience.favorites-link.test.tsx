/**
 * SearchExperience 결과 머리의 '★ 즐겨찾기 매물 →' 링크 — 로그인 확정일 때만 보인다 (세션 493).
 * 비로그인·세션 확인 전에는 안 그린다(보였다 사라지는 깜빡임 방지).
 *
 * 실행: npx vitest run src/components/search/__tests__/SearchExperience.favorites-link.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import SearchExperience from "../SearchExperience";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams("q=래미안"),
  useParams: () => ({}),
}));

const { session } = vi.hoisted(() => ({
  // "pending" 이면 getSession 이 끝나지 않는다(세션 확인 전)
  session: { mode: "public" as "public" | "login" | "pending" },
}));

vi.mock("@/lib/api", () => ({
  searchComplexes: vi.fn().mockResolvedValue({
    complexes: [{ complex_no: "101", complex_name: "래미안테스트", article_count: 5 }],
    total: 1,
  }),
  getComplexesByRegion: vi.fn().mockResolvedValue({ complexes: [], total: 0 }),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: {
      getSession: () => {
        if (session.mode === "pending") return new Promise(() => {});
        return Promise.resolve({
          data: {
            session: session.mode === "login" ? { user: { id: "u1" }, access_token: "tok" } : null,
          },
        });
      },
    },
  }),
}));

function renderIt() {
  return render(
    <TestQueryProvider>
      <SearchExperience />
    </TestQueryProvider>,
  );
}

function favoritesLinks() {
  return document.querySelectorAll('a[href="/search/favorites"]');
}

describe("SearchExperience — 즐겨찾기 매물 링크", () => {
  beforeEach(() => {
    session.mode = "public";
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("비로그인이면 링크가 없다", async () => {
    renderIt();
    await waitFor(() => expect(screen.getAllByText("래미안테스트").length).toBeGreaterThan(0));
    // 비로그인 확정 신호(정렬 기본순 표시)까지 기다린 뒤 단언
    await waitFor(() => expect(screen.getByLabelText("단지 정렬")).toBeInTheDocument());
    expect(favoritesLinks()).toHaveLength(0);
  });

  it("세션 확인 전에도 링크가 없다", async () => {
    session.mode = "pending";
    renderIt();
    await waitFor(() => expect(screen.getAllByText("래미안테스트").length).toBeGreaterThan(0));
    expect(favoritesLinks()).toHaveLength(0);
  });

  it("로그인 상태면 링크가 1개 보인다", async () => {
    session.mode = "login";
    renderIt();
    await waitFor(() => expect(favoritesLinks()).toHaveLength(1));
    expect(screen.getByText(/즐겨찾기 매물/)).toBeInTheDocument();
  });
});
