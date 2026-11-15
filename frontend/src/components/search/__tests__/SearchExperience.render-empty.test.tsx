/**
 * SearchExperience renderEmpty(홈 빈 화면 갈음, 세션 508) — 검색 인자가 없을 때만 renderEmpty 를 쓴다.
 * 주소에 ?q= 가 있으면 renderEmpty 를 넘겨도 기존 결과 화면이 나오고 홈 칸은 없다(적대검증 🟠1 — 조건 한쪽을 지워도 통과하던 사각).
 * 실행: npx vitest run src/components/search/__tests__/SearchExperience.render-empty.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import SearchExperience from "../SearchExperience";
import type { Complex } from "@/types";

const { params, mockComplex } = vi.hoisted(() => ({
  params: { qs: "" },
  mockComplex: { complex_no: "101", complex_name: "래미안테스트", latitude: 37.5, longitude: 127.0, article_count: 5 } satisfies Complex,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(params.qs),
  useParams: () => ({}),
}));

vi.mock("@/lib/api", () => ({
  searchComplexes: vi.fn().mockResolvedValue({ complexes: [mockComplex], total: 1 }),
  getComplexesByRegion: vi.fn().mockResolvedValue({ complexes: [mockComplex], total: 1 }),
  getRegions: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({ auth: { getSession: () => Promise.resolve({ data: { session: null } }) } }),
}));

function renderWithEmpty() {
  return render(
    <TestQueryProvider>
      <SearchExperience className="results-box" renderEmpty={() => <div data-testid="home-sections">홈 칸</div>} />
    </TestQueryProvider>,
  );
}

describe("SearchExperience — renderEmpty", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("검색 인자가 없으면 renderEmpty 를 그리고 매물유형 탭·검색 카드는 없다", () => {
    params.qs = "";
    renderWithEmpty();
    expect(screen.getByTestId("home-sections")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "단지명 검색" })).not.toBeInTheDocument();
  });

  it("?q= 가 있으면 결과 화면(className 상자)이 나오고 홈 칸은 없다", async () => {
    params.qs = "q=래미안";
    const { container } = renderWithEmpty();
    await waitFor(() => expect(screen.getAllByText("래미안테스트").length).toBeGreaterThan(0));
    expect(screen.queryByTestId("home-sections")).not.toBeInTheDocument();
    expect(container.querySelector(".results-box")).not.toBeNull();
  });

  it("빈 화면은 document.title 을 덮지 않고, 검색 화면은 바꿨다가 떠나면 원래 제목으로(맹점 🟡E)", async () => {
    document.title = "layout 제목";
    params.qs = "";
    const first = renderWithEmpty();
    expect(document.title).toBe("layout 제목");
    first.unmount();

    params.qs = "q=래미안";
    const second = renderWithEmpty();
    await waitFor(() => expect(document.title).toBe('"래미안" 검색 결과 - 아파트·오피스텔'));
    second.unmount();
    expect(document.title).toBe("layout 제목");
  });

  it("지역 검색 주소(sido+sigungu)도 결과 화면", async () => {
    params.qs = "sido=서울&sigungu=강남구";
    renderWithEmpty();
    await waitFor(() => expect(screen.getAllByText("래미안테스트").length).toBeGreaterThan(0));
    expect(screen.queryByTestId("home-sections")).not.toBeInTheDocument();
  });
});
