/**
 * SearchExperience 새 틀(세션 525 · B40 PR 2a)
 * - 제목 줄: h1 「래미안」 단지 N곳(T1) · 지역 = 서울특별시 강남구 단지 N곳(T2) · 옛 결과를 잠깐 보여 주는 동안 = 「…」 검색 중(사)
 * - 비로그인 안내 한 줄(「로그인」 = /login 링크) · 탭 제목은 그대로
 * - 「조건 수정」·매물 필터 = 로그인 확정만(마) · 받는 중·결과 없음·오류에서도 비로그인엔 필터 막대 없음 · 유형·정렬 칩은 누구나
 * - 띠 검색창 값 = 주소의 q(주소가 바뀌면 다시 맞춤)
 * 실행: npx vitest run src/components/search/__tests__/SearchExperience.b40.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import SearchExperience from "../SearchExperience";

const { params, session, api } = vi.hoisted(() => ({
  params: { qs: "q=래미안" },
  // "pending" 이면 getSession 이 끝나지 않는다(세션 확인 전)
  session: { mode: "public" as "public" | "login" | "pending" },
  api: { search: vi.fn(), region: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(params.qs),
  useParams: () => ({}),
}));

vi.mock("@/lib/api", () => ({
  searchComplexes: (...a: unknown[]) => api.search(...a),
  getComplexesByRegion: (...a: unknown[]) => api.region(...a),
  getRegions: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: {
      getSession: () => {
        if (session.mode === "pending") return new Promise(() => {});
        return Promise.resolve({ data: { session: session.mode === "login" ? { user: { id: "u1" }, access_token: "tok" } : null } });
      },
    },
  }),
}));

vi.mock("@/components/RegionSelector", () => ({ default: () => <div data-testid="region-selector" /> }));

function complexes(n: number) {
  return Array.from({ length: n }, (_, i) => ({ complex_no: `C${i}`, complex_name: `시험단지${i}`, real_estate_type_code: "APT", real_estate_type_name: "아파트" }));
}

function renderIt() {
  return render(
    <TestQueryProvider>
      <SearchExperience />
    </TestQueryProvider>,
  );
}

const h1Text = () => screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent);

beforeEach(() => {
  params.qs = "q=래미안";
  session.mode = "public";
  localStorage.clear();
  sessionStorage.clear();
  api.search.mockReset();
  api.region.mockReset();
  api.search.mockResolvedValue({ complexes: complexes(3), total: 3 });
  api.region.mockResolvedValue({ complexes: complexes(2), total: 2 });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});
afterEach(() => vi.unstubAllGlobals());

describe("SearchExperience 새 틀 — 제목 줄", () => {
  it("검색어: h1 하나 「래미안」 단지 3곳 · 비로그인 안내 한 줄 · 탭 제목은 그대로", async () => {
    renderIt();
    await waitFor(() => expect(h1Text()).toEqual(["「래미안」 단지 3곳"]));
    const notice = screen.getByText(/단지 정보는 누구나 볼 수 있어요/);
    expect(notice.textContent).toBe("단지 정보는 누구나 볼 수 있어요. 네이버 매물·호가는 로그인 뒤에 보입니다.");
    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login");
    expect(document.title).toBe('"래미안" 검색 결과 - 아파트·오피스텔');
  });

  it("지역: h1 「서울특별시 강남구 단지 2곳」(동이 있으면 동까지)", async () => {
    params.qs = "sido=서울특별시&sigungu=강남구";
    const { unmount } = renderIt();
    await waitFor(() => expect(h1Text()).toEqual(["서울특별시 강남구 단지 2곳"]));
    unmount();
    params.qs = "sido=서울특별시&sigungu=강남구&dong=역삼동";
    renderIt();
    await waitFor(() => expect(h1Text()).toEqual(["서울특별시 강남구 역삼동 단지 2곳"]));
  });

  it("받는 중 = 「래미안」 검색 중", async () => {
    api.search.mockReturnValue(new Promise(() => {}));
    renderIt();
    await waitFor(() => expect(h1Text()).toEqual(["「래미안」 검색 중"]));
    expect(screen.getByText("검색 중입니다. 잠시만 기다려주세요.")).toBeInTheDocument();
  });

  it("(사) 새 검색어를 넣은 직후(옛 결과를 잠깐 보여 주는 동안) h1 에 옛 단지 수가 안 보인다 · 띠 검색창은 새 주소 글자", async () => {
    const r = renderIt();
    await waitFor(() => expect(h1Text()).toEqual(["「래미안」 단지 3곳"]));
    expect(screen.getByLabelText("단지 또는 지역 검색")).toHaveValue("래미안");
    api.search.mockReturnValue(new Promise(() => {}));
    params.qs = "q=힐스";
    r.rerender(
      <TestQueryProvider>
        <SearchExperience />
      </TestQueryProvider>,
    );
    await waitFor(() => expect(h1Text()).toEqual(["「힐스」 검색 중"]));
    expect(screen.queryByText(/단지 3곳/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("단지 또는 지역 검색")).toHaveValue("힐스");
  });

  it("오류 = 단지 수 없이 「래미안」 검색 결과", async () => {
    api.search.mockRejectedValue(new Error("서버 오류"));
    renderIt();
    await waitFor(() => expect(screen.getByText(/검색에 실패했습니다/)).toBeInTheDocument());
    expect(h1Text()).toEqual(["「래미안」 검색 결과"]);
  });
});

describe("SearchExperience 새 틀 — 조건 수정은 로그인 확정만(👤 결정 3)", () => {
  it("(마) 비로그인: 「조건 수정」 없음 · 필터 막대 없음 · 유형·정렬·지역 칩은 보임", async () => {
    renderIt();
    await waitFor(() => expect(h1Text()).toEqual(["「래미안」 단지 3곳"]));
    await waitFor(() => expect(screen.getByText(/단지 정보는 누구나/)).toBeInTheDocument()); // 비로그인 확정 뒤
    expect(screen.queryByRole("button", { name: /조건 수정/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("search-filters")).not.toBeInTheDocument();
    expect(screen.getByTestId("type-chip").textContent).toContain("아파트");
    expect(screen.getByLabelText("단지 정렬")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /지역으로 찾기/ })).toBeInTheDocument();
  });

  it.each([
    ["받는 중", () => api.search.mockReturnValue(new Promise(() => {})), /검색 중입니다/],
    ["결과 없음", () => api.search.mockResolvedValue({ complexes: [], total: 0 }), /검색 결과가 없습니다/],
    ["오류", () => api.search.mockRejectedValue(new Error("x")), /검색에 실패했습니다/],
  ])("비로그인 %s 상태에서도 필터 막대가 펼쳐지지 않고 유형·정렬 칩은 보인다", async (_n, arrange, sign) => {
    arrange();
    renderIt();
    await waitFor(() => expect(screen.getByText(sign)).toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("search-filters")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /필터 창 열기/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("type-chip")).toBeInTheDocument();
    expect(screen.getByLabelText("단지 정렬")).toBeInTheDocument();
  });

  it("세션 확인 전: 「조건 수정」 없음", async () => {
    session.mode = "pending";
    renderIt();
    await waitFor(() => expect(h1Text()).toEqual(["「래미안」 단지 3곳"]));
    expect(screen.queryByRole("button", { name: /조건 수정/ })).not.toBeInTheDocument();
  });

  it("로그인: 「조건 수정」 보임 · 누르기 전엔 필터 막대 없음 · 누르면 열림(결과 없음 상태에서도)", async () => {
    session.mode = "login";
    api.search.mockResolvedValue({ complexes: [], total: 0 });
    renderIt();
    const btn = await screen.findByRole("button", { name: /조건 수정/ });
    expect(screen.queryByTestId("search-filters")).not.toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.getByTestId("search-filters")).toBeInTheDocument();
  });
});
