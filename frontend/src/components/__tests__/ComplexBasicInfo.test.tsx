/**
 * ComplexBasicInfo 컴포넌트 테스트 — 단지 기본정보 행 렌더
 * 실행: npx vitest run src/components/__tests__/ComplexBasicInfo.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import ComplexBasicInfo from "../ComplexBasicInfo";
import type { Complex, OfficialPriceResponse, SubwayNearResponse } from "@/types";

const mockGetOfficialPrices = vi.fn<(no: string) => Promise<OfficialPriceResponse>>();
const mockGetComplexSubway = vi.fn<(no: string) => Promise<SubwayNearResponse>>();

vi.mock("@/lib/api/complex", () => ({
  getOfficialPrices: (no: string) => mockGetOfficialPrices(no),
  getComplexSubway: (no: string) => mockGetComplexSubway(no),
}));

/** 테스트용 단지 팩토리 */
function makeComplex(overrides: Partial<Complex> = {}): Complex {
  return {
    complex_no: "C001",
    complex_name: "래미안테스트",
    address: "서울시 강남구 역삼동 123",
    total_household_count: 500,
    ...overrides,
  };
}

/** 공시가격 없음 (기본) — 각 테스트에서 필요 시 덮어쓴다 */
const EMPTY_PRICES: OfficialPriceResponse = { complex_no: "C001", year: null, items: [] };

/** 지하철역 없음 (기본) — 지하철 행이 다른 describe 를 오염시키지 않게 매 테스트 초기화 */
const EMPTY_SUBWAY: SubwayNearResponse = { stations: [] };

// 모든 describe 공통 — 지하철 쿼리는 기본적으로 빈 배열(행 미표시)로 둔다.
beforeEach(() => {
  mockGetComplexSubway.mockReset();
  mockGetComplexSubway.mockResolvedValue(EMPTY_SUBWAY);
});

function renderInfo(cpx: Complex) {
  return render(
    <TestQueryProvider>
      <ComplexBasicInfo cpx={cpx} />
    </TestQueryProvider>,
  );
}

describe("ComplexBasicInfo", () => {
  beforeEach(() => {
    mockGetOfficialPrices.mockReset();
    mockGetOfficialPrices.mockResolvedValue(EMPTY_PRICES);
  });

  it("거래유형별 매물 수 — 0보다 큰 유형만 표시", async () => {
    renderInfo(makeComplex({ trade_type_counts: { 매매: 12, 전세: 5, 월세: 0, 단기임대: 0 } }));
    expect(await screen.findByText("거래유형별 매물")).toBeInTheDocument();
    // 0인 월세/단기임대는 생략
    expect(screen.getByText("매매 12 · 전세 5")).toBeInTheDocument();
  });

  it("거래유형별 매물 수 전부 0 → 행 미표시", async () => {
    renderInfo(makeComplex({ trade_type_counts: { 매매: 0, 전세: 0, 월세: 0, 단기임대: 0 } }));
    expect(await screen.findByText("주소")).toBeInTheDocument();
    expect(screen.queryByText("거래유형별 매물")).not.toBeInTheDocument();
  });

  it("trade_type_counts 없으면 행 미표시 (크래시 없음)", async () => {
    renderInfo(makeComplex());
    // 기존 행은 정상 렌더
    expect(await screen.findByText("주소")).toBeInTheDocument();
    expect(screen.queryByText("거래유형별 매물")).not.toBeInTheDocument();
  });
});

describe("ComplexBasicInfo — 공시가격 · 공시가율 (PR-D)", () => {
  beforeEach(() => {
    mockGetOfficialPrices.mockReset();
  });

  it("정상 표시 — 대표평형(ho_count 최대) 공시가격 + 공시가율", async () => {
    // 대표평형 = ho_count 최대인 84.99㎡ (price_median 8억4천만원 = 84,000만원).
    // 주변시세 120,000만원(12억) → 공시가율 = 84000/120000 = 70.0%
    mockGetOfficialPrices.mockResolvedValue({
      complex_no: "C001",
      year: "2026",
      items: [
        { prvuse_ar: 59.98, price_median: 600_000_000, ho_count: 120 },
        { prvuse_ar: 84.99, price_median: 840_000_000, ho_count: 380 },
        { prvuse_ar: 114.5, price_median: 1_100_000_000, ho_count: 60 },
      ],
    });

    renderInfo(makeComplex({ nearby_median_price: 120_000 }));

    expect(await screen.findByText("공시가격(대표평형 중위, 2026년)")).toBeInTheDocument();
    // 84,000만원 = 8억 4,000만 (formatKoreanPrice 표기)
    expect(screen.getByText("8억 4,000만")).toBeInTheDocument();
    expect(screen.getByText("공시가율(공시가격÷주변시세)")).toBeInTheDocument();
    expect(screen.getByText("70.0%")).toBeInTheDocument();
  });

  it("공시가격 데이터 없음(items:[]) → 두 행 모두 미추가", async () => {
    mockGetOfficialPrices.mockResolvedValue({ complex_no: "C001", year: null, items: [] });

    renderInfo(makeComplex({ nearby_median_price: 120_000 }));

    // 기존 행은 정상 렌더 (렌더 완료 대기)
    expect(await screen.findByText("주소")).toBeInTheDocument();
    expect(screen.queryByText(/공시가격\(대표평형 중위/)).not.toBeInTheDocument();
    expect(screen.queryByText("공시가율(공시가격÷주변시세)")).not.toBeInTheDocument();
  });

  it("주변시세(nearby_median_price) 없으면 공시가격 행만 표시, 공시가율 행 미추가", async () => {
    mockGetOfficialPrices.mockResolvedValue({
      complex_no: "C001",
      year: "2026",
      items: [{ prvuse_ar: 84.99, price_median: 840_000_000, ho_count: 380 }],
    });

    renderInfo(makeComplex({ nearby_median_price: undefined }));

    expect(await screen.findByText("공시가격(대표평형 중위, 2026년)")).toBeInTheDocument();
    expect(screen.queryByText("공시가율(공시가격÷주변시세)")).not.toBeInTheDocument();
  });

  it("공시가율 계산·반올림 — 소수 1자리 (66.666..% → 66.7%)", async () => {
    // 공시가격 60,000만원 ÷ 주변시세 90,000만원 = 66.666..% → 66.7%
    mockGetOfficialPrices.mockResolvedValue({
      complex_no: "C001",
      year: "2026",
      items: [{ prvuse_ar: 84.99, price_median: 600_000_000, ho_count: 380 }],
    });

    renderInfo(makeComplex({ nearby_median_price: 90_000 }));

    expect(await screen.findByText("66.7%")).toBeInTheDocument();
  });

  it("조회 실패(에러) → 두 행 미추가, 기존 행은 정상 렌더 (크래시 없음)", async () => {
    mockGetOfficialPrices.mockRejectedValue(new Error("500"));

    renderInfo(makeComplex({ nearby_median_price: 120_000 }));

    expect(await screen.findByText("주소")).toBeInTheDocument();
    expect(screen.queryByText(/공시가격\(대표평형 중위/)).not.toBeInTheDocument();
    expect(screen.queryByText("공시가율(공시가격÷주변시세)")).not.toBeInTheDocument();
  });
});

describe("ComplexBasicInfo — 가까운 지하철", () => {
  beforeEach(() => {
    mockGetOfficialPrices.mockReset();
    mockGetOfficialPrices.mockResolvedValue(EMPTY_PRICES);
  });

  it("역이 있으면 행을 표시한다 — 환승역 노선 · 연결 + 거리", async () => {
    mockGetComplexSubway.mockResolvedValue({
      stations: [
        { station_name: "강남", lines: ["2호선", "신분당선"], distance_m: 320 },
        { station_name: "역삼", lines: ["2호선"], distance_m: 540 },
      ],
    });

    renderInfo(makeComplex());

    expect(await screen.findByText("가까운 지하철")).toBeInTheDocument();
    expect(
      screen.getByText("강남역 (2호선·신분당선) 320m · 역삼역 (2호선) 540m"),
    ).toBeInTheDocument();
  });

  it("역 없음(stations:[]) → 행 미표시, 기존 행은 정상 렌더", async () => {
    mockGetComplexSubway.mockResolvedValue({ stations: [] });

    renderInfo(makeComplex());

    expect(await screen.findByText("주소")).toBeInTheDocument();
    expect(screen.queryByText("가까운 지하철")).not.toBeInTheDocument();
  });

  it("조회 실패(에러) → 행 미표시, 기존 행은 정상 렌더 (크래시 없음)", async () => {
    mockGetComplexSubway.mockRejectedValue(new Error("500"));

    renderInfo(makeComplex());

    expect(await screen.findByText("주소")).toBeInTheDocument();
    expect(screen.queryByText("가까운 지하철")).not.toBeInTheDocument();
  });

  it("1km 이상 역은 km 표기로 나온다", async () => {
    mockGetComplexSubway.mockResolvedValue({
      stations: [{ station_name: "선릉역", lines: ["2호선", "수인분당선"], distance_m: 1200 }],
    });

    renderInfo(makeComplex());

    // 역명이 이미 "역"으로 끝나므로 접미사 중복 없음
    expect(await screen.findByText("선릉역 (2호선·수인분당선) 1.2km")).toBeInTheDocument();
  });
});

describe("ComplexBasicInfo — 인쇄 경로 회귀 (PR-D)", () => {
  beforeEach(() => {
    mockGetOfficialPrices.mockReset();
    mockGetOfficialPrices.mockResolvedValue({
      complex_no: "C001",
      year: "2026",
      items: [{ prvuse_ar: 84.99, price_median: 840_000_000, ho_count: 380 }],
    });
  });

  it("인쇄(beforeprint) 후에도 공시가격·공시가율 행이 그대로 노출된다", async () => {
    // ComplexDashboard 는 beforeprint 이벤트로 isPrinting=true 를 세워 info 섹션(이 컴포넌트)을
    // 강제 노출한다(ComplexDashboard.tsx:62~71, 142). 이 컴포넌트 자체는 isPrinting 을 받지
    // 않으므로, 인쇄 시 마운트된 상태에서 두 행이 사라지지 않는지를 가드한다.
    renderInfo(makeComplex({ nearby_median_price: 120_000 }));

    expect(await screen.findByText("공시가격(대표평형 중위, 2026년)")).toBeInTheDocument();
    expect(screen.getByText("공시가율(공시가격÷주변시세)")).toBeInTheDocument();

    window.dispatchEvent(new Event("beforeprint"));

    expect(screen.getByText("공시가격(대표평형 중위, 2026년)")).toBeInTheDocument();
    expect(screen.getByText("공시가율(공시가격÷주변시세)")).toBeInTheDocument();
    expect(screen.getByText("70.0%")).toBeInTheDocument();
  });
});
