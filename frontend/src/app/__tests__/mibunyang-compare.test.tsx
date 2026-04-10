/**
 * 미분양 비교 페이지 테스트 — 렌더링, 인쇄, URL복사, 단지명 링크
 * 실행: npx vitest run src/app/__tests__/mibunyang-compare.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MbComparePage from "../mibunyang/compare/page";
import { TestQueryProvider } from "@/test-setup";

const mockPush = vi.fn();
const mockSearchParams = vi.fn(() => new URLSearchParams());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => mockSearchParams(),
}));

function makeApt(id: string, name: string) {
  return {
    id, name, region: "서울", gu: "강남", units: 500, unsold: 10,
    unsold_rate: 2.0, presale_min_price: 40000, presale_max_price: 80000,
    presale_pp: 2500, parking_ratio: 120, max_floor: 30,
    naver_jeonse_rate: 65, naver_nearby_median: 90000,
    discount_pct: 5, floor_area_ratio: 250, builder: "테스트건설",
  };
}

vi.mock("@/lib/api", () => ({
  getMbApartmentDetail: vi.fn().mockImplementation((id: string) =>
    Promise.resolve(makeApt(id, `단지${id}`)),
  ),
}));

function renderPage(params = "") {
  mockSearchParams.mockReturnValue(new URLSearchParams(params));
  return render(
    <TestQueryProvider>
      <MbComparePage />
    </TestQueryProvider>,
  );
}

describe("미분양 비교 — 빈 상태", () => {
  beforeEach(() => { mockPush.mockClear(); });

  it("ids 없으면 안내 메시지가 표시된다", () => {
    renderPage();
    expect(screen.getByText("비교할 아파트를 선택해주세요.")).toBeInTheDocument();
  });

  it("ids 1개면 2개 이상 안내가 표시된다", async () => {
    renderPage("ids=A1");
    await waitFor(() => {
      expect(screen.getByText("비교할 아파트를 2개 이상 선택해주세요.")).toBeInTheDocument();
    });
  });
});

describe("미분양 비교 — 정상 렌더링", () => {
  beforeEach(() => { mockPush.mockClear(); });

  it("2개 단지 비교 시 테이블 헤더에 단지명이 표시된다", async () => {
    renderPage("ids=A1,A2");
    await waitFor(() => {
      // 단지명은 헤더(th)와 데이터(td) 모두에 표시됨
      expect(screen.getAllByText("단지A1").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("단지A2").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("아파트 개수 뱃지가 표시된다", async () => {
    renderPage("ids=A1,A2");
    await waitFor(() => {
      expect(screen.getByText("(2개 아파트)")).toBeInTheDocument();
    });
  });

  it("비교 행이 표시된다 (세대수, 미분양 등)", async () => {
    renderPage("ids=A1,A2");
    await waitFor(() => {
      expect(screen.getAllByText("세대수").length).toBeGreaterThan(0);
      expect(screen.getAllByText("미분양").length).toBeGreaterThan(0);
      expect(screen.getAllByText("평당가(만원)").length).toBeGreaterThan(0);
    });
  });
});

describe("미분양 비교 — 인쇄/복사/링크", () => {
  beforeEach(() => { mockPush.mockClear(); });

  it("인쇄 버튼 클릭 시 window.print가 호출된다", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    renderPage("ids=A1,A2");
    await waitFor(() => {
      expect(screen.getByText("인쇄")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("인쇄"));
    // rAF 2회 대기
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it("URL 복사 버튼 클릭 시 clipboard API가 호출된다", async () => {
    const writeMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeMock } });

    renderPage("ids=A1,A2");
    await waitFor(() => {
      expect(screen.getByText("URL 복사")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("URL 복사"));
    await waitFor(() => {
      expect(writeMock).toHaveBeenCalled();
    });
  });

  it("단지명 클릭 시 상세 페이지로 이동한다", async () => {
    renderPage("ids=A1,A2");
    await waitFor(() => {
      expect(screen.getAllByText("단지A1").length).toBeGreaterThanOrEqual(1);
    });
    // 헤더의 th 요소 클릭 (첫 번째 매칭)
    fireEvent.click(screen.getAllByText("단지A1")[0]);
    expect(mockPush).toHaveBeenCalledWith("/mibunyang/A1");
  });
});
