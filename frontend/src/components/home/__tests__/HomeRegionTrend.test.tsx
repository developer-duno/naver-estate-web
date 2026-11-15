/**
 * 홈 「지역 시세 흐름」 세 상태 + 지역 고르기(세션 508)
 * - 기본 = 서울 강남구(11680) · 로딩 · 오류(다시 시도) · 빈 자료(404 확정 답 포함) · 자료 있음(그림)
 * 실행: npx vitest run src/components/home/__tests__/HomeRegionTrend.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ApiError } from "@/lib/api/core";

const { getRegionHubTrend } = vi.hoisted(() => ({ getRegionHubTrend: vi.fn() }));
vi.mock("@/lib/api", () => ({ getRegionHubTrend }));

import HomeRegionTrend, { trendPoints } from "../HomeRegionTrend";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const trend = (n: number) => ({
  region_code: "11680", region_name: "강남구", source: "한국부동산원",
  items: Array.from({ length: n }, (_, i) => ({ period: `2025${String((i % 12) + 1).padStart(2, "0")}`, sale_price_median: 200000 + i * 1000, jeonse_ratio: 40 })),
});

describe("HomeRegionTrend", () => {
  // 중괄호 필수 — mockReset() 은 가짜 함수를 돌려주는데, beforeEach 가 함수를 돌려주면 vitest 가 뒷정리로 그것을 불러 버린다
  beforeEach(() => {
    getRegionHubTrend.mockReset();
  });

  it("기본으로 서울 강남구(11680)를 부르고, 받기 전엔 로딩", async () => {
    getRegionHubTrend.mockReturnValue(new Promise(() => {}));
    render(<HomeRegionTrend />, { wrapper });
    expect(screen.getByTestId("trend-loading")).toBeInTheDocument();
    expect(getRegionHubTrend).toHaveBeenCalledWith("11680");
    expect(screen.getByLabelText("시·도")).toHaveValue("서울");
    expect(screen.getByLabelText("시·군·구")).toHaveValue("11680");
  });

  it("자료가 있으면 그림 자리(최근 24개월로 자름)", async () => {
    getRegionHubTrend.mockResolvedValue(trend(30));
    render(<HomeRegionTrend />, { wrapper });
    expect(await screen.findByRole("img", { name: /중위 매매가 최근 24개월 흐름/ })).toBeInTheDocument();
    expect(screen.getByText("출처: 한국부동산원 주택가격동향")).toBeInTheDocument();
  });

  it("5xx 오류면 다시 시도 단추 → 누르면 다시 부른다", async () => {
    getRegionHubTrend.mockRejectedValue(new ApiError("오류", 503));
    render(<HomeRegionTrend />, { wrapper });
    expect(await screen.findByTestId("trend-error")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(getRegionHubTrend).toHaveBeenCalledTimes(2));
  });

  it("404(그 시군구 허브 없음)·null·값 없는 달뿐이면 빈 자료", async () => {
    getRegionHubTrend.mockRejectedValue(new ApiError("없음", 404));
    const { unmount } = render(<HomeRegionTrend />, { wrapper });
    expect(await screen.findByTestId("trend-empty")).toBeInTheDocument();
    unmount();
    getRegionHubTrend.mockResolvedValue(null);
    render(<HomeRegionTrend />, { wrapper });
    expect(await screen.findByTestId("trend-empty")).toBeInTheDocument();
  });

  it("시·도를 바꾸면 그 시·도의 첫 시·군·구를 부른다", async () => {
    getRegionHubTrend.mockResolvedValue(null);
    render(<HomeRegionTrend />, { wrapper });
    fireEvent.change(screen.getByLabelText("시·도"), { target: { value: "부산" } });
    await waitFor(() => expect(getRegionHubTrend).toHaveBeenLastCalledWith(expect.stringMatching(/^26/)));
  });
});

describe("trendPoints", () => {
  it("최근 24개월 중 값이 있는 달만", () => {
    const items = [
      ...Array.from({ length: 25 }, (_, i) => ({ period: `p${i}`, sale_price_median: i === 3 ? null : i })),
    ];
    const pts = trendPoints(items);
    expect(pts[0].period).toBe("p1");
    expect(pts).toHaveLength(23); // 24개월 중 p3 하나 빠짐
  });
});
