/**
 * 홈 큰 띠(HomeHero)와 검색 결과 화면(세션 525 · B40 PR 2a, 설계 §9-6)
 * - 홈(/): h1 하나 = 「우리 아파트, 요즘 얼마에 거래됐을까요」(HomeSections 맨 위)
 * - 검색 결과(/?q=): 홈 큰 띠가 없다 — DOM 의 h1 이 하나(결과 제목) · 얇은 띠(search-band)
 * - 대기 화면(첫 HTML)에는 큰 띠의 h1 이 홈 칸 상자(#home-fallback) 안에 들어 있다 → 검색 주소면 스크립트가 상자째 숨긴다
 * 실행: npx vitest run src/app/__tests__/home-search-hero.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import HomeFallback, { HOME_FALLBACK_ID } from "@/components/home/HomeFallback";

const { params } = vi.hoisted(() => ({ params: { qs: "" } }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(params.qs),
  usePathname: () => "/",
}));

vi.mock("@/lib/api", () => ({
  getRegions: vi.fn().mockResolvedValue({}),
  searchComplexes: vi.fn().mockResolvedValue({ complexes: [{ complex_no: "1", complex_name: "래미안시험", real_estate_type_code: "APT" }], total: 1 }),
  getComplexesByRegion: vi.fn().mockResolvedValue({ complexes: [], total: 0 }),
  getRegionHubTrend: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({ auth: { getSession: () => Promise.resolve({ data: { session: null } }) } }),
}));

import HomePage from "../page";

const HOME_H1 = "우리 아파트, 요즘 얼마에 거래됐을까요";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("홈 큰 띠 ↔ 검색 결과", () => {
  it("홈: h1 하나 = 큰 띠 글자 · 얇은 띠 없음", () => {
    params.qs = "";
    render(<HomePage />, { wrapper: TestQueryProvider });
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s.map((h) => h.textContent)).toEqual([HOME_H1]);
    expect(screen.queryByTestId("search-band")).not.toBeInTheDocument();
  });

  it("(바) 검색 결과: DOM 의 h1 이 하나(결과 제목) · 큰 띠 글자 없음 · 얇은 띠 있음", async () => {
    params.qs = "q=래미안";
    const { container } = render(<HomePage />, { wrapper: TestQueryProvider });
    await waitFor(() => expect(screen.getAllByText("래미안시험").length).toBeGreaterThan(0));
    const h1s = container.querySelectorAll("h1");
    expect(Array.from(h1s).map((h) => h.textContent)).toEqual(["「래미안」 단지 1곳"]);
    expect(screen.queryByText(HOME_H1)).not.toBeInTheDocument();
    expect(screen.getByTestId("search-band")).toBeInTheDocument();
  });

  it("대기 화면: 큰 띠 h1 이 홈 칸 상자 안에 있다(검색 주소면 스크립트가 상자째 숨김)", () => {
    const { container } = render(<HomeFallback />);
    const h1 = container.querySelector(`#${HOME_FALLBACK_ID} h1`);
    expect(h1?.textContent).toBe(HOME_H1);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
  });
});
