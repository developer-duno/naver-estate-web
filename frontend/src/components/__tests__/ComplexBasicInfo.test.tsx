/**
 * ComplexBasicInfo 컴포넌트 테스트 — 단지 기본정보 행 렌더
 * 실행: npx vitest run src/components/__tests__/ComplexBasicInfo.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import ComplexBasicInfo from "../ComplexBasicInfo";
import type { Complex, KaptInfo, OfficialPriceResponse, SubwayNearResponse } from "@/types";

const mockGetOfficialPrices = vi.fn<(no: string) => Promise<OfficialPriceResponse>>();
const mockGetComplexSubway = vi.fn<(no: string) => Promise<SubwayNearResponse>>();
const mockGetComplexKapt = vi.fn<(no: string) => Promise<KaptInfo | null>>();

vi.mock("@/lib/api/complex", () => ({
  getOfficialPrices: (no: string) => mockGetOfficialPrices(no),
  getComplexSubway: (no: string) => mockGetComplexSubway(no),
  getComplexKapt: (no: string) => mockGetComplexKapt(no),
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

// 관리비 없음 (기본) — K-apt 미매칭 단지는 래퍼가 404 를 null 로 변환한다(다수 케이스).
const NO_KAPT = null;

/** 테스트용 관리비 팩토리 — 세대당 24만원(240,000원), 2026년 3월분 */
function makeKapt(overrides: Partial<KaptInfo> = {}): KaptInfo {
  return {
    kapt_code: "A13487001",
    kapt_name: "래미안테스트",
    corridor_type: "계단식",
    cost_month: "202603",
    common_cost: 80_000_000,
    individual_cost: 40_000_000,
    total_cost: 120_000_000,
    cost_per_household: 240_000,
    household_count: 500,
    ...overrides,
  };
}

// 모든 describe 공통 — 지하철·관리비 쿼리는 기본적으로 "데이터 없음"(행 미표시)으로 둔다.
beforeEach(() => {
  mockGetComplexSubway.mockReset();
  mockGetComplexSubway.mockResolvedValue(EMPTY_SUBWAY);
  mockGetComplexKapt.mockReset();
  mockGetComplexKapt.mockResolvedValue(NO_KAPT);
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

describe("ComplexBasicInfo — 월 관리비 · 복도유형 (K-apt)", () => {
  beforeEach(() => {
    mockGetOfficialPrices.mockReset();
    mockGetOfficialPrices.mockResolvedValue(EMPTY_PRICES);
  });

  it("데이터 있으면 '세대당 약 N만원 (YYYY년 M월분)' + 총액 보조텍스트 + 복도유형 표시", async () => {
    mockGetComplexKapt.mockResolvedValue(makeKapt());

    renderInfo(makeComplex());

    expect(await screen.findByText("월 관리비")).toBeInTheDocument();
    expect(screen.getByText("세대당 약 24만원 (2026년 3월분)")).toBeInTheDocument();
    // 총액은 보조 텍스트로 (원 단위 → 만원 환산)
    expect(
      screen.getByText("총 12,000만원 · 공용 8,000만원 · 개별 4,000만원"),
    ).toBeInTheDocument();
    expect(screen.getByText("복도유형")).toBeInTheDocument();
    expect(screen.getByText("계단식")).toBeInTheDocument();
  });

  it("데이터 없음(404 → null) → 두 행 모두 미표시, 기존 행은 정상 렌더", async () => {
    mockGetComplexKapt.mockResolvedValue(null);

    renderInfo(makeComplex());

    expect(await screen.findByText("주소")).toBeInTheDocument();
    expect(screen.queryByText("월 관리비")).not.toBeInTheDocument();
    expect(screen.queryByText("복도유형")).not.toBeInTheDocument();
  });

  it("조회 실패(5xx 에러) → 두 행 미표시, 기존 행은 정상 렌더 (크래시 없음)", async () => {
    mockGetComplexKapt.mockRejectedValue(new Error("500"));

    renderInfo(makeComplex());

    expect(await screen.findByText("주소")).toBeInTheDocument();
    expect(screen.queryByText("월 관리비")).not.toBeInTheDocument();
    expect(screen.queryByText("복도유형")).not.toBeInTheDocument();
  });

  it("cost_per_household 만 null 이면 관리비 행만 생략, 복도유형은 표시", async () => {
    mockGetComplexKapt.mockResolvedValue(makeKapt({ cost_per_household: null }));

    renderInfo(makeComplex());

    expect(await screen.findByText("복도유형")).toBeInTheDocument();
    expect(screen.queryByText("월 관리비")).not.toBeInTheDocument();
  });

  it("corridor_type 이 null 이면 복도유형 행만 생략, 관리비는 표시", async () => {
    mockGetComplexKapt.mockResolvedValue(makeKapt({ corridor_type: null }));

    renderInfo(makeComplex());

    expect(await screen.findByText("월 관리비")).toBeInTheDocument();
    expect(screen.queryByText("복도유형")).not.toBeInTheDocument();
  });

  it("금액 포맷 — 10만원 미만은 소수 1자리, 총액 항목이 없으면 보조텍스트 생략", async () => {
    mockGetComplexKapt.mockResolvedValue(
      makeKapt({
        cost_per_household: 85_000,
        cost_month: "202512",
        total_cost: null,
        common_cost: null,
        individual_cost: null,
      }),
    );

    renderInfo(makeComplex());

    expect(await screen.findByText("세대당 약 8.5만원 (2025년 12월분)")).toBeInTheDocument();
    expect(screen.queryByText(/^총 /)).not.toBeInTheDocument();
  });
});
