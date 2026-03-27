/**
 * ComplexInfo 컴포넌트 테스트 - 단지 정보 표시
 * 실행: npx vitest run src/components/__tests__/ComplexInfo.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ComplexInfo from "../ComplexInfo";
import type { Complex } from "@/types";

const mockGetPriceHistory = vi.fn().mockResolvedValue({
  complex_no: "C001", items: [],
});

const mockStartPriceCollect = vi.fn().mockResolvedValue({ complex_no: "C001", status: "fresh" });
const mockGetPriceCollectStatus = vi.fn().mockResolvedValue({ complex_no: "C001", status: "idle", collected: 0, failed: 0, total: 0 });

vi.mock("@/lib/api", () => ({
  getPriceStats: vi.fn().mockResolvedValue({
    complex_no: "C001", total_articles: 0, by_area: [], by_floor: [],
  }),
  getPriceHistory: (...args: unknown[]) => mockGetPriceHistory(...args),
  startPriceCollect: (...args: unknown[]) => mockStartPriceCollect(...args),
  getPriceCollectStatus: (...args: unknown[]) => mockGetPriceCollectStatus(...args),
}));

const baseComplex: Complex = {
  complex_no: "C001",
  complex_name: "래미안테스트",
  address: "서울시 강남구 역삼동 123",
  total_household_count: 500,
};

describe("ComplexInfo", () => {
  it("탭 메뉴 표시", async () => {
    render(
      <ComplexInfo complex={baseComplex} pyeongDetails={[]} complexNo="C001" />
    );
    await waitFor(() => {
      expect(screen.getByText("단지정보")).toBeInTheDocument();
    });
  });

  it("면적별 정보 탭 존재", async () => {
    render(
      <ComplexInfo complex={baseComplex} pyeongDetails={[]} complexNo="C001" />
    );
    await waitFor(() => {
      expect(screen.getByText("면적별 정보")).toBeInTheDocument();
    });
  });

  it("면적별 가격 탭 존재", async () => {
    render(
      <ComplexInfo complex={baseComplex} pyeongDetails={[]} complexNo="C001" />
    );
    await waitFor(() => {
      expect(screen.getByText("면적별 가격")).toBeInTheDocument();
    });
  });

  it("null 필드에도 크래시 없음", async () => {
    const minimal: Complex = { complex_no: "C002", complex_name: "미니멀" };
    render(
      <ComplexInfo complex={minimal} pyeongDetails={[]} complexNo="C002" />
    );
    await waitFor(() => {
      expect(screen.getByText("단지정보")).toBeInTheDocument();
    });
  });

  /* 실거래가 추이 탭 테스트 */
  it("실거래가 추이 탭 클릭 시 가격 추이 로딩", async () => {
    render(
      <ComplexInfo complex={baseComplex} pyeongDetails={[]} complexNo="C001" />
    );
    await userEvent.click(screen.getByText("실거래가 추이"));
    await waitFor(() => {
      expect(screen.getByText("실거래가 추이").getAttribute("aria-selected")).toBe("true");
    });
  });

  it("실거래가 추이 탭에서 면적 드롭다운 표시 (pyeongDetails 있을 때)", async () => {
    const pyeongDetails = [
      { pyeong_no: 1, pyeong_name: "59A", exclusive_area: "59.98", supply_area: "84.0", supply_area_double: 84.0, exclusive_rate: "71" },
      { pyeong_no: 2, pyeong_name: "84B", exclusive_area: "84.92", supply_area: "116.0", supply_area_double: 116.0, exclusive_rate: "73" },
    ];
    render(
      <ComplexInfo complex={baseComplex} pyeongDetails={pyeongDetails} complexNo="C001" />
    );
    await userEvent.click(screen.getByText("실거래가 추이"));
    await waitFor(() => {
      expect(screen.getByText("전체 면적")).toBeInTheDocument();
      expect(screen.getByText(/59A/)).toBeInTheDocument();
    });
  });

  it("실거래가 추이 탭에서 면적 드롭다운 숨김 (pyeongDetails 없을 때)", async () => {
    render(
      <ComplexInfo complex={baseComplex} pyeongDetails={[]} complexNo="C001" />
    );
    await userEvent.click(screen.getByText("실거래가 추이"));
    await waitFor(() => {
      expect(screen.queryByText("전체 면적")).not.toBeInTheDocument();
    });
  });

  it("면적 선택 시 area_no 포함하여 API 호출", async () => {
    mockGetPriceHistory.mockClear();
    const pyeongDetails = [
      { pyeong_no: 1, pyeong_name: "59A", exclusive_area: "59.98", supply_area: "84.0", supply_area_double: 84.0, exclusive_rate: "71" },
    ];
    render(
      <ComplexInfo complex={baseComplex} pyeongDetails={pyeongDetails} complexNo="C001" />
    );
    await userEvent.click(screen.getByText("실거래가 추이"));
    await waitFor(() => {
      expect(mockGetPriceHistory).toHaveBeenCalledWith("C001", undefined, undefined);
    });
    // 면적 선택
    const select = screen.getByRole("combobox");
    await userEvent.selectOptions(select, "1");
    await waitFor(() => {
      expect(mockGetPriceHistory).toHaveBeenCalledWith("C001", undefined, "1");
    });
  });

  // 실거래가 수집 버튼 테스트
  it("실거래가 수집 버튼 렌더링 — 인증 시 활성", async () => {
    render(
      <ComplexInfo complex={baseComplex} pyeongDetails={[]} complexNo="C001" accessToken="test-token" />
    );
    await userEvent.click(screen.getByText("실거래가 추이"));
    await waitFor(() => {
      const btn = screen.getByText("실거래가 수집");
      expect(btn).toBeInTheDocument();
      expect(btn).not.toBeDisabled();
    });
  });

  it("실거래가 수집 버튼 — 미인증 시 비활성", async () => {
    render(
      <ComplexInfo complex={baseComplex} pyeongDetails={[]} complexNo="C001" />
    );
    await userEvent.click(screen.getByText("실거래가 추이"));
    await waitFor(() => {
      const btn = screen.getByText("실거래가 수집");
      expect(btn).toBeDisabled();
    });
  });

  it("수집 버튼 클릭 → startPriceCollect 호출", async () => {
    mockStartPriceCollect.mockClear();
    render(
      <ComplexInfo complex={baseComplex} pyeongDetails={[]} complexNo="C001" accessToken="test-token" />
    );
    await userEvent.click(screen.getByText("실거래가 추이"));
    // 자동 수집(fresh) 후 버튼이 활성화됨
    await waitFor(() => screen.getByText("실거래가 수집"));
    mockStartPriceCollect.mockClear(); // 자동 수집 호출 기록 초기화
    mockStartPriceCollect.mockResolvedValue({ complex_no: "C001", status: "started" });
    await userEvent.click(screen.getByText("실거래가 수집"));
    await waitFor(() => {
      expect(mockStartPriceCollect).toHaveBeenCalledWith("C001", "test-token");
    });
  });

  it("수집 시작 후 로딩 상태 표시", async () => {
    // 자동 수집은 fresh → 수동 클릭은 started
    mockStartPriceCollect.mockClear();
    mockStartPriceCollect
      .mockResolvedValueOnce({ status: "fresh", complex_no: "C001" })  // 자동 수집
      .mockResolvedValueOnce({ status: "started", complex_no: "C001" }); // 수동 클릭
    render(
      <ComplexInfo complex={baseComplex} pyeongDetails={[]} complexNo="C001" accessToken="test-token" />
    );
    await userEvent.click(screen.getByText("실거래가 추이"));
    await waitFor(() => screen.getByText("실거래가 수집"));
    await userEvent.click(screen.getByText("실거래가 수집"));
    await waitFor(() => {
      expect(screen.getByText("수집 중...")).toBeInTheDocument();
    });
  });
});
