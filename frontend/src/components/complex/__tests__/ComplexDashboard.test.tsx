/**
 * ComplexDashboard 회귀 가드 (PR 6c 신설 + PR 6d 데스크톱 통합)
 *
 * 구조: 박스 4개 (모바일 2×2 / 데스크톱 4×1) + 별도 펼침 영역.
 * useComplexArticleAvg mock 의무 (F3 가드).
 *
 * 실행: npx vitest run src/components/complex/__tests__/ComplexDashboard.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ComplexDashboard from "../ComplexDashboard";
import type { Complex, PyeongDetail } from "@/types";

// F3 가드: useComplexArticleAvg mock 의무 (TestQueryProvider 없이 render 가능)
const mockUseComplexArticleAvg = vi.fn(() => ({
  avgPrice: null as number | null,
  count: 0,
  isLoading: false,
  isError: false,
}));

vi.mock("@/hooks/useComplexArticleAvg", () => ({
  useComplexArticleAvg: () => mockUseComplexArticleAvg(),
}));

// 자식 섹션 mock (jsdom 환경 + 외부 의존성 차단)
vi.mock("@/components/complex/ComplexPriceFloorSection", () => ({
  default: () => <div data-testid="mock-price-floor" />,
}));
vi.mock("@/components/complex/ComplexPriceAreaSection", () => ({
  default: () => <div data-testid="mock-price-area" />,
}));
vi.mock("@/components/complex/PriceChartSection", () => ({
  default: () => <div data-testid="mock-price-chart" />,
}));
vi.mock("@/components/ComplexPyeongCard", () => ({
  PyeongDetailsList: () => <div data-testid="mock-pyeong-list" />,
}));
vi.mock("@/components/ComplexBasicInfo", () => ({
  default: () => <div data-testid="mock-basic-info" />,
}));

const baseComplex: Complex = {
  complex_no: "C001",
  complex_name: "테스트단지",
  total_household_count: 1234,
  total_dong_count: 12,
  nearby_median_price: 80000,
  jeonse_rate: 65,
  recent_trades_6m: 42,
};

const samplePyeong: PyeongDetail[] = [
  { pyeong_no: 1, pyeong_name: "84A", exclusive_area: "84.99" },
  { pyeong_no: 2, pyeong_name: "109B", exclusive_area: "109.95" },
];

describe("ComplexDashboard (v2)", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    mockUseComplexArticleAvg.mockReturnValue({
      avgPrice: null,
      count: 0,
      isLoading: false,
      isError: false,
    });
  });

  it("4 박스 라벨 + 핵심 지표 표시 (중요도순)", () => {
    render(
      <ComplexDashboard
        complex={baseComplex}
        complexNo="C001"
        pyeongDetails={samplePyeong}
        sessionToken={undefined}
        onFilterChange={() => {}}
      />,
    );

    // 4 박스 button accessible name (F6 selector 패턴 유지)
    expect(screen.getByRole("button", { name: "시세 메뉴 열기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "실거래가 메뉴 열기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "단지정보 메뉴 열기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "면적별 시세 메뉴 열기" })).toBeInTheDocument();

    // 평형 박스 부재 (Q4 흡수)
    expect(screen.queryByRole("button", { name: "평형 메뉴 열기" })).not.toBeInTheDocument();

    // 핵심 지표
    expect(screen.getByText(/전세가율 65%/)).toBeInTheDocument();
    expect(screen.getByText("매물 0건")).toBeInTheDocument();
    expect(screen.getByText("1,234세대")).toBeInTheDocument();
    expect(screen.getByText("2개 평형")).toBeInTheDocument();
  });

  it("박스 클릭 시 펼침 영역 노출 + aria-expanded toggle", async () => {
    render(
      <ComplexDashboard
        complex={baseComplex}
        complexNo="C001"
        pyeongDetails={samplePyeong}
        sessionToken={undefined}
        onFilterChange={() => {}}
      />,
    );

    const priceCard = screen.getByRole("button", { name: "시세 메뉴 열기" });
    expect(priceCard).toHaveAttribute("aria-expanded", "false");

    // 펼침 영역 초기 부재
    expect(screen.queryByRole("region")).not.toBeInTheDocument();

    await userEvent.click(priceCard);
    expect(priceCard).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region")).toBeInTheDocument();
    expect(screen.getByTestId("mock-price-floor")).toBeInTheDocument();

    // 다시 클릭 → 닫힘
    await userEvent.click(priceCard);
    expect(priceCard).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("NULL fallback: 시세는 '매물 평균', 실거래가는 '매물 N건' (F4 가드)", () => {
    mockUseComplexArticleAvg.mockReturnValue({
      avgPrice: 75000,
      count: 46,
      isLoading: false,
      isError: false,
    });
    const empty: Complex = { complex_no: "C002", complex_name: "값없음단지" };
    render(
      <ComplexDashboard
        complex={empty}
        complexNo="C002"
        pyeongDetails={[]}
        sessionToken={undefined}
        onFilterChange={() => {}}
      />,
    );

    // 시세 박스 = 매물 평균 (formatKoreanPrice(75000))
    expect(screen.getByText(/매물 평균/)).toBeInTheDocument();
    // 실거래가 박스 primary = '매물 46건' + 시세 박스 secondary (jeonse_rate NULL fallback) = '매물 46건'
    // = 2곳 동시 노출 (의도된 fallback 일관성)
    const occurrences = screen.getAllByText("매물 46건");
    expect(occurrences.length).toBeGreaterThanOrEqual(1);
  });

  it("매물 수를 불러오는 중이면 '매물 0건' 대신 '매물 …건' — 시세 보조 줄도 같은 규칙 (세션 447)", () => {
    // 불러오는 중엔 count=0 이 돌아온다 — 그대로 쓰면 "매물 0건"이 잠깐 보였다
    mockUseComplexArticleAvg.mockReturnValue({
      avgPrice: null,
      count: 0,
      isLoading: true,
      isError: false,
    });
    const noRate: Complex = { complex_no: "C003", complex_name: "로딩단지" };
    const { rerender } = render(
      <ComplexDashboard
        complex={noRate}
        complexNo="C003"
        pyeongDetails={[]}
        sessionToken={undefined}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.queryByText("매물 0건")).not.toBeInTheDocument();
    // 실거래가 칸 primary + 시세 칸 secondary(jeonse_rate 없음) = 2곳
    expect(screen.getAllByText("매물 …건")).toHaveLength(2);

    // 다 불러오면 실제 건수로 바뀐다
    mockUseComplexArticleAvg.mockReturnValue({
      avgPrice: null,
      count: 32,
      isLoading: false,
      isError: false,
    });
    rerender(
      <ComplexDashboard
        complex={noRate}
        complexNo="C003"
        pyeongDetails={[]}
        sessionToken={undefined}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.queryByText("매물 …건")).not.toBeInTheDocument();
    expect(screen.getAllByText("매물 32건")).toHaveLength(2);
  });

  // 세션 481 보완 F8: 비로그인은 매물 수를 모른다 — "매물 0건" 이 아니라 로그인 안내
  it("비로그인 확정(loggedOut)이면 실거래가 칸 '로그인하면 보여요' · '매물 0건' 없음", () => {
    render(
      <ComplexDashboard complex={baseComplex} complexNo="C001" pyeongDetails={samplePyeong}
        sessionToken={undefined} loggedOut onFilterChange={() => {}} />,
    );
    expect(screen.getByText("로그인하면 보여요")).toBeInTheDocument();
    expect(screen.queryByText("매물 0건")).toBeNull();
  });

  it("토큰 없이 매물 조회가 실패(401)해도 '로그인하면 보여요'", () => {
    mockUseComplexArticleAvg.mockReturnValue({ avgPrice: null, count: 0, isLoading: false, isError: true });
    render(
      <ComplexDashboard complex={baseComplex} complexNo="C001" pyeongDetails={samplePyeong}
        sessionToken={undefined} onFilterChange={() => {}} />,
    );
    expect(screen.getByText("로그인하면 보여요")).toBeInTheDocument();
    expect(screen.queryByText("매물 0건")).toBeNull();
  });

  it("실거래가 칸: recent_trades_6m 이 있어도 '거래 N건'이 아니라 '매물 N건 · 현재 매물' (세션 429)", () => {
    // recent_trades_6m 은 실제 거래 횟수가 아니라 시세 기록 줄 수 — 거래처럼 보이면 안 된다
    mockUseComplexArticleAvg.mockReturnValue({
      avgPrice: null,
      count: 7,
      isLoading: false,
      isError: false,
    });
    render(
      <ComplexDashboard
        complex={{ ...baseComplex, recent_trades_6m: 42 }}
        complexNo="C001"
        pyeongDetails={samplePyeong}
        sessionToken={undefined}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.queryByText("42건")).toBeNull();
    expect(screen.queryByText("최근 6개월")).toBeNull();
    expect(screen.getByText("매물 7건")).toBeInTheDocument();
    expect(screen.getByText("현재 매물")).toBeInTheDocument();
  });

  it("면적별 시세 펼친 후 안내 메시지 (평형 0건, F5 가드)", async () => {
    const empty: Complex = { complex_no: "C003", complex_name: "평형없음단지" };
    render(
      <ComplexDashboard
        complex={empty}
        complexNo="C003"
        pyeongDetails={[]}
        sessionToken={undefined}
        onFilterChange={() => {}}
      />,
    );

    // F5: selector = "면적별 시세 메뉴 열기" (구 "평형 메뉴 열기" 제거 답습)
    await userEvent.click(screen.getByRole("button", { name: "면적별 시세 메뉴 열기" }));
    expect(
      await screen.findByText("면적별 정보가 아직 수집되지 않았습니다."),
    ).toBeInTheDocument();
    // 평형 0건이어도 면적별 시세 컴포넌트는 함께 렌더
    expect(screen.getByTestId("mock-price-area")).toBeInTheDocument();
  });

  it("면적별 시세 펼친 후 PyeongDetailsList + ComplexPriceAreaSection 둘 다 렌더 (F11 가드)", async () => {
    render(
      <ComplexDashboard
        complex={baseComplex}
        complexNo="C001"
        pyeongDetails={samplePyeong}
        sessionToken={undefined}
        onFilterChange={() => {}}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "면적별 시세 메뉴 열기" }));
    expect(screen.getByTestId("mock-pyeong-list")).toBeInTheDocument();
    expect(screen.getByTestId("mock-price-area")).toBeInTheDocument();
  });

  it("avgPrice/count 모두 null/0 → 시세 박스 '-' 표시", () => {
    const empty: Complex = { complex_no: "C004", complex_name: "전체NULL단지" };
    render(
      <ComplexDashboard
        complex={empty}
        complexNo="C004"
        pyeongDetails={[]}
        sessionToken={undefined}
        onFilterChange={() => {}}
      />,
    );

    // 시세 박스 primary = '-' (nearby_median_price NULL + avgPrice null)
    const dashes = screen.getAllByText("-");
    expect(dashes.length).toBeGreaterThanOrEqual(3); // 시세 + 단지정보 + 면적별 시세
  });

  // PR-D: 공시가격·공시가율 행은 ComplexBasicInfo 안에 있으므로, 인쇄 시 그 섹션이
  // 실제로 마운트되는지를 여기서 가드한다 (isPrinting 소유자 = 이 컴포넌트).
  it("인쇄(beforeprint) 시 단지정보 섹션 포함 4 섹션 모두 노출 (PR-D 인쇄 경로 가드)", () => {
    render(
      <ComplexDashboard
        complex={baseComplex}
        complexNo="C001"
        pyeongDetails={samplePyeong}
        sessionToken={undefined}
        onFilterChange={() => {}}
      />,
    );

    // 아무 박스도 안 열린 상태 = 펼침 영역 부재
    expect(screen.queryByTestId("mock-basic-info")).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("beforeprint"));
    });

    // 공시가격·공시가율 행이 사는 단지정보 섹션이 인쇄 시 노출돼야 한다
    expect(screen.getByTestId("mock-basic-info")).toBeInTheDocument();
    expect(screen.getByTestId("mock-price-floor")).toBeInTheDocument();
    expect(screen.getByTestId("mock-price-chart")).toBeInTheDocument();
    expect(screen.getByTestId("mock-pyeong-list")).toBeInTheDocument();

    // 인쇄 종료 시 원래대로 접힘
    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });
    expect(screen.queryByTestId("mock-basic-info")).not.toBeInTheDocument();
  });

  it("정부 지역 값: 시세 칸에 '이 단지 · 시군구 아파트' 나란히 + 출처 줄 (세션 473)", () => {
    render(
      <ComplexDashboard
        complex={{ ...baseComplex, jeonse_rate: 58, region_jeonse_ratio: 79.4, region_jeonse_period: "2026.01", region_name: "천안시 동남구",
          region_jeonse_source: "BE 가 보낸 출처 문구" }}
        complexNo="C001"
        pyeongDetails={samplePyeong}
        sessionToken={undefined}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.getByText("전세가율 58% · 천안시 동남구 아파트 79.4%")).toBeInTheDocument();
    // 출처 문구는 BE(region_jeonse_source)가 정본 — FE 글자 상수 없음(derived-display-ssot)
    expect(screen.getByTestId("box-note-prices")).toHaveTextContent(
      "이 단지: 최근 6개월 시세·실거래 기록 중앙값으로 계산 · 지역: BE 가 보낸 출처 문구(2026.01)",
    );
  });

  it("우리 전세가율이 없고 지역 값만 있어도 지역 값을 보여 준다 (세션 473 F9)", () => {
    render(
      <ComplexDashboard
        complex={{ ...baseComplex, jeonse_rate: undefined, region_jeonse_ratio: 61.2, region_jeonse_period: "2026.09",
          region_name: "사천시", region_jeonse_source: "출처문구" }}
        complexNo="C001"
        pyeongDetails={samplePyeong}
        sessionToken={undefined}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.getByText("사천시 아파트 전세가율 61.2%")).toBeInTheDocument();
    expect(screen.getByTestId("box-note-prices")).toHaveTextContent("지역: 출처문구(2026.09)");
    expect(screen.getByTestId("box-note-prices")).not.toHaveTextContent("이 단지:");
  });

  it("정부 지역 값이 없으면 지금처럼 '전세가율 N%' 만, 출처 줄 없음 (세션 473)", () => {
    render(
      <ComplexDashboard
        complex={baseComplex}
        complexNo="C001"
        pyeongDetails={samplePyeong}
        sessionToken={undefined}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.getByText("전세가율 65%")).toBeInTheDocument();
    expect(screen.queryByTestId("box-note-prices")).toBeNull();
  });
});
