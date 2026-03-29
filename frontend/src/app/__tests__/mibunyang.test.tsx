/**
 * 미분양 메인 페이지 통합 테스트 — 탭 전환, API 호출, 로딩/에러/빈 상태
 * 실행: npx vitest run src/app/__tests__/mibunyang.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MibunyangPage from "../mibunyang/page";
import { TestQueryProvider } from "@/test-setup";

const mockReplace = vi.fn();
const mockSearchParams = vi.fn(() => new URLSearchParams());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  useSearchParams: () => mockSearchParams(),
}));

vi.mock("@/lib/api", () => ({
  getMbApartments: vi.fn().mockResolvedValue({
    apartments: [{ id: "A1", name: "테스트단지", region: "서울", gu: "강남", units: 100, unsold: 5, unsold_rate: 5.0, builder: "테스트건설" }],
    total: 1, page: 1, page_size: 50,
  }),
  getMbUnsold: vi.fn().mockResolvedValue({
    unsold: [{ id: "A1", name: "테스트단지", region: "서울", unsold: 5 }],
    total: 1,
  }),
  getMbRegions: vi.fn().mockResolvedValue({
    regions: [{ id: 1, region: "서울", gu: "강남" }],
    total: 1,
  }),
  getMbTrades: vi.fn().mockResolvedValue({
    trades: [{ id: 1, apt_name: "테스트아파트", deal_month: "202603", price: 50000, trade_type: "매매" }],
    total: 1, page: 1, page_size: 50,
  }),
}));

function renderPage(params = "") {
  mockSearchParams.mockReturnValue(new URLSearchParams(params));
  return render(
    <TestQueryProvider>
      <MibunyangPage />
    </TestQueryProvider>,
  );
}

describe("미분양 메인 — 초기 상태", () => {
  beforeEach(() => { mockReplace.mockClear(); });

  it("페이지 제목이 표시된다", () => {
    renderPage();
    expect(screen.getByText("미분양 현황")).toBeInTheDocument();
  });

  it("지역 미선택 시 안내 메시지가 표시된다", () => {
    renderPage();
    expect(screen.getByText("지역을 선택해주세요")).toBeInTheDocument();
  });

  it("지역 셀렉터가 표시된다", () => {
    renderPage();
    expect(screen.getByLabelText("시/도")).toBeInTheDocument();
  });
});

describe("미분양 메인 — 데이터 표시", () => {
  beforeEach(() => { mockReplace.mockClear(); });

  it("지역 선택 후 탭이 표시된다", async () => {
    renderPage("region=서울특별시&tab=apartments&page=1");
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "미분양 단지" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "미분양만" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "지역 통계" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "실거래" })).toBeInTheDocument();
    });
  });

  it("아파트 탭에서 데이터가 표시된다", async () => {
    renderPage("region=서울특별시&tab=apartments&page=1");
    await waitFor(() => {
      expect(screen.getByText("테스트단지")).toBeInTheDocument();
    });
  });

  it("미분양만 탭으로 전환 시 URL이 업데이트된다", async () => {
    renderPage("region=서울특별시&tab=apartments&page=1");
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "미분양만" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("tab", { name: "미분양만" }));
    expect(mockReplace).toHaveBeenCalled();
  });

  it("실거래 탭에서 거래 데이터가 표시된다", async () => {
    renderPage("region=서울특별시&tab=trades&page=1");
    await waitFor(() => {
      expect(screen.getByText("테스트아파트")).toBeInTheDocument();
    });
  });
});

describe("미분양 메인 — 에러 처리", () => {
  it("API 에러 시 에러 메시지와 재시도 버튼이 표시된다", async () => {
    const { getMbApartments } = await import("@/lib/api");
    vi.mocked(getMbApartments).mockRejectedValueOnce(new Error("서버 오류"));

    renderPage("region=서울특별시&tab=apartments&page=1");
    await waitFor(() => {
      expect(screen.getByText("데이터를 불러오지 못했습니다.")).toBeInTheDocument();
      expect(screen.getByText("다시 시도")).toBeInTheDocument();
    });
  });
});
