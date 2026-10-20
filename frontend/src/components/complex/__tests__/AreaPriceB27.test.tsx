/**
 * 면적별 시세(B27) 화면 회귀 — 세션 474 PR 5 (사장님 결정 D3 「A. 대표 면적 크게 + 나머지 작게」)
 *
 * 픽스처 = 단지 6139(자연, 대전 유성 궁동) 운영 실측: 대표 59㎡(116세대) 중위 1억 7,200만(3건) ·
 * 84㎡ 2억 2,000만(1건) · 42㎡ 거래 없음 · 59㎡ 전세 시세 없음 · 시군구 전세가율 71.2%.
 * 실행: npx vitest run src/components/complex/__tests__/AreaPriceB27.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import ComplexDashboard from "../ComplexDashboard";
import PriceChartSection from "../PriceChartSection";
import InfoCards from "@/components/article/InfoCards";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import CompareCharts from "@/components/CompareCharts";
import { areaGroupOf, otherAreaText, pickRepresentativeArea } from "@/lib/area-group";
import type { Complex, PyeongDetail } from "@/types";

type AvgResult = { avgPrice: number | null; count: number; isLoading: boolean; isError: boolean };
const mockUseComplexArticleAvg = vi.fn<(...args: unknown[]) => AvgResult>(
  () => ({ avgPrice: 99999, count: 5, isLoading: false, isError: false }),
);
vi.mock("@/hooks/useComplexArticleAvg", () => ({
  useComplexArticleAvg: (...args: unknown[]) => mockUseComplexArticleAvg(...args),
}));
vi.mock("@/components/complex/ComplexPriceFloorSection", () => ({ default: () => <div /> }));
vi.mock("@/components/complex/ComplexPriceAreaSection", () => ({ default: () => <div /> }));
vi.mock("@/components/ComplexPyeongCard", () => ({ PyeongDetailsList: () => <div /> }));
vi.mock("@/components/ComplexBasicInfo", () => ({ default: () => <div /> }));
// PriceChartSection 의 차트는 next/dynamic(ssr:false) — jsdom 에서는 늦게 풀리므로 범례 글자(areaLabel)만 보이는 가짜로
vi.mock("next/dynamic", () => ({
  default: () => function ChartStub({ areaLabel }: { areaLabel?: string }) {
    return <div data-testid="chart-area-label">{areaLabel ?? "없음"}</div>;
  },
}));

// 차트 선 이름(범례)만 글자로 보이게 — Recharts 는 jsdom 에서 그려지지 않는다
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ComposedChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: ({ name }: { name?: string }) => (name ? <div data-testid="line-name">{name}</div> : null),
  Area: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => null,
  Cell: () => null,
  LabelList: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

const mockGetPriceHistory = vi.fn();
vi.mock("@/lib/api", () => ({
  getPriceHistory: (...args: unknown[]) => mockGetPriceHistory(...args),
  getPriceStats: vi.fn().mockResolvedValue({ complex_no: "X", total_articles: 0, by_area: [], by_floor: [] }),
  getPyeongDetails: vi.fn().mockResolvedValue({ pyeong_details: [] }),
  startPriceCollect: vi.fn().mockResolvedValue({ complex_no: "6139", status: "fresh" }),
  getPriceCollectStatus: vi.fn().mockResolvedValue({ complex_no: "6139", status: "idle", collected: 0, failed: 0, total: 0 }),
}));

const PYEONG_6139: PyeongDetail[] = [
  { pyeong_no: 1, exclusive_area: "42.48", household_count_by_pyeong: "12" },
  { pyeong_no: 2, exclusive_area: "59.98", household_count_by_pyeong: "116" },
  { pyeong_no: 3, exclusive_area: "84.36", household_count_by_pyeong: "15" },
  { pyeong_no: 4, exclusive_area: "84.85", household_count_by_pyeong: "13" },
  { pyeong_no: 5, exclusive_area: "84.93", household_count_by_pyeong: "14" },
  { pyeong_no: 6, exclusive_area: "84.96", household_count_by_pyeong: "13" },
  { pyeong_no: 7, exclusive_area: "84.97", household_count_by_pyeong: "15" },
];

const SOURCE =
  "정부 실거래 최근 6개월, 전용 59㎡ 대는 소수점을 버린 같은 크기끼리 · 전세가율 = 네이버 전세 시세(같은 면적) ÷ 정부 실거래 중위";

const C6139: Complex = {
  complex_no: "6139",
  complex_name: "자연",
  rep_area_m2: 59,
  nearby_median_price: 17200,
  recent_trades_6m: 3,
  // BE 가 평형표의 모든 묶음을 대표 먼저·거래 수 순으로 준다(보완 ①) — 거래 없는 42 는 null
  area_prices: [
    { area_m2: 59, households: 116, price_median: 17200, trade_count: 3 },
    { area_m2: 84, households: 70, price_median: 22000, trade_count: 1 },
    { area_m2: 42, households: 12, price_median: null, trade_count: null },
  ],
  area_price_source: SOURCE,
  region_jeonse_ratio: 71.2,
  region_name: "대전 유성구",
  region_jeonse_source: "한국부동산원 전국주택가격동향조사",
  region_jeonse_period: "2026.09",
};

function renderDashboard(complex: Complex, pyeong: PyeongDetail[] = PYEONG_6139) {
  return render(
    <ComplexDashboard complex={complex} complexNo={complex.complex_no} pyeongDetails={pyeong}
      sessionToken={undefined} onFilterChange={() => {}} />,
  );
}

describe("ComplexDashboard 시세 칸 — A안 (세션 474 B27)", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("대표 면적 값 크게 · 칩 · 다른 면적 작게(거래 없는 42㎡ —) · 전세가율(59㎡) — · 출처", () => {
    renderDashboard(C6139);
    const box = screen.getByRole("button", { name: /^시세 · 전용 59㎡\(116세대\)/ });
    expect(box).toHaveTextContent("시세 · 전용 59㎡(116세대)");
    expect(screen.getByTestId("box-chip-prices")).toHaveTextContent("최근 6개월 3건");
    expect(box).toHaveTextContent("1억 7,200만");
    expect(box).toHaveTextContent("84㎡ 2억 2,000만 (1건) · 42㎡ —");
    expect(screen.getByTestId("box-extra-prices")).toHaveTextContent("전세가율(59㎡) — · 대전 유성구 아파트 71.2%");
    expect(screen.getByTestId("box-note-prices")).toHaveTextContent(
      `이 단지: ${SOURCE} · 지역: 한국부동산원 전국주택가격동향조사(2026.09)`,
    );
    expect(box).not.toHaveTextContent("매물 평균");
  });

  it("대표 면적에 거래가 없으면 큰 숫자는 — (매물 평균 대체값으로 안 돌아간다)", () => {
    renderDashboard({
      ...C6139, nearby_median_price: undefined, recent_trades_6m: 0,
      area_prices: [
        { area_m2: 59, households: 116, price_median: null, trade_count: null },
        { area_m2: 84, households: 70, price_median: 22000, trade_count: 1 },
      ],
    });
    const box = screen.getByRole("button", { name: /^시세 · 전용 59㎡/ });
    expect(box).toHaveTextContent("—");
    expect(box).not.toHaveTextContent("매물 평균");
    expect(screen.getByTestId("box-chip-prices")).toHaveTextContent("최근 6개월 0건");
  });

  it("대표 면적 없이 옛 값만 남은 단지 — 값은 그대로, '면적 섞인 옛 값' 작은 글 (보완 F2 · Q4)", () => {
    renderDashboard({ complex_no: "C8", complex_name: "옛값단지", nearby_median_price: 18000, jeonse_rate: 53.6, price_basis: "legacy_mixed" }, []);
    const box = screen.getByRole("button", { name: "시세 메뉴 열기" });
    expect(box).toHaveTextContent("1억 8,000만");
    expect(screen.getByTestId("box-extra-prices")).toHaveTextContent(
      "면적 섞인 옛 값 — 최근 6개월 거래가 없어 다시 계산되지 않았어요",
    );
  });

  it("대표 면적 단지(6139)는 옛 값 표시 없음", () => {
    renderDashboard({ ...C6139, price_basis: "rep_area" });
    expect(screen.queryByText(/면적 섞인 옛 값/)).toBeNull();
  });

  it("대표 면적이 없으면 지금처럼 — 라벨 '시세' · 매물 평균 대체값", () => {
    renderDashboard({ complex_no: "C9", complex_name: "옛단지" }, []);
    const box = screen.getByRole("button", { name: "시세 메뉴 열기" });
    expect(box).toHaveTextContent("매매 매물 평균 9억 9,999만"); // 평형표가 없어 면적을 모름(세션 475)
    expect(box).not.toHaveTextContent("㎡)");
    expect(screen.queryByTestId("box-chip-prices")).toBeNull();
    expect(mockUseComplexArticleAvg).toHaveBeenLastCalledWith("C9", undefined, { avgEnabled: true, avgAreaM2: null });
  });

  // 세션 475 PR 6 — 대체값은 매매 매물만 + 평형표 세대수 최다 묶음만
  it("대표 면적이 없으면 매매 매물 평균을 평형표 대표 묶음(59㎡)으로", () => {
    renderDashboard({ complex_no: "C9", complex_name: "옛단지" });
    const box = screen.getByRole("button", { name: "시세 메뉴 열기" });
    expect(box).toHaveTextContent("매매 매물 평균(59㎡) 9억 9,999만");
    expect(mockUseComplexArticleAvg).toHaveBeenLastCalledWith("C9", undefined, { avgEnabled: true, avgAreaM2: 59 });
  });

  it("대표 면적 값이 있으면 매매 평균 요청을 켜지 않는다", () => {
    renderDashboard(C6139);
    expect(mockUseComplexArticleAvg).toHaveBeenLastCalledWith("6139", undefined, { avgEnabled: false, avgAreaM2: null });
  });

  it("FE 대표 면적 = BE pick_representative 와 같은 답(6139 평형표 → 59 · 동률이면 작은 면적)", () => {
    // BE tests/test_area_price_b27.py test_대표면적_6139는_세대수_최다_59 와 같은 입력 — 84 묶음 합 70 < 59 묶음 116
    expect(pickRepresentativeArea(PYEONG_6139)).toBe(59);
    expect(pickRepresentativeArea([
      { exclusive_area: "84.97", household_count_by_pyeong: "100" },
      { exclusive_area: "59.98", household_count_by_pyeong: "100세대" },
    ])).toBe(59);
    expect(pickRepresentativeArea([{ exclusive_area: "84.97", household_count_by_pyeong: "1,200" },
      { exclusive_area: "59.98", household_count_by_pyeong: "300" }])).toBe(84);
    expect(pickRepresentativeArea([{ exclusive_area: "", household_count_by_pyeong: "10" }])).toBeNull();
    expect(pickRepresentativeArea([])).toBeNull();
  });
});

describe("area-group 도우미", () => {
  it("areaGroupOf = 소수점 버림 · 못 읽음 null", () => {
    expect(areaGroupOf("84.94")).toBe(84);
    expect(areaGroupOf("84.99")).toBe(84);
    expect(areaGroupOf(59.98)).toBe(59);
    expect(areaGroupOf("")).toBeNull();
    expect(areaGroupOf("0")).toBeNull();
    expect(areaGroupOf(undefined)).toBeNull();
  });

  it("otherAreaText 는 최대 3개", () => {
    const many = [
      { area_m2: 59, price_median: 1, trade_count: 9 },
      { area_m2: 74, price_median: 20000, trade_count: 5 },
      { area_m2: 84, price_median: 30000, trade_count: 4 },
      { area_m2: 101, price_median: 40000, trade_count: 2 },
      { area_m2: 114, price_median: 50000, trade_count: 1 },
    ];
    expect(otherAreaText(59, many).split(" · ")).toHaveLength(3);
    expect(otherAreaText(59, many)).toBe("74㎡ 2억 (5건) · 84㎡ 3억 (4건) · 101㎡ 4억 (2건)");
  });
});

describe("InfoCards 라벨 (세션 474 B27)", () => {
  it("대표 면적이 있으면 '대표 면적 시세(59㎡)' · '전세가율(이 단지, 같은 면적)' · 매물은 '같은 면적 기준'", () => {
    render(
      <InfoCards
        article={{ article_no: "A1", complex_no: "6139", trade_type_name: "전세", article_jeonse_ratio: 68.2 }}
        complex={{ ...C6139, jeonse_rate: 61 }}
      />,
    );
    expect(screen.getByText("대표 면적 시세(59㎡)")).toBeInTheDocument();
    expect(screen.getByText("1억 7,200만")).toBeInTheDocument();
    expect(screen.getByText("전세가율(이 단지, 같은 면적)")).toBeInTheDocument();
    expect(screen.getByText("전세가율(매물, 같은 면적 기준)")).toBeInTheDocument();
    expect(screen.queryByText("주변시세")).toBeNull();
  });
});

describe("PriceHistoryChart 계열 분리 (세션 474 B27 보완 ①)", () => {
  const base = { trade_type_label: "매매", price_upper: null, price_lower: null, base_month: "202604" };

  it("평형을 고르면 같은 달 매매가 정부 실거래·네이버 시세 두 선으로 — 합치지 않는다", () => {
    render(
      <PriceHistoryChart
        areaLabel="전용 84㎡ 대"
        items={[
          { ...base, trade_type: "A1", price_avg: 22000, series: "정부 실거래" },
          { ...base, trade_type: "A1", price_avg: 24000, series: "네이버 시세" },
        ]}
      />,
    );
    const names = screen.getAllByTestId("line-name").map((el) => el.textContent);
    expect(names).toEqual(["매매 정부 실거래 중위 (전용 84㎡ 대)", "매매 네이버 시세(이 평형)"]);
  });

  it("옛 응답(series 없음)이면 범례 그대로 '매매 평균'", () => {
    render(<PriceHistoryChart items={[{ ...base, trade_type: "A1", price_avg: 22000 }]} />);
    expect(screen.getAllByTestId("line-name").map((el) => el.textContent)).toEqual(["매매 평균"]);
  });
});

describe("InfoCards 옛 값 표시 (보완 F2)", () => {
  it("옛 값 단지는 '1억 8,000만 (면적 섞인 옛 값)' · '53.6% (옛 값)'", () => {
    render(
      <InfoCards
        article={{ article_no: "A1", complex_no: "C8", trade_type_name: "매매" }}
        complex={{ complex_no: "C8", complex_name: "옛값단지", nearby_median_price: 18000, jeonse_rate: 53.6, price_basis: "legacy_mixed" }}
      />,
    );
    expect(screen.getByText("1억 8,000만 (면적 섞인 옛 값)")).toBeInTheDocument();
    expect(screen.getByText("53.6% (옛 값)")).toBeInTheDocument();
  });
});

describe("CompareCharts 계열 이름 (보완 F5)", () => {
  beforeEach(() => {
    mockGetPriceHistory.mockReset();
  });

  it("그 단지 그래프 면적을 붙인다 — '자연 (59㎡)' · 면적 모르면 '(면적 섞임)'", async () => {
    mockGetPriceHistory.mockImplementation((no: string) => Promise.resolve({
      complex_no: no,
      area_m2: no === "6139" ? 59 : null,
      items: [{ trade_type: "A1", trade_type_label: "매매", price_upper: 1, price_lower: 1, price_avg: 1, base_month: "202605" }],
    }));
    render(
      <CompareCharts complexes={[{ complex_no: "6139", complex_name: "자연" }, { complex_no: "9", complex_name: "옛단지" }]} expandAll />,
      { wrapper: TestQueryProvider },
    );
    await waitFor(() => {
      const names = screen.getAllByTestId("line-name").map((el) => el.textContent);
      expect(names).toEqual(expect.arrayContaining(["자연 (59㎡) 매매", "옛단지 (면적 섞임) 매매"]));
    });
  });
});

describe("PriceChartSection 제목·범례 (세션 474 B27)", () => {
  beforeEach(() => {
    mockGetPriceHistory.mockReset();
  });

  it("응답의 basis 를 제목으로, 면적을 범례로 · 기본 선택지 = 대표 면적", async () => {
    mockGetPriceHistory.mockResolvedValue({
      complex_no: "6139", area_m2: 59, basis: "최근 2년 전용 59㎡ 대 정부 실거래 중위 · 전세는 네이버 시세",
      items: [{ trade_type: "A1", trade_type_label: "매매", price_upper: 18000, price_lower: 18000, price_avg: 18000, base_month: "202605" }],
    });
    render(<PriceChartSection complexNo="6139" pyeongDetails={PYEONG_6139} repAreaM2={59} />, { wrapper: TestQueryProvider });
    expect(await screen.findByTestId("price-history-basis")).toHaveTextContent(
      "실거래가 추이 · 최근 2년 전용 59㎡ 대 정부 실거래 중위 · 전세는 네이버 시세",
    );
    await waitFor(() => expect(screen.getByTestId("chart-area-label")).toHaveTextContent("전용 59㎡ 대"));
    expect(screen.getByRole("option", { name: "대표 면적(전용 59㎡ 대)" })).toBeInTheDocument();
  });

  it("면적을 모르는 옛 응답이면 제목 없음 · 범례 그대로 · '전체 면적'", async () => {
    mockGetPriceHistory.mockResolvedValue({ complex_no: "C1", items: [] });
    render(<PriceChartSection complexNo="C1" pyeongDetails={PYEONG_6139} />, { wrapper: TestQueryProvider });
    await waitFor(() => expect(screen.getByTestId("chart-area-label")).toHaveTextContent("없음"));
    expect(screen.queryByTestId("price-history-basis")).toBeNull();
    expect(screen.getByRole("option", { name: "전체 면적" })).toBeInTheDocument();
  });
});
