/**
 * ComplexBasicInfo 컴포넌트 테스트 — 단지 기본정보 행 렌더
 * 실행: npx vitest run src/components/__tests__/ComplexBasicInfo.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import ComplexBasicInfo from "../ComplexBasicInfo";
import type {
  Complex,
  KaptInfo,
  NeighborhoodInfo,
  OfficialPriceResponse,
  SubwayNearResponse,
} from "@/types";

const mockGetOfficialPrices = vi.fn<(no: string) => Promise<OfficialPriceResponse>>();
const mockGetComplexSubway = vi.fn<(no: string) => Promise<SubwayNearResponse>>();
const mockGetComplexKapt = vi.fn<(no: string) => Promise<KaptInfo | null>>();
const mockGetComplexNeighborhood = vi.fn<(no: string) => Promise<NeighborhoodInfo | null>>();

vi.mock("@/lib/api/complex", () => ({
  getOfficialPrices: (no: string) => mockGetOfficialPrices(no),
  getComplexSubway: (no: string) => mockGetComplexSubway(no),
  getComplexKapt: (no: string) => mockGetComplexKapt(no),
  getComplexNeighborhood: (no: string) => mockGetComplexNeighborhood(no),
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
  // 동네 통계 없음(404 → null) — 섹션 통째 생략이 기본
  mockGetComplexNeighborhood.mockReset();
  mockGetComplexNeighborhood.mockResolvedValue(null);
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

/** 자양2동 픽스처 — 운영 실측 모양(집 종류·재해·중개업 비율은 수집 전이라 null) */
function makeNeighborhood(overrides: Partial<NeighborhoodInfo> = {}): NeighborhoodInfo {
  return {
    emd_cd: "11215850",
    emd_nm: "자양2동",
    year: 2024,
    population: 23116,
    avg_age: 45.4,
    one_person_pct: 36,
    households: 10105,
    one_person_households: 3638,
    house_mix: null,
    old_house_pct: 61,
    old_house_cutoff: "2004년 이전",
    corp_cnt: 1821,
    worker_cnt: 5496,
    broker_pct: null,
    flood: null,
    landslide: null,
    source: "국가데이터처 통계지리정보 센서스 2024, 홍수·산사태 위험지도 2025",
    ...overrides,
  };
}

describe("ComplexBasicInfo — 이 동네는 (SGIS)", () => {
  beforeEach(() => {
    mockGetOfficialPrices.mockReset();
    mockGetOfficialPrices.mockResolvedValue(EMPTY_PRICES);
  });

  it("자양2동 — 줄 문구가 시안대로, 집 종류·홍수 줄은 없음, 출처에 동 이름", async () => {
    mockGetComplexNeighborhood.mockResolvedValue(makeNeighborhood());

    renderInfo(makeComplex());

    expect(await screen.findByText("이 동네는")).toBeInTheDocument();
    expect(screen.getByText("사는 사람")).toBeInTheDocument();
    expect(screen.getByText("23,116명 · 평균 45.4세")).toBeInTheDocument();
    expect(screen.getByText("36%")).toBeInTheDocument();
    expect(screen.getByText("10,105가구 중 3,638가구")).toBeInTheDocument();
    expect(screen.getByText("2004년 이전 지은 집 61%")).toBeInTheDocument();
    expect(screen.getByText("사업체 1,821곳 · 일하는 사람 5,496명")).toBeInTheDocument();
    expect(screen.queryByText("집 종류")).not.toBeInTheDocument();
    expect(screen.queryByText("홍수·산사태")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "출처: 국가데이터처 통계지리정보 센서스 2024 (자양2동 기준), 홍수·산사태 위험지도 2025",
      ),
    ).toBeInTheDocument();
    // 기존 행도 그대로
    expect(screen.getByText("주소")).toBeInTheDocument();
  });

  it("비율은 받은 값 그대로 — 화면에서 다시 반올림하지 않는다(1인가구·오래된 집·집 종류)", async () => {
    mockGetComplexNeighborhood.mockResolvedValue(
      makeNeighborhood({
        one_person_pct: 61.5,
        old_house_pct: 61.5,
        house_mix: { apt_pct: 13.7, officetel_pct: 18.5, row_pct: 27.45, detached_pct: 31.9 },
      }),
    );

    renderInfo(makeComplex());

    expect(await screen.findByText("61.5%")).toBeInTheDocument();
    expect(screen.getByText("2004년 이전 지은 집 61.5%")).toBeInTheDocument();
    expect(
      screen.getByText("아파트 13.7% · 오피스텔 18.5% · 다세대 27.45% · 단독 31.9%"),
    ).toBeInTheDocument();
  });

  it("0 값은 빈 값이 아니다 — 사는 사람 0명·1인가구 0% 줄이 사라지지 않는다", async () => {
    mockGetComplexNeighborhood.mockResolvedValue(
      makeNeighborhood({ population: 0, one_person_pct: 0 }),
    );

    renderInfo(makeComplex());

    expect(await screen.findByText("0명 · 평균 45.4세")).toBeInTheDocument();
    expect(screen.getByText("1인가구")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("1인가구 수가 없으면 셋째 칸(보조 문구) 생략", async () => {
    mockGetComplexNeighborhood.mockResolvedValue(
      makeNeighborhood({ one_person_households: undefined }),
    );

    renderInfo(makeComplex());

    expect(await screen.findByText("36%")).toBeInTheDocument();
    expect(screen.queryByText(/가구 중/)).not.toBeInTheDocument();
  });

  it("집 종류 — 4개를 아파트·오피스텔·다세대·단독 순으로", async () => {
    mockGetComplexNeighborhood.mockResolvedValue(
      makeNeighborhood({
        house_mix: { apt_pct: 14, officetel_pct: 19, row_pct: 28, detached_pct: 32 },
      }),
    );

    renderInfo(makeComplex());

    expect(await screen.findByText("집 종류")).toBeInTheDocument();
    expect(screen.getByText("아파트 14% · 오피스텔 19% · 다세대 28% · 단독 32%")).toBeInTheDocument();
  });

  it("홍수·산사태 둘 다 영향 없음 → '위험지도 영향 구역 아님'", async () => {
    mockGetComplexNeighborhood.mockResolvedValue(
      makeNeighborhood({ flood: { affected: false }, landslide: { affected: false } }),
    );

    renderInfo(makeComplex());

    expect(await screen.findByText("홍수·산사태")).toBeInTheDocument();
    expect(screen.getByText("위험지도 영향 구역 아님")).toBeInTheDocument();
  });

  it("홍수·산사태 영향 있음 → 영향 있는 것마다 '동네 안에 … 구역 있음 — 그 구역에 M명'(동네 전체 인구는 안 씀)", async () => {
    mockGetComplexNeighborhood.mockResolvedValue(
      makeNeighborhood({
        flood: { affected: true, pop: 1200, pop_total: 23116, year: 2024 },
        landslide: { affected: true, pop: 8578, pop_total: 19840, year: 2024 },
      }),
    );

    renderInfo(makeComplex());

    expect(
      await screen.findByText(
        "동네 안에 홍수위험 구역 있음 — 그 구역에 1,200명 · 동네 안에 산사태위험 구역 있음 — 그 구역에 8,578명",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/19,840/)).not.toBeInTheDocument();
  });

  it("하나만 영향 있음(다른 하나는 모름) → 영향 있는 쪽만 표시", async () => {
    mockGetComplexNeighborhood.mockResolvedValue(
      makeNeighborhood({
        flood: null,
        landslide: { affected: true, pop: 8578, pop_total: 19840, year: 2024 },
      }),
    );

    renderInfo(makeComplex());

    expect(
      await screen.findByText("동네 안에 산사태위험 구역 있음 — 그 구역에 8,578명"),
    ).toBeInTheDocument();
  });

  it("영향 구역 사람 수 0 → '그 구역에 0명'(0 을 빈 값으로 보지 않는다)", async () => {
    mockGetComplexNeighborhood.mockResolvedValue(
      makeNeighborhood({
        flood: { affected: true, pop: 0, pop_total: 23116, year: 2024 },
        landslide: { affected: false },
      }),
    );

    renderInfo(makeComplex());

    expect(await screen.findByText("동네 안에 홍수위험 구역 있음 — 그 구역에 0명")).toBeInTheDocument();
  });

  it("영향 구역 사람 수 모름(null) → 꼬리 없이 앞부분만", async () => {
    mockGetComplexNeighborhood.mockResolvedValue(
      makeNeighborhood({
        flood: { affected: true, pop: null, pop_total: 23116, year: 2024 },
        landslide: { affected: false },
      }),
    );

    renderInfo(makeComplex());

    expect(await screen.findByText("동네 안에 홍수위험 구역 있음")).toBeInTheDocument();
    expect(screen.queryByText(/그 구역에/)).not.toBeInTheDocument();
  });

  it("홍수·산사태 둘 다 모름(null) → 줄 생략", async () => {
    mockGetComplexNeighborhood.mockResolvedValue(makeNeighborhood({ flood: null, landslide: null }));

    renderInfo(makeComplex());

    expect(await screen.findByText("이 동네는")).toBeInTheDocument();
    expect(screen.queryByText("홍수·산사태")).not.toBeInTheDocument();
  });

  it("하나만 모름(null)·다른 하나는 영향 없음 → 줄 생략(모르는 쪽을 '아님'으로 말하지 않는다)", async () => {
    mockGetComplexNeighborhood.mockResolvedValue(
      makeNeighborhood({ flood: { affected: false }, landslide: null }),
    );

    renderInfo(makeComplex());

    expect(await screen.findByText("이 동네는")).toBeInTheDocument();
    expect(screen.queryByText("홍수·산사태")).not.toBeInTheDocument();
    expect(screen.queryByText("위험지도 영향 구역 아님")).not.toBeInTheDocument();
  });

  it("조회 실패(5xx) → '동네 통계를 불러오지 못했어요' 한 줄, 소제목 없음, 기존 행은 정상", async () => {
    mockGetComplexNeighborhood.mockRejectedValue(new Error("500"));

    renderInfo(makeComplex());

    expect(await screen.findByText("동네 통계를 불러오지 못했어요")).toBeInTheDocument();
    expect(screen.queryByText("이 동네는")).not.toBeInTheDocument();
    expect(screen.getByText("주소")).toBeInTheDocument();
  });

  it("동네 통계 없음(404 → null) → 섹션 통째 생략", async () => {
    mockGetComplexNeighborhood.mockResolvedValue(null);

    renderInfo(makeComplex());

    expect(await screen.findByText("주소")).toBeInTheDocument();
    expect(screen.queryByText("이 동네는")).not.toBeInTheDocument();
    expect(screen.queryByText(/^출처:/)).not.toBeInTheDocument();
    expect(screen.queryByText("동네 통계를 불러오지 못했어요")).not.toBeInTheDocument();
  });

  it("로딩 중 → 소제목 없음", async () => {
    // 끝나지 않는 요청 — 로딩 상태 유지
    mockGetComplexNeighborhood.mockReturnValue(new Promise(() => {}));

    renderInfo(makeComplex());

    expect(await screen.findByText("주소")).toBeInTheDocument();
    expect(screen.queryByText("이 동네는")).not.toBeInTheDocument();
    expect(screen.queryByText("동네 통계를 불러오지 못했어요")).not.toBeInTheDocument();
  });

  it("단지 행이 하나도 없어도 동네 섹션은 보인다", async () => {
    mockGetComplexNeighborhood.mockResolvedValue(makeNeighborhood());

    renderInfo({ complex_no: "C001", complex_name: "빈단지" } as Complex);

    expect(await screen.findByText("이 동네는")).toBeInTheDocument();
    expect(screen.getByText("단지 상세 정보가 아직 수집되지 않았습니다.")).toBeInTheDocument();
  });
  // 인쇄 경로: 동네 섹션은 이 컴포넌트 안에 있으므로, 인쇄 시 이 컴포넌트가 마운트되는지는
  // ComplexDashboard.test.tsx 의 "인쇄(beforeprint) 시 단지정보 섹션 포함 4 섹션 모두 노출" 이 가드한다.
});
