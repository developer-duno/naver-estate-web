/**
 * 면적별 시세(B27) 화면 회귀 — 세션 474 PR 5 (사장님 결정 D3 「A. 대표 면적 크게 + 나머지 작게」)
 *
 * 픽스처 = 단지 6139(자연, 대전 유성 궁동) 운영 실측: 대표 59㎡(116세대) 중위 1억 7,200만(3건) ·
 * 84㎡ 2억 2,000만(1건) · 42㎡ 거래 없음 · 59㎡ 전세 시세 없음 · 시군구 전세가율 71.2%.
 * 실행: npx vitest run src/components/complex/__tests__/AreaPriceB27.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestQueryProvider } from "@/test-setup";
import ComplexDashboard from "../ComplexDashboard";
import PriceChartSection from "../PriceChartSection";
import InfoCards from "@/components/article/InfoCards";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import CompareCharts from "@/components/CompareCharts";
import { areaGroupOf, areaGroupRange, otherAreaText, pickRepresentativeArea, sameAreaFilters } from "@/lib/area-group";
import type { AreaPrice, AreaTrade, Complex, PyeongDetail } from "@/types";

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
  // 범위 띠·거래 점도 범례 이름이 있으면 같은 자리에(세션 489 B29 — 정부 실거래는 선 대신 띠 + 점)
  Area: ({ name }: { name?: string }) => (name ? <div data-testid="line-name">{name}</div> : null),
  Scatter: ({ name }: { name?: string }) => (name ? <div data-testid="line-name">{name}</div> : null),
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

/** 옛 화면(중위)용 출처 — 화면은 더 이상 읽지 않는다(세션 489 PR b2 G) */
const OLD_SOURCE =
  "정부 실거래 최근 6개월, 전용 59㎡ 대는 소수점을 버린 같은 크기끼리 · 전세가율 = 네이버 전세 시세(같은 면적) ÷ 정부 실거래 중위";
/** 범위 화면 출처(BE area_price_range_source 정본 글자) */
const SOURCE =
  "정부 실거래 최근 6개월 최저~최고(중개거래 기준), 전용 59㎡ 대는 소수점을 버린 같은 크기끼리 · 전세가율 = 네이버 전세 시세(같은 면적, 최신 주) ÷ 정부 실거래 최저~최고";

/** 6139 59㎡ 라이브 API 실측(10-31 06:5x) — 거래일 내림차순 */
const T59: AreaTrade[] = [
  { price: 15700, date: "2026-06-26", floor: 4, direct: false },
  { price: 17200, date: "2026-06-05", floor: 8, direct: false },
  { price: 18000, date: "2026-05-05", floor: 7, direct: false },
];

const C6139: Complex = {
  complex_no: "6139",
  complex_name: "자연",
  rep_area_m2: 59,
  // 옛 칸(중위·잡 건수) — 화면이 읽지 않는 것을 단언하려고 일부러 다른 값으로 둔다
  nearby_median_price: 17200,
  recent_trades_6m: 9,
  // BE 가 평형표의 모든 묶음을 대표 먼저·거래 수 순으로 준다(보완 ①) — 거래 없는 42 는 null · trades []
  area_prices: [
    { area_m2: 59, households: 116, price_median: 17200, trade_count: 3, price_min: 15700, price_max: 18000, trades: T59 },
    { area_m2: 84, households: 70, price_median: 22000, trade_count: 1, price_min: 22000, price_max: 22000,
      trades: [{ price: 22000, date: "2026-07-10", floor: 12, direct: false }] },
    { area_m2: 42, households: 12, price_median: null, trade_count: null, price_min: null, price_max: null, trades: [] },
  ],
  area_price_source: OLD_SOURCE,
  area_price_range_source: SOURCE,
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

  /** 대표 면적(59) 항목만 바꾼 단지 */
  function withRep(rep: Partial<AreaPrice>, extra: Partial<Complex> = {}): Complex {
    return { ...C6139, ...extra, area_prices: [{ ...C6139.area_prices![0], ...rep }, ...C6139.area_prices!.slice(1)] };
  }
  const priceBox = () => screen.getByRole("button", { name: /^시세 · 전용 59㎡/ });

  it("A1·B·G — 최저 ~ 최고 · 칩 N = 거래 목록 길이 · 다른 면적 범위 · 전세가율 범위 · 새 출처 글자 (세션 489 B29)", () => {
    renderDashboard({ ...C6139, jeonse_rate: 61, jeonse_rate_min: 72, jeonse_rate_max: 80 });
    const box = priceBox();
    expect(box).toHaveTextContent("시세 · 전용 59㎡(116세대)");
    expect(box).toHaveTextContent("1억 5,700만 ~ 1억 8,000만");
    expect(box).not.toHaveTextContent("1억 7,200만"); // 중위(nearby_median_price)는 안 읽는다
    expect(screen.getByTestId("box-chip-prices")).toHaveTextContent("최근 6개월 3건"); // 잡 값 9 가 아니라 목록 3
    expect(box).toHaveTextContent("84㎡ 2억 2,000만 (1건) · 42㎡ —");
    expect(screen.getByTestId("box-extra-prices")).toHaveTextContent("전세가율(59㎡) 72%~80% · 대전 유성구 아파트 71.2%");
    expect(box).not.toHaveTextContent("61%"); // 옛 한 값 전세가율은 안 읽는다
    expect(screen.getByTestId("box-note-prices")).toHaveTextContent(
      `이 단지: ${SOURCE} · 지역: 한국부동산원 전국주택가격동향조사(2026.09)`,
    );
    expect(box).not.toHaveTextContent(OLD_SOURCE);
    expect(box.textContent).not.toMatch(/중위|중앙값/);
    expect(box).not.toHaveTextContent("매물 평균");
  });

  it("A1 — 펼치면 최근 6개월 거래 목록(거래일 내림차순) · 줄 수 = 칩 N", async () => {
    renderDashboard({ ...C6139, jeonse_rate_min: 72, jeonse_rate_max: 80 });
    await userEvent.click(priceBox());
    const items = within(screen.getByTestId("rep-trade-list")).getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual([
      "2026.06.26 · 4층 · 1억 5,700만",
      "2026.06.05 · 8층 · 1억 7,200만",
      "2026.05.05 · 7층 · 1억 8,000만",
    ]);
    expect(screen.getByTestId("box-chip-prices")).toHaveTextContent(`최근 6개월 ${items.length}건`);
    expect(document.body.textContent).not.toMatch(/중위|중앙값/);
  });

  it("직거래 줄엔 작은 '직거래' · 날짜 없으면 '날짜 미상' · 층 없으면 생략", async () => {
    renderDashboard(withRep({ trades: [...T59, { price: 12000, date: null, floor: null, direct: true }] }));
    await userEvent.click(priceBox());
    const items = within(screen.getByTestId("rep-trade-list")).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[3]).toHaveTextContent("날짜 미상 · 1억 2,000만직거래");
    expect(items.slice(0, 3).filter((li) => li.textContent?.includes("직거래"))).toHaveLength(0);
    expect(screen.getByTestId("box-chip-prices")).toHaveTextContent("최근 6개월 4건");
  });

  it("A3 — 최저=최고 & 2건 이상이면 한 값 + (2건)", () => {
    renderDashboard(withRep({ price_min: 18000, price_max: 18000, trades: [T59[2], { ...T59[2], date: "2026-05-01" }] }));
    expect(priceBox()).toHaveTextContent("1억 8,000만 (2건)");
  });

  it("A3 — 직거래만(범위 null · 목록 있음) → — · 칩 '3건(직거래만)' · 목록은 보인다", async () => {
    renderDashboard(withRep({ price_min: null, price_max: null, trades: T59.map((t) => ({ ...t, direct: true })) }));
    expect(screen.getByTestId("box-chip-prices")).toHaveTextContent("최근 6개월 3건(직거래만)");
    expect(priceBox()).toHaveTextContent("—");
    await userEvent.click(priceBox());
    expect(within(screen.getByTestId("rep-trade-list")).getAllByRole("listitem")).toHaveLength(3);
  });

  it("A4 — 목록이 비었는데 범위가 있으면 값은 보이고 칩은 숨긴다(0건으로 보이지 않게)", () => {
    renderDashboard(withRep({ trades: [] }));
    expect(priceBox()).toHaveTextContent("1억 5,700만 ~ 1억 8,000만");
    expect(screen.queryByTestId("box-chip-prices")).toBeNull();
  });

  it("A3 — 대표 면적 거래 0건이면 큰 숫자 — · 칩 없음 · 다른 면적 줄만 (매물 평균으로 안 돌아간다)", () => {
    renderDashboard(withRep({ price_median: null, trade_count: null, price_min: null, price_max: null, trades: [] }, { nearby_median_price: undefined }));
    const box = priceBox();
    expect(box).toHaveTextContent("—");
    expect(box).toHaveTextContent("84㎡ 2억 2,000만 (1건)");
    expect(box).not.toHaveTextContent("매물 평균");
    expect(screen.queryByTestId("box-chip-prices")).toBeNull();
  });

  it("B — 로그인 응답인데 전세가율 범위가 null 이면 이 단지 전세가율은 비우고 지역 값만", () => {
    renderDashboard({ ...C6139, jeonse_rate: 61, jeonse_rate_min: null, jeonse_rate_max: null });
    const extra = screen.getByTestId("box-extra-prices");
    expect(extra).toHaveTextContent("대전 유성구 아파트 전세가율 71.2%");
    expect(extra).not.toHaveTextContent("전세가율(59㎡)");
  });

  it("B — 범위 양끝이 같으면 한 값", () => {
    renderDashboard({ ...C6139, jeonse_rate_min: 75, jeonse_rate_max: 75 });
    expect(screen.getByTestId("box-extra-prices")).toHaveTextContent("전세가율(59㎡) 75% · 대전 유성구 아파트 71.2%");
  });

  it("H — 비로그인 응답(전세가율 칸 없음)이면 이 단지 전세가율 글자 없이 지역 값만 (세션 481)", () => {
    renderDashboard(C6139);
    const extra = screen.getByTestId("box-extra-prices");
    expect(extra).toHaveTextContent("대전 유성구 아파트 전세가율 71.2%");
    expect(extra).not.toHaveTextContent("전세가율(59㎡)");
  });

  it("H — 면적별 칸이 아예 없으면(직접 조회 폴백) 큰 값 — · 칩·다른 면적 줄·목록 없음 · 못 불러옴 글자 없음", async () => {
    renderDashboard({ ...C6139, area_prices: undefined });
    const box = priceBox();
    expect(box).toHaveTextContent("—");
    expect(screen.queryByTestId("box-chip-prices")).toBeNull();
    expect(box).not.toHaveTextContent("84㎡");
    expect(box).not.toHaveTextContent("1억 7,200만");
    await userEvent.click(box);
    expect(screen.queryByTestId("rep-trade-list")).toBeNull();
    expect(document.body.textContent).not.toMatch(/불러오지|못 불러/);
  });

  it("A' — 옛 값 단지: legacy_range 범위 + 작은 줄(직거래 포함) · 전세가율 비움 · 중위 글자 없음", () => {
    renderDashboard({
      complex_no: "C8", complex_name: "옛값단지", nearby_median_price: 15000, jeonse_rate: 53.6, price_basis: "legacy_mixed",
      legacy_range: { lower: 12000, upper: 18000, month: "202503" },
      region_jeonse_ratio: 71.2, region_name: "대전 유성구", region_jeonse_source: "부동산원", region_jeonse_period: "2026.09",
    }, []);
    const box = screen.getByRole("button", { name: "시세 메뉴 열기" });
    expect(box).toHaveTextContent("1억 2,000만 ~ 1억 8,000만");
    expect(box).not.toHaveTextContent("1억 5,000만");
    expect(screen.getByTestId("box-extra-prices")).toHaveTextContent("2025년 3월 거래 · 면적 섞임 · 직거래 포함 · 그 뒤 거래 없음");
    expect(box).not.toHaveTextContent("53.6");
    expect(box).toHaveTextContent("대전 유성구 아파트 전세가율 71.2%");
    expect(box.textContent).not.toMatch(/중위|중앙값|면적 섞인 옛 값/);
  });

  it("A' — legacy_range 가 null 이면 — + '최근 거래 없음'", () => {
    renderDashboard({ complex_no: "C8", complex_name: "옛값단지", nearby_median_price: 15000, price_basis: "legacy_mixed", legacy_range: null }, []);
    const box = screen.getByRole("button", { name: "시세 메뉴 열기" });
    expect(box).toHaveTextContent("—");
    expect(screen.getByTestId("box-extra-prices")).toHaveTextContent("최근 거래 없음");
  });

  it("A'·H — legacy_range 칸이 없으면 — 만(작은 줄 없음, 중위 값으로 안 돌아간다)", () => {
    renderDashboard({ complex_no: "C8", complex_name: "옛값단지", nearby_median_price: 15000, price_basis: "legacy_mixed" }, []);
    const box = screen.getByRole("button", { name: "시세 메뉴 열기" });
    expect(box).toHaveTextContent("—");
    expect(box).not.toHaveTextContent("1억 5,000만");
    expect(screen.queryByTestId("box-extra-prices")).toBeNull();
  });

  it("대표 면적 단지(6139)는 옛 값 표시 없음", () => {
    renderDashboard({ ...C6139, price_basis: "rep_area" });
    expect(screen.queryByText(/면적 섞임/)).toBeNull();
  });

  it("대표 면적이 없으면 지금처럼 — 라벨 '시세' · 매물 평균 대체값", () => {
    renderDashboard({ complex_no: "C9", complex_name: "옛단지" }, []);
    const box = screen.getByRole("button", { name: "시세 메뉴 열기" });
    expect(box).toHaveTextContent("매매 매물 평균 9억 9,999만"); // 평형표가 없어 면적을 모름(세션 475)
    expect(box).not.toHaveTextContent("㎡)");
    expect(screen.queryByTestId("box-chip-prices")).toBeNull();
    expect(mockUseComplexArticleAvg).toHaveBeenLastCalledWith("C9", undefined, { avgEnabled: true, avgAreaM2: null, enabled: true });
  });

  // 세션 475 PR 6 — 대체값은 매매 매물만 + 평형표 세대수 최다 묶음만
  it("대표 면적이 없으면 매매 매물 평균을 평형표 대표 묶음(59㎡)으로", () => {
    renderDashboard({ complex_no: "C9", complex_name: "옛단지" });
    const box = screen.getByRole("button", { name: "시세 메뉴 열기" });
    expect(box).toHaveTextContent("매매 매물 평균(59㎡) 9억 9,999만");
    expect(mockUseComplexArticleAvg).toHaveBeenLastCalledWith("C9", undefined, { avgEnabled: true, avgAreaM2: 59, enabled: true });
  });

  it("대표 면적 값이 있으면 매매 평균 요청을 켜지 않는다", () => {
    renderDashboard(C6139);
    expect(mockUseComplexArticleAvg).toHaveBeenLastCalledWith("6139", undefined, { avgEnabled: false, avgAreaM2: null, enabled: true });
  });

  // 보완 Q4 — 대표 면적은 없고 옛 시세가 남은 단지(legacy_mixed)는 시세 칸에 옛 값이 나오므로 매매 요청을 켜지 않는다
  it("legacy_mixed 단지는 매매 평균 요청을 켜지 않는다", () => {
    renderDashboard({ complex_no: "C8", complex_name: "옛값단지", nearby_median_price: 18000, price_basis: "legacy_mixed" });
    expect(mockUseComplexArticleAvg).toHaveBeenLastCalledWith("C8", undefined, { avgEnabled: false, avgAreaM2: null, enabled: true });
  });

  // 보완 Q5 — 평형표를 받기 전엔 매매 평균을 띄우지 않는다(면적 없는 평균 → 묶음 평균으로 숫자가 한 번 바뀌지 않게)
  it("평형표를 받기 전(pyeongReady=false)엔 매매 평균 요청을 켜지 않는다", () => {
    render(
      <ComplexDashboard complex={{ complex_no: "C9", complex_name: "옛단지" }} complexNo="C9" pyeongDetails={[]}
        pyeongReady={false} sessionToken={undefined} onFilterChange={() => {}} />,
    );
    expect(mockUseComplexArticleAvg).toHaveBeenLastCalledWith("C9", undefined, { avgEnabled: false, avgAreaM2: null, enabled: true });
  });

  it("면적 묶음 필터 = N 이상 N+1 미만(서버 <= 비교라 N+0.999) · 경쟁 매물 필터", () => {
    expect(areaGroupRange(84)).toEqual({ min_area_m2: 84, max_area_m2: 84.999 });
    expect(sameAreaFilters("매매", 84.97)).toEqual({ trade_types: "매매", min_area_m2: 84, max_area_m2: 84.999 });
    expect(sameAreaFilters("매매", null)).toEqual({ trade_types: "매매" });
    expect(sameAreaFilters(undefined, undefined)).toBeUndefined();
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

  it("otherAreaText 는 최대 3개 · 범위 + 거래 목록 건수 · 중위는 안 읽는다 (세션 489 B29)", () => {
    const t = (price: number): AreaTrade => ({ price, date: "2026-06-01", floor: 3, direct: false });
    const many: AreaPrice[] = [
      { area_m2: 59, price_median: 1, trade_count: 9, price_min: 1, price_max: 2, trades: [t(1)] },
      { area_m2: 74, price_median: 99999, trade_count: 5, price_min: 20000, price_max: 21000, trades: [t(20000), t(21000)] },
      { area_m2: 84, price_median: 99999, trade_count: 4, price_min: 30000, price_max: 30000, trades: [t(30000)] },
      { area_m2: 101, price_median: 99999, trade_count: 2, price_min: 40000, price_max: 42000, trades: [t(40000), t(42000), t(41000)] },
      { area_m2: 114, price_median: 50000, trade_count: 1, price_min: 50000, price_max: 50000, trades: [t(50000)] },
    ];
    expect(otherAreaText(59, many).split(" · ")).toHaveLength(3);
    expect(otherAreaText(59, many)).toBe("74㎡ 2억~2억 1,000만 (2건) · 84㎡ 3억 (1건) · 101㎡ 4억~4억 2,000만 (3건)");
  });
});

describe("InfoCards 라벨 (세션 474 B27)", () => {
  it("대표 면적이 있으면 '대표 면적 시세(59㎡)' · '전세가율(이 단지, 같은 면적)' · 매물은 '같은 면적 기준'", () => {
    render(
      <InfoCards
        article={{ article_no: "A1", complex_no: "6139", trade_type_name: "전세", article_jeonse_ratio: 68.2,
          article_jeonse_ratio_min: 66.7, article_jeonse_ratio_max: 76.4 }}
        complex={{ ...C6139, jeonse_rate: 61, jeonse_rate_min: 72, jeonse_rate_max: 80 }}
      />,
    );
    expect(screen.getByText("대표 면적 시세(59㎡)")).toBeInTheDocument();
    // F — 대시보드·비교표와 같은 글자(세션 489 B29) · 중위 1억 7,200만은 안 읽는다
    expect(screen.getByText("1억 5,700만 ~ 1억 8,000만 (3건)")).toBeInTheDocument();
    expect(screen.queryByText("1억 7,200만")).toBeNull();
    expect(screen.getByText("전세가율(이 단지, 같은 면적)")).toBeInTheDocument();
    expect(screen.getByText("72%~80%")).toBeInTheDocument();
    expect(screen.getByText("전세가율(매물, 같은 면적 기준)")).toBeInTheDocument();
    expect(screen.getByText("66.7%~76.4%")).toBeInTheDocument();   // C — 보증금 ÷ 최고 ~ 최저
    expect(screen.queryByText(/68\.2|61%/)).toBeNull();
    expect(screen.queryByText("주변시세")).toBeNull();
  });

  it("H — 매물 상세 단지 카드: 칸이 없으면(직접 조회 폴백·비로그인) 그 줄을 그리지 않는다 · 값 null 이면 비움", () => {
    render(
      <InfoCards
        article={{ article_no: "A1", complex_no: "6139", trade_type_name: "전세", article_jeonse_ratio_min: null, article_jeonse_ratio_max: null }}
        complex={{ ...C6139, area_prices: undefined, jeonse_rate: 61 }}
      />,
    );
    expect(screen.queryByText("대표 면적 시세(59㎡)")).toBeNull();
    expect(screen.queryByText("전세가율(이 단지, 같은 면적)")).toBeNull();
    expect(screen.queryByText("전세가율(매물, 같은 면적 기준)")).toBeNull();
    expect(document.body.textContent).not.toMatch(/불러오지|못 불러|중위/);
  });
});

describe("PriceHistoryChart 계열 분리 (세션 474 B27 보완 ① · 세션 489 B29 범위 띠)", () => {
  const base = { trade_type_label: "매매", price_upper: null, price_lower: null, base_month: "202604" };

  it("평형을 고르면 같은 달 매매가 정부 실거래(최저~최고 띠)·네이버 시세 선으로 — 합치지 않는다 · 중위 선 없음", () => {
    render(
      <PriceHistoryChart
        areaLabel="전용 84㎡ 대"
        items={[
          { ...base, trade_type: "A1", price_avg: 22000, series: "정부 실거래", range_lower: 21000, range_upper: 23000,
            trades: [{ price: 21000, date: "2026-04-03", floor: 5, direct: false }, { price: 23000, date: "2026-04-20", floor: 9, direct: false }] },
          { ...base, trade_type: "A1", price_avg: 24000, series: "네이버 시세" },
        ]}
      />,
    );
    const names = screen.getAllByTestId("line-name").map((el) => el.textContent);
    expect(names).toEqual(["매매 정부 실거래 최저~최고 (전용 84㎡ 대)", "매매 실거래(거래 1건 = 점 1개)", "매매 네이버 시세(이 평형)"]);
    expect(names.join(" ")).not.toMatch(/중위|중앙값/);
  });

  it("옛 응답(series 없음)이면 범례 그대로 '매매 평균'", () => {
    render(<PriceHistoryChart items={[{ ...base, trade_type: "A1", price_avg: 22000 }]} />);
    expect(screen.getAllByTestId("line-name").map((el) => el.textContent)).toEqual(["매매 평균"]);
  });
});

describe("InfoCards 옛 값 표시 (보완 F2 → 세션 489 B29 A')", () => {
  it("옛 값 단지는 legacy_range 범위 + 작은 줄 · 전세가율 비움", () => {
    render(
      <InfoCards
        article={{ article_no: "A1", complex_no: "C8", trade_type_name: "매매" }}
        complex={{ complex_no: "C8", complex_name: "옛값단지", nearby_median_price: 15000, jeonse_rate: 53.6, price_basis: "legacy_mixed",
          jeonse_rate_min: null, jeonse_rate_max: null, legacy_range: { lower: 12000, upper: 18000, month: "202503" } }}
      />,
    );
    expect(screen.getByText("1억 2,000만 ~ 1억 8,000만 (2025년 3월 거래 · 면적 섞임 · 직거래 포함 · 그 뒤 거래 없음)")).toBeInTheDocument();
    expect(screen.queryByText(/53\.6|옛 값\)|1억 5,000만/)).toBeNull();
  });

  it("legacy_range 가 null 이면 '— (최근 거래 없음)'", () => {
    render(
      <InfoCards
        article={{ article_no: "A1", complex_no: "C8", trade_type_name: "매매" }}
        complex={{ complex_no: "C8", complex_name: "옛값단지", nearby_median_price: 15000, price_basis: "legacy_mixed", legacy_range: null }}
      />,
    );
    expect(screen.getByText("— (최근 거래 없음)")).toBeInTheDocument();
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

  it("G — 응답의 basis_range(새 칸)를 제목으로, 면적을 범례로 · 옛 basis(중위) 글자는 안 보인다 · 기본 선택지 = 대표 면적", async () => {
    mockGetPriceHistory.mockResolvedValue({
      complex_no: "6139", area_m2: 59, basis: "최근 2년 전용 59㎡ 대 정부 실거래 중위 · 전세는 네이버 시세",
      basis_range: "최근 2년 전용 59㎡ 대 정부 실거래 최저~최고(거래는 점) · 전세는 네이버 시세",
      items: [{ trade_type: "A1", trade_type_label: "매매", price_upper: 18000, price_lower: 18000, price_avg: 18000, base_month: "202605" }],
    });
    render(<PriceChartSection complexNo="6139" pyeongDetails={PYEONG_6139} repAreaM2={59} />, { wrapper: TestQueryProvider });
    const basis = await screen.findByTestId("price-history-basis");
    expect(basis).toHaveTextContent(
      "실거래가 추이 · 최근 2년 전용 59㎡ 대 정부 실거래 최저~최고(거래는 점) · 전세는 네이버 시세",
    );
    expect(basis.textContent).not.toMatch(/중위/);
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
