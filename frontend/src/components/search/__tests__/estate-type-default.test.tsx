/**
 * 매물유형 기본 선택 = 아파트만 (사장님 결정 2026-10-11, 세션 459) + 숨긴 유형 안내 한 줄.
 * (a) URL 에 types 없으면 아파트만 선택 (b) ?types=APT,OPST 파싱
 * (c) 6개 전부 고르면 URL 에 types 가 써짐 (d) 기본값이면 서버에 types 미전달 · OPST 만이면 "OPST"
 * (e) HiddenTypesHint 문구·개수·임계(5)·[모두 보기]
 *
 * 실행: npx vitest run src/components/search/__tests__/estate-type-default.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import SearchExperience from "../SearchExperience";
import HiddenTypesHint from "../HiddenTypesHint";
import { ESTATE_TYPE_TABS } from "@/lib/constants";

const { mockPush, mockReplace, nav, mockSearchComplexes } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
  nav: { params: new URLSearchParams() },
  mockSearchComplexes: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => nav.params,
  useParams: () => ({}),
}));

vi.mock("@/lib/api", () => ({
  searchComplexes: (...args: unknown[]) => mockSearchComplexes(...args),
  getComplexesByRegion: vi.fn().mockResolvedValue({ complexes: [], total: 0 }),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
  }),
}));

vi.mock("@/components/RegionSelector", () => ({
  default: () => <div data-testid="region-selector" />,
}));

const ALL_CODES = ESTATE_TYPE_TABS.map((t) => t.code) as string[];

/** 매물유형 탭 버튼 — 활성 탭은 앞에 "✓" 가 붙는다(EstateTypeTabs). */
function tab(label: string) {
  const btn = screen
    .getAllByRole("button")
    .find((b) => (b.textContent ?? "").replace("✓", "").trim() === label);
  if (!btn) throw new Error(`탭 없음: ${label}`);
  return btn;
}
function isActive(label: string) {
  return (tab(label).textContent ?? "").startsWith("✓");
}

function renderSearch() {
  return render(
    <TestQueryProvider>
      <SearchExperience />
    </TestQueryProvider>,
  );
}

function makeComplex(no: string, code: string) {
  return { complex_no: no, complex_name: `단지${no}`, real_estate_type_code: code, article_count: 1 };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  nav.params = new URLSearchParams();
  mockSearchComplexes.mockResolvedValue({ complexes: [], total: 0 });
});

describe("매물유형 기본 선택 = 아파트만", () => {
  it("(a) URL 에 types 가 없으면 아파트만 선택돼 있다", () => {
    renderSearch();
    expect(isActive("아파트")).toBe(true);
    for (const t of ESTATE_TYPE_TABS.filter((t) => t.code !== "APT")) {
      expect(isActive(t.label)).toBe(false);
    }
  });

  it("(b) ?types=APT,OPST 는 그 둘만 선택 · 허용 밖 코드는 버림 · 남는 게 없으면 기본값", () => {
    nav.params = new URLSearchParams("types=APT,OPST,XXX");
    const { unmount } = renderSearch();
    expect(isActive("아파트")).toBe(true);
    expect(isActive("오피스텔")).toBe(true);
    expect(isActive("재건축")).toBe(false);
    unmount();

    nav.params = new URLSearchParams("types=XXX");
    renderSearch();
    expect(isActive("아파트")).toBe(true);
    expect(isActive("오피스텔")).toBe(false);
  });

  it("(c) 6개 전부 고르면 URL 에 types 가 6개 모두 써진다 · 다시 아파트만이면 types 를 지운다", () => {
    renderSearch();
    for (const t of ESTATE_TYPE_TABS.filter((t) => t.code !== "APT")) {
      fireEvent.click(tab(t.label));
    }
    const last = decodeURIComponent(mockPush.mock.calls.at(-1)?.[0] as string);
    expect(last).toContain(`types=${ALL_CODES.join(",")}`);

    // 아파트 외 하나만 남긴 상태에서 그것을 끄면 기본값(아파트만) → types 삭제
    mockPush.mockClear();
    for (const t of ESTATE_TYPE_TABS.filter((t) => t.code !== "APT")) {
      fireEvent.click(tab(t.label));
    }
    const back = mockPush.mock.calls.at(-1)?.[0] as string;
    expect(back).not.toContain("types=");
  });

  it("(c-2) 6개 전부 선택된 결과 화면은 유형 칩을 보여 준다(기본값과 다르므로)", async () => {
    nav.params = new URLSearchParams(`q=래미안&types=${ALL_CODES.join(",")}`);
    mockSearchComplexes.mockResolvedValue({ complexes: [makeComplex("1", "APT")], total: 1 });
    renderSearch();
    await waitFor(() => {
      expect(screen.getByText(/유형: 아파트·아파트분양권/)).toBeInTheDocument();
    });
  });

  it("(d) 기본값이면 searchComplexes 세 번째 인자 undefined", async () => {
    nav.params = new URLSearchParams("q=래미안");
    renderSearch();
    await waitFor(() => expect(mockSearchComplexes).toHaveBeenCalled());
    expect(mockSearchComplexes.mock.calls[0][2]).toBeUndefined();
  });

  it("(d-2) OPST 만이면 세 번째 인자 \"OPST\"", async () => {
    nav.params = new URLSearchParams("q=래미안&types=OPST");
    renderSearch();
    await waitFor(() => expect(mockSearchComplexes).toHaveBeenCalled());
    expect(mockSearchComplexes.mock.calls[0][2]).toBe("OPST");
  });

  it("(d-3) 결과가 적으면 화면에 숨긴 유형 안내가 뜨고 [모두 보기] 가 6개를 고른다", async () => {
    nav.params = new URLSearchParams("q=역삼");
    mockSearchComplexes.mockResolvedValue({
      complexes: [makeComplex("1", "APT"), makeComplex("2", "OPST"), makeComplex("3", "OPST")],
      total: 3,
    });
    renderSearch();
    const hint = await screen.findByTestId("hidden-types-hint");
    expect(hint.textContent).toContain("지금은 아파트만 보여요");
    expect(hint.textContent).toContain("오피스텔 2");
    fireEvent.click(screen.getByRole("button", { name: "모두 보기" }));
    const last = decodeURIComponent(mockPush.mock.calls.at(-1)?.[0] as string);
    expect(last).toContain(`types=${ALL_CODES.join(",")}`);
  });
});

describe("HiddenTypesHint", () => {
  const complexes = [
    ...Array.from({ length: 12 }, () => ({ real_estate_type_code: "OPST" })),
    ...Array.from({ length: 3 }, () => ({ real_estate_type_code: "ABYG" })),
  ];

  it("(e) 숨긴 2유형 · 보이는 0 → 문구와 유형별 개수(많은 유형부터)", () => {
    render(<HiddenTypesHint complexes={complexes} selectedTypes={["APT"]} visibleCount={0} onShowAll={vi.fn()} />);
    const hint = screen.getByTestId("hidden-types-hint");
    expect(hint.textContent).toContain("지금은 아파트만 보여요 — 숨긴 유형: 오피스텔 12 · 아파트분양권 3");
  });

  it("(e-2) 보이는 결과 5개 이상이면 안 보인다", () => {
    render(<HiddenTypesHint complexes={complexes} selectedTypes={["APT"]} visibleCount={5} onShowAll={vi.fn()} />);
    expect(screen.queryByTestId("hidden-types-hint")).toBeNull();
  });

  it("(e-3) 숨긴 것이 없거나 탭에 없는 코드뿐이면 안 보인다", () => {
    render(
      <HiddenTypesHint
        complexes={[{ real_estate_type_code: "APT" }, { real_estate_type_code: "PRE" }, {}]}
        selectedTypes={["APT"]}
        visibleCount={1}
        onShowAll={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("hidden-types-hint")).toBeNull();
  });

  it("(e-4) [모두 보기] → onShowAll 호출", () => {
    const onShowAll = vi.fn();
    render(<HiddenTypesHint complexes={complexes} selectedTypes={["APT"]} visibleCount={4} onShowAll={onShowAll} />);
    fireEvent.click(screen.getByRole("button", { name: "모두 보기" }));
    expect(onShowAll).toHaveBeenCalledTimes(1);
  });
});
