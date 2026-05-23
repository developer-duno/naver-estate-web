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
