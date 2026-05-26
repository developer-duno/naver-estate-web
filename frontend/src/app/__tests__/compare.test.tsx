/**
 * 단지 비교 페이지 silent failure 회귀 가드
 * 실행: npx vitest run src/app/__tests__/compare.test.tsx
 *
 * 검증 시나리오:
 * - partial failure: 4개 중 2개 단지 API 실패 → 배너 + 헤더 "(2개 단지 / 선택 4개)"
 * - 전체 fail: 모든 단지 API 실패 → 본문 대체 안내 + 재시도 버튼
 * - 평당가 statsQueries 1개 fail → 해당 단지 평당가 셀에 "불러오기 실패" 표시
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ComparePage from "../compare/page";
import { TestQueryProvider } from "@/test-setup";
import * as api from "@/lib/api";

const mockPush = vi.fn();
const mockSearchParams = vi.fn(() => new URLSearchParams());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => mockSearchParams(),
}));

vi.mock("@/components/CompareCharts", () => ({
  default: () => <div data-testid="compare-charts" />,
}));

function makeComplex(no: string) {
  return {
    complex_no: no,
    complex_name: `단지${no}`,
    address: "서울 강남",
    total_household_count: 500,
    total_dong_count: 5,
    high_floor: 30,
    low_floor: 1,
    parking_count_by_household: 1.2,
    floor_area_ratio: "250",
    building_coverage_ratio: "20",
  };
}

function makeStats(no: string) {
  return {
    complex_no: no,
    total_articles: 1,
    by_area: [],
    by_floor: [],
  };
}

vi.mock("@/lib/api", () => ({
  getComplex: vi.fn().mockImplementation((no: string) => Promise.resolve(makeComplex(no))),
  getPriceStats: vi.fn().mockImplementation((no: string) => Promise.resolve(makeStats(no))),
}));

function renderPage(params = "") {
  mockSearchParams.mockReturnValue(new URLSearchParams(params));
  return render(
    <TestQueryProvider>
      <ComparePage />
    </TestQueryProvider>,
  );
}

describe("단지 비교 — 에러 분기", () => {
  beforeEach(() => {
    mockPush.mockClear();
    // 정상 케이스 복원
    vi.mocked(api.getComplex).mockImplementation((no: string) => Promise.resolve(makeComplex(no)));
    vi.mocked(api.getPriceStats).mockImplementation((no: string) => Promise.resolve(makeStats(no)));
  });

  it("4개 중 2개 fail 시 배너 + 헤더 count 가 표시된다", async () => {
    vi.mocked(api.getComplex).mockImplementation((no: string) =>
      no === "B" || no === "D"
        ? Promise.reject(new Error("backend down"))
        : Promise.resolve(makeComplex(no)),
    );
    renderPage("ids=A,B,C,D");
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("2개 단지 정보를 불러오지 못했습니다.");
    });
    expect(screen.getByText(/2개 단지.*\/ 선택 4개/)).toBeInTheDocument();
  });

  it("전체 fail 시 본문 대체 안내 + 재시도 버튼이 표시된다", async () => {
    vi.mocked(api.getComplex).mockImplementation(() =>
      Promise.reject(new Error("backend down")),
    );
    renderPage("ids=A,B");
    await waitFor(() => {
      expect(screen.getByText("비교 단지 정보를 불러오지 못했습니다.")).toBeInTheDocument();
    });
    expect(screen.getByText("다시 시도")).toBeInTheDocument();
  });

  it("statsQueries 1개 fail 시 평당가 셀에 '불러오기 실패' 가 표시된다", async () => {
    vi.mocked(api.getPriceStats).mockImplementation((no: string) =>
      no === "A"
        ? Promise.reject(new Error("stats fail"))
        : Promise.resolve(makeStats(no)),
    );
    renderPage("ids=A,B");
    await waitFor(() => {
      expect(screen.getByText("불러오기 실패")).toBeInTheDocument();
    });
  });
});

describe("모바일 비교 화면 tablist (Radix Tabs, PR 5b)", () => {
  // PR 5b: raw <div role="tablist"> + <button role="tab"> → shadcn Tabs (Radix) 교체
  // F-mock 정정: renderPage("ids=A,B") 호출이 mockSearchParams 세팅 (기존 답습)
  // F7 정정: jsdom 은 md:hidden/hidden md:block CSS 무시 → desktop·mobile DOM 둘 다 존재
  //          → getByText("난방") 가 desktop 셀에 항상 매칭되어 모바일 탭 미전환도 PASS 위험
  //          → getAllByText.length 카운트 단언으로 차단

  it("초기 활성 탭 = 기본 (data-state=active), 다른 탭 inactive", async () => {
    // 검증 의도: Radix Tabs controlled mode 에서 value="basic" 이 정확히 활성, 가격/시설 inactive
    renderPage("ids=A,B");
    expect(await screen.findByRole("tab", { name: "기본" })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("tab", { name: "가격" })).toHaveAttribute("data-state", "inactive");
    expect(screen.getByRole("tab", { name: "시설" })).toHaveAttribute("data-state", "inactive");
  });

  it("탭 클릭 시 mobileRows 가 실제 변경 (시설 → 난방 등장 + 주소 사라짐)", async () => {
    // 검증 의도: ROW_CATEGORIES.facility 의 "난방" 등장 + ROW_CATEGORIES.basic 의 "주소" 사라짐 양방향 검증
    // F7: jsdom 은 CSS 무시 → desktop <td>"주소"·"난방" 항상 매칭 → 카운트로 모바일 영역 변경 검증
    // 초기(basic): desktop "난방" 1 + mobile dl "난방" 0 = 1건 / desktop "주소" 1 + mobile dl "주소" 1 = 2건
    // 시설 클릭 후: desktop "난방" 1 + mobile dl "난방" 1 (단지 1개) = 2건 / "주소" mobile dl 사라짐 = 1건
    const user = userEvent.setup();
    renderPage("ids=A,B");
    await user.click(await screen.findByRole("tab", { name: "시설" }));
    // F-it2 정정: 양방향 검증 (등장 + 사라짐 카운트로 silent failure 차단)
    await waitFor(() => {
      expect(screen.getAllByText("난방").length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getAllByText("주소").length).toBe(1);
  });

  it("키보드 ArrowRight 로 다음 탭 활성화 + 이전 탭 inactive (Radix roving focus)", async () => {
    // 검증 의도: Radix Tabs roving focus = ArrowRight 키 → 다음 TabsTrigger 활성 + 이전 deactive
    const user = userEvent.setup();
    renderPage("ids=A,B");
    const basicTab = await screen.findByRole("tab", { name: "기본" });
    basicTab.focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "가격" })).toHaveAttribute("data-state", "active");
    });
    expect(basicTab).toHaveAttribute("data-state", "inactive");
  });

  it("TabsList className 머지 (w-full + sticky 영역 폭 보존)", async () => {
    // 검증 의도: TabsList 기본 w-fit 을 w-full 로 override + sticky top-0 z-10 보존
    //          = 시각 변화 0 약속 jsdom 검증 (F6·F-it4 정정)
    renderPage("ids=A,B");
    const tablist = await screen.findByRole("tablist", { name: "비교 항목 분류" });
    expect(tablist).toHaveClass("w-full", "sticky", "top-0", "z-10");
  });
});
