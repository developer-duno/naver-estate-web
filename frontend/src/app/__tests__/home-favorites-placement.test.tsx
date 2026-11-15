/**
 * 홈 즐겨찾기 자리 (세션 509 · B36 ① — 사장님 결정 A「검색 상자 안」)
 * - 즐겨찾기가 있으면 남색 검색 상자 안(최근 검색 칩 아래)에 칩 줄이 보이고, 대출 판보다 위에 있다
 * - 0개면 「즐겨찾기」 줄이 통째로 없다(옛 안내 문장도 없음)
 * - 0개여도 로그인한 분은 「즐겨찾기 매물 →」 링크만 남는다(매물 즐겨찾기로 가는 홈 입구)
 * 실행: npx vitest run src/app/__tests__/home-favorites-placement.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";

const { mockRouter, mockSearchParams, sessionState } = vi.hoisted(() => ({
  mockRouter: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
  mockSearchParams: new URLSearchParams(),
  sessionState: { sessionToken: undefined as string | undefined, tokenReady: true },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/",
}));

vi.mock("@/lib/api", () => ({
  getRegions: vi.fn().mockResolvedValue({}),
  searchComplexes: vi.fn().mockResolvedValue({ complexes: [] }),
  getComplexesByRegion: vi.fn().mockResolvedValue({ complexes: [] }),
  getRegionHubTrend: vi.fn().mockResolvedValue(null), // 홈 「지역 시세 흐름」(세션 508)
}));

vi.mock("@/hooks/useSessionToken", () => ({
  useSessionToken: () => ({
    sessionToken: sessionState.sessionToken,
    tokenReady: sessionState.tokenReady,
    tokenError: false,
    dismissTokenError: vi.fn(),
  }),
}));

import HomePage from "../page";

/** favorite_complexes 시드 — 가짜 단지 이름 */
function seedFavorites(names: string[]) {
  const items = names.map((name, i) => ({ complex_no: `F${i + 1}`, complex_name: name, added_at: 1000 - i }));
  localStorage.setItem("favorite_complexes", JSON.stringify(items));
}

function renderHome() {
  return render(<HomePage />, { wrapper: TestQueryProvider });
}

describe("홈 — 즐겨찾기는 검색 상자 안", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionState.sessionToken = undefined;
    sessionState.tokenReady = true;
  });

  it("즐겨찾기가 있으면 검색 입력 칸과 같은 상자 안에 보이고, 대출 판보다 위에 있다", async () => {
    seedFavorites(["예시 단지 A", "예시 단지 B"]);
    renderHome();

    const chip = await screen.findByRole("link", { name: /예시 단지 A$/ });
    const section = screen.getByRole("region", { name: "즐겨찾기" });
    expect(section).toContainElement(chip);
    expect(screen.getByText("즐겨찾기")).toHaveClass("text-brand-on-navy-muted");

    // 검색 입력 칸을 감싼 상자(HomeSearchBox 맨 바깥) 안에 즐겨찾기 줄이 있다
    const searchBox = screen.getByLabelText("단지 또는 지역 검색").closest(".max-w-\\[760px\\]");
    expect(searchBox).not.toBeNull();
    expect(searchBox).toContainElement(section);

    // 대출 판 제목보다 문서 순서상 앞(=화면 위)
    const loanHeading = screen.getByRole("heading", { level: 2, name: "집을 담보로 더 받을 수 있는 한도부터 확인하세요" });
    expect(section.compareDocumentPosition(loanHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("0개면 「즐겨찾기」 글자도, 옛 안내 문장도 없다(비로그인)", async () => {
    renderHome();
    // 홈 칸이 다 그려진 뒤 확인
    await screen.findByRole("heading", { level: 2, name: "집을 담보로 더 받을 수 있는 한도부터 확인하세요" });
    expect(screen.queryByText("즐겨찾기")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "즐겨찾기" })).not.toBeInTheDocument();
    expect(screen.queryByText(/관심 단지의/)).not.toBeInTheDocument();
  });

  it("0개여도 로그인한 분은 「즐겨찾기 매물 →」 링크만 검색 상자 안에 남는다(「즐겨찾기」 제목은 없음)", async () => {
    sessionState.sessionToken = "token-abc";
    renderHome();
    const link = await screen.findByRole("link", { name: /즐겨찾기 매물/ });
    expect(link).toHaveAttribute("href", "/search/favorites");
    expect(link).toHaveClass("text-white");
    expect(screen.queryByText("즐겨찾기")).not.toBeInTheDocument();
    const searchBox = screen.getByLabelText("단지 또는 지역 검색").closest(".max-w-\\[760px\\]");
    expect(searchBox).toContainElement(link);
  });
});
