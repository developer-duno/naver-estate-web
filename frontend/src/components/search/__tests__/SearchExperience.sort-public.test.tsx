/**
 * SearchExperience — 비로그인 검색 정렬에서 '매물 많은순' 숨김 (세션 491).
 * 숨김은 비로그인 확정(세션 해석 끝 + 로그인 아님)일 때만, 토큰 확인 전·로그인은 7개 그대로.
 *
 * 실행: npx vitest run src/components/search/__tests__/SearchExperience.sort-public.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestQueryProvider } from "@/test-setup";
import SearchExperience from "../SearchExperience";

// 주소에 '매물 많은순' 이 들어 있는 채로 들어온 손님
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams("q=래미안&complex_sort=article_desc"),
  useParams: () => ({}),
}));

const { session } = vi.hoisted(() => ({
  // getSession 결과를 시험마다 바꾼다 — "pending" 이면 끝나지 않는 대기(토큰 확인 전)
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

async function openSort() {
  const trigger = await screen.findByLabelText("단지 정렬");
  await userEvent.setup().click(trigger);
  return trigger;
}

describe("SearchExperience — 비로그인 정렬 선택지", () => {
  beforeEach(() => {
    session.mode = "public";
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("비로그인: 6개만 보이고 주소가 article_desc 여도 '기본순' 으로 표시", async () => {
    renderIt();
    await waitFor(() => expect(screen.getAllByText("래미안테스트").length).toBeGreaterThan(0));
    // 세션 해석(비로그인 확정)이 끝나 trigger 값이 기본순으로 바뀔 때까지 기다린다
    await waitFor(() => expect(screen.getByLabelText("단지 정렬").textContent).toContain("기본순"));
    await openSort();
    expect(screen.getAllByRole("option")).toHaveLength(6);
    expect(screen.queryByRole("option", { name: "매물 많은순" })).not.toBeInTheDocument();
  });

  it("로그인: 7개 그대로 + 주소의 '매물 많은순' 유지", async () => {
    session.mode = "login";
    renderIt();
    await waitFor(() => expect(screen.getAllByText("래미안테스트").length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByLabelText("단지 정렬").textContent).toContain("매물 많은순"));
    await openSort();
    expect(screen.getAllByRole("option")).toHaveLength(7);
  });

  it("토큰 확인 전: 숨기지 않고 7개 그대로 + '매물 많은순' 유지", async () => {
    session.mode = "pending";
    renderIt();
    await waitFor(() => expect(screen.getAllByText("래미안테스트").length).toBeGreaterThan(0));
    expect(screen.getByLabelText("단지 정렬").textContent).toContain("매물 많은순");
    await openSort();
    expect(screen.getAllByRole("option")).toHaveLength(7);
  });
});
