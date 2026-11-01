/**
 * 단지 비교 페이지 silent failure 회귀 가드
 * 실행: npx vitest run src/app/__tests__/compare.test.tsx
 *
 * 검증 시나리오:
 * - partial failure: 4개 중 2개 단지 API 실패 → 배너 + 헤더 "(2개 단지 / 선택 4개)"
 * - 전체 fail: 모든 단지 API 실패 → 본문 대체 안내 + 재시도 버튼
 * - 평당가 statsQueries 1개 fail → 해당 단지 평당가 셀에 "불러오기 실패" 표시
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { currentYm, monthsEndingAt } from "@/components/complex/consumer/consumer-format";
import userEvent from "@testing-library/user-event";
import ComparePage from "../compare/page";
import { TestQueryProvider } from "@/test-setup";
import * as api from "@/lib/api";

const mockPush = vi.fn();
const mockSearchParams = vi.fn(() => new URLSearchParams());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => mockSearchParams(),
}));

// 로그인 상태 가짜(세션 490) — 기본 = 로그인(네이버 행·차트가 있는 화면). 비로그인 시험만 토큰을 비운다
const mockSession = vi.hoisted(() => ({ sessionToken: "tok" as string | undefined, tokenReady: true }));
vi.mock("@/hooks/useSessionToken", () => ({
  useSessionToken: () => ({
    sessionToken: mockSession.sessionToken,
    tokenReady: mockSession.tokenReady,
    tokenError: false,
    dismissTokenError: () => {},
  }),
}));

vi.mock("@/components/CompareCharts", () => ({
  default: () => <div data-testid="compare-charts" />,
}));

function makeComplex(no: string) {
  return {
    complex_no: no,
    complex_name: `단지${no}`,
    address: "서울 강남",
    total_household_count: 500,
    total_dong_count: 5,
    high_floor: 30,
    low_floor: 1,
    parking_count_by_household: 1.2,
    floor_area_ratio: "250",
    building_coverage_ratio: "20",
    jeonse_rate: 67.7, // BE 저장 단위 = 퍼센트 (crawler/stats.py = jeonse/sale*100) — 옛 칸, 화면은 안 읽는다
    // 이 단지 전세가율 범위(세션 479 B29) — 퍼센트 그대로
    jeonse_rate_min: 64.2 as number | null | undefined,
    jeonse_rate_max: 67.7 as number | null | undefined,
  };
}

function makeStats(no: string) {
  return {
    complex_no: no,
    total_articles: 1,
    by_area: [],
    by_floor: [],
  };
}

vi.mock("@/lib/api", () => ({
  getComplex: vi.fn().mockImplementation((no: string) => Promise.resolve(makeComplex(no))),
  getPriceStats: vi.fn().mockImplementation((no: string) => Promise.resolve(makeStats(no))),
  getPublicPriceHistory: vi.fn().mockImplementation(() => Promise.resolve({ area_m2: null, months: [], two_year: null, basis: null })),
}));

vi.mock("@/lib/compare-export", () => ({
  exportCompareToXlsx: vi.fn().mockResolvedValue(undefined),
}));

function renderPage(params = "") {
  mockSearchParams.mockReturnValue(new URLSearchParams(params));
  return render(
    <TestQueryProvider>
      <ComparePage />
    </TestQueryProvider>,
  );
}

// 모든 시험의 시작 = 로그인 상태(비로그인 시험은 자기 안에서 토큰을 비운다)
beforeEach(() => {
  mockSession.sessionToken = "tok";
  mockSession.tokenReady = true;
});

describe("단지 비교 — 에러 분기", () => {
  beforeEach(() => {
    mockPush.mockClear();
    // 정상 케이스 복원
    vi.mocked(api.getComplex).mockImplementation((no: string) => Promise.resolve(makeComplex(no)));
    vi.mocked(api.getPriceStats).mockImplementation((no: string) => Promise.resolve(makeStats(no)));
  });

  it("4개 중 2개 fail 시 배너 + 헤더 count 가 표시된다", async () => {
    vi.mocked(api.getComplex).mockImplementation((no: string) =>
      no === "B" || no === "D"
        ? Promise.reject(new Error("backend down"))
        : Promise.resolve(makeComplex(no)),
    );
    renderPage("ids=A,B,C,D");
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("2개 단지 정보를 불러오지 못했습니다.");
    });
    expect(screen.getByText(/2개 단지.*\/ 선택 4개/)).toBeInTheDocument();
  });

  it("전체 fail 시 본문 대체 안내 + 재시도 버튼이 표시된다", async () => {
    vi.mocked(api.getComplex).mockImplementation(() =>
      Promise.reject(new Error("backend down")),
    );
    renderPage("ids=A,B");
    await waitFor(() => {
      expect(screen.getByText("비교 단지 정보를 불러오지 못했습니다.")).toBeInTheDocument();
    });
    expect(screen.getByText("다시 시도")).toBeInTheDocument();
  });

  it("statsQueries 1개 fail 시 평당가 셀에 '불러오기 실패' 가 표시된다", async () => {
    vi.mocked(api.getPriceStats).mockImplementation((no: string) =>
      no === "A"
        ? Promise.reject(new Error("stats fail"))
        : Promise.resolve(makeStats(no)),
    );
    renderPage("ids=A,B");
    await waitFor(() => {
      expect(screen.getByText("불러오기 실패")).toBeInTheDocument();
    });
  });

  it("전세가율은 BE 퍼센트값을 그대로 표시 (×100 이중적용 회귀 차단)", async () => {
    // 세션278 발견: BE jeonse_rate=67.7(퍼센트)인데 compare 가 ×100 → 6770% 오표시.
    // 세션 489 범위화 뒤: makeComplex jeonse_rate_min/max 64.2·67.7 → "64.2%~67.7%" 그대로, "6770%" 절대 금지.
    renderPage("ids=A,B");
    await waitFor(() => {
      expect(screen.getAllByText("64.2%~67.7%").length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.queryByText("6770%")).toBeNull();
  });

  it("결과 헤더의 '다른 단지 검색' 버튼 클릭 시 /search 로 이동한다 (세션294)", async () => {
    const user = userEvent.setup();
    renderPage("ids=A,B");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "다른 단지 검색" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "다른 단지 검색" }));
    expect(mockPush).toHaveBeenCalledWith("/search");
  });

  it("평당가 행이 '건폐율' 바로 다음에 삽입된다 (findIndex 위치 가드 — 세션287)", async () => {
    // 매직넘버 splice(17) → findIndex('건폐율')+1 교체. BASE_ROWS 순서가 바뀌어도
    // 평당가가 건폐율 다음에 오는지 행 라벨 순서로 가드. (데스크톱 테이블 좌측 라벨 th)
    renderPage("ids=A,B");
    await waitFor(() => {
      expect(screen.getAllByText("64.2%~67.7%").length).toBeGreaterThanOrEqual(1);
    });
    // 데스크톱 테이블 행의 좌측 라벨(첫 셀) 텍스트를 순서대로 수집
    const labelCells = Array.from(
      document.querySelectorAll("table tbody tr th:first-child, table tbody tr td:first-child"),
    ).map((el) => el.textContent?.trim() ?? "");
    const bcrIdx = labelCells.indexOf("건폐율");
    expect(bcrIdx).toBeGreaterThanOrEqual(0);
    expect(labelCells[bcrIdx + 1]).toBe("평당가");
  });

  it("비교 표에 '최근 6개월 거래' 줄이 없고 매물수 줄은 남는다 (세션 429 — 시세 기록 줄 수를 거래로 보이던 것)", async () => {
    renderPage("ids=A,B");
    await waitFor(() => {
      expect(screen.getAllByText("64.2%~67.7%").length).toBeGreaterThanOrEqual(1);
    });
    const labelCells = Array.from(
      document.querySelectorAll("table tbody tr th:first-child, table tbody tr td:first-child"),
    ).map((el) => el.textContent?.trim() ?? "");
    expect(labelCells).toContain("매물수");
    expect(labelCells).not.toContain("최근 6개월 거래");
    expect(screen.queryByText("최근 6개월 거래")).toBeNull();
  });
});

describe("모바일 비교 화면 tablist (Radix Tabs, PR 5b)", () => {
  // PR 5b: raw <div role="tablist"> + <button role="tab"> → shadcn Tabs (Radix) 교체
  // F-mock 정정: renderPage("ids=A,B") 호출이 mockSearchParams 세팅 (기존 답습)
  // F7 정정: jsdom 은 md:hidden/hidden md:block CSS 무시 → desktop·mobile DOM 둘 다 존재
  //          → getByText("난방") 가 desktop 셀에 항상 매칭되어 모바일 탭 미전환도 PASS 위험
  //          → getAllByText.length 카운트 단언으로 차단

  it("초기 활성 탭 = 기본 (data-state=active), 다른 탭 inactive", async () => {
    // 검증 의도: Radix Tabs controlled mode 에서 value="basic" 이 정확히 활성, 가격/시설 inactive
    renderPage("ids=A,B");
    expect(await screen.findByRole("tab", { name: "기본" })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("tab", { name: "가격" })).toHaveAttribute("data-state", "inactive");
    expect(screen.getByRole("tab", { name: "시설" })).toHaveAttribute("data-state", "inactive");
  });

  it("탭 클릭 시 mobileRows 가 실제 변경 (시설 → 난방 등장 + 주소 사라짐)", async () => {
    // 검증 의도: ROW_CATEGORIES.facility 의 "난방" 등장 + ROW_CATEGORIES.basic 의 "주소" 사라짐 양방향 검증
    // F7: jsdom 은 CSS 무시 → desktop <td>"주소"·"난방" 항상 매칭 → 카운트로 모바일 영역 변경 검증
    // 초기(basic): desktop "난방" 1 + mobile dl "난방" 0 = 1건 / desktop "주소" 1 + mobile dl "주소" 1 = 2건
    // 시설 클릭 후: desktop "난방" 1 + mobile dl "난방" 1 (단지 1개) = 2건 / "주소" mobile dl 사라짐 = 1건
    const user = userEvent.setup();
    renderPage("ids=A,B");
    await user.click(await screen.findByRole("tab", { name: "시설" }));
    // F-it2 정정: 양방향 검증 (등장 + 사라짐 카운트로 silent failure 차단)
    await waitFor(() => {
      expect(screen.getAllByText("난방").length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getAllByText("주소").length).toBe(1);
  });

  it("키보드 ArrowRight 로 다음 탭 활성화 + 이전 탭 inactive (Radix roving focus)", async () => {
    // 검증 의도: Radix Tabs roving focus = ArrowRight 키 → 다음 TabsTrigger 활성 + 이전 deactive
    const user = userEvent.setup();
    renderPage("ids=A,B");
    const basicTab = await screen.findByRole("tab", { name: "기본" });
    basicTab.focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "가격" })).toHaveAttribute("data-state", "active");
    });
    expect(basicTab).toHaveAttribute("data-state", "inactive");
  });

  it("TabsList className 머지 (w-full + sticky 영역 폭 보존)", async () => {
    // 검증 의도: TabsList 기본 w-fit 을 w-full 로 override + sticky z-10 보존 (F6·F-it4 정정)
    // top-14 = 전역 Header(sticky top-0 z-50 h-14) 아래에 고정 — top-0 이면 헤더에 가려져
    // 핀 상태에서 보이지도 눌리지도 않음 (세션 295, AdminLivePanel top-20 선례)
    renderPage("ids=A,B");
    const tablist = await screen.findByRole("tablist", { name: "비교 항목 분류" });
    expect(tablist).toHaveClass("w-full", "sticky", "top-14", "z-10");
  });
});

describe("인쇄 silent failure 가드 (PR 5c)", () => {
  // PR 5c: 모바일 viewport (< 768px) 에서 인쇄 시 데스크톱 테이블 강제 표시.
  // 현재 = 모바일 카드의 활성 탭 행 (basic=10·price=5·facility=9) 만 인쇄됨 (24행 약속 깨짐).
  // 정정 = globals.css @media print 안에서 .print-show-md/.print-hide-md 룰로 데스크톱 테이블 표시 + 모바일 카드 숨김.
  // jsdom 은 @media print 평가 0 + getComputedStyle 무력 → className 부착만 단언.
  // 진짜 인쇄 시뮬 검증은 Playwright emulateMedia("print") 별도 PR (silent-failure F3 박제).

  it("데스크톱 테이블 wrapper 에 print-show-md 클래스 부착", async () => {
    // 검증 의도: @media print 룰 발화 시 모바일 viewport 에서도 데스크톱 테이블 24행 전체 출력 보장
    renderPage("ids=A,B");
    const table = await screen.findByRole("table");
    const wrapper = table.closest("div.hidden.md\\:block");
    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveClass("print-show-md");
  });

  it("모바일 카드 wrapper 에 print-hide-md 클래스 부착", async () => {
    // 검증 의도: @media print 룰 발화 시 모바일 카드 영역 숨김 → 데스크톱 테이블과 중복 출력 방지
    renderPage("ids=A,B");
    const tablist = await screen.findByRole("tablist", { name: "비교 항목 분류" });
    const wrapper = tablist.closest("div.md\\:hidden");
    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveClass("print-hide-md");
  });
});

// 세션 472 PR 3 — 단지 비교 중립화: 판정 ★·우위 범례·초록 강조·레이더 없이 값 + 출처 각주
describe("단지 비교 — 값과 출처만 (판정 표시 없음)", () => {
  beforeEach(() => {
    mockPush.mockClear();
    // 두 단지 값이 갈라져야 옛 ★ 가 한쪽에만 붙는다 — 같은 값이면 판정 유무를 구분하지 못한다
    vi.mocked(api.getComplex).mockImplementation((no: string) =>
      Promise.resolve(
        no === "A"
          ? { ...makeComplex(no), total_household_count: 1500, high_floor: 45, floor_area_ratio: "180" }
          : makeComplex(no),
      ),
    );
    vi.mocked(api.getPriceStats).mockImplementation((no: string) => Promise.resolve(makeStats(no)));
  });

  it("표·카드·범례 어디에도 판정 ★·우위 글자·초록 강조가 없다", async () => {
    const { container } = renderPage("ids=A,B");
    await screen.findByRole("table");
    expect(screen.getAllByText("1,500").length).toBeGreaterThan(0);
    const cells = Array.from(container.querySelectorAll("td, dd"));
    for (const cell of cells) expect(cell.textContent).not.toContain("★");
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/우위|종합|레이더|가중치/);
    expect(container.querySelector(".bg-green-50")).toBeNull();
  });

  it("맨 아래에 자료 출처 각주가 있다", async () => {
    renderPage("ids=A,B");
    const footer = await screen.findByTestId("compare-sources-footer");
    expect(footer).toHaveTextContent("출처:");
    expect(footer).toHaveTextContent("네이버부동산 매물 호가 집계");
    expect(footer).toHaveTextContent("국토교통부 실거래가");
  });

  it("전세가율 행 = '이 단지' + 바로 아래 '시군구 전세가율(부동산원)' · 각주 (세션 473)", async () => {
    vi.mocked(api.getComplex).mockImplementation((no: string) =>
      Promise.resolve({ ...makeComplex(no), region_jeonse_ratio: no === "A" ? 79.4 : null, region_jeonse_period: "2026.01" }),
    );
    renderPage("ids=A,B");
    await waitFor(() => {
      expect(screen.getAllByText("시군구 전세가율(부동산원)").length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText("전세가율(이 단지, 같은 면적)").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("전세가율")).toBeNull();          // 옛 행 이름 없음
    expect(screen.getAllByText("79.4% (2026.01)").length).toBeGreaterThanOrEqual(1);   // 기준 달은 값 옆 괄호(F10)
    const note = screen.getByTestId("compare-region-footnote");
    expect(note).toHaveTextContent("한국부동산원 전국주택가격동향조사, 아파트 중위 매매가격 대비 전세가격");
  });
});

// 세션 493 — 사장님 11-02 "이름표 붙이기": 위쪽 표 면적은 공급면적(네이버 단지 정보 min/max_supply_area_m2)
describe("단지 비교 — 면적 행 이름 = 공급면적 (세션 493)", () => {
  beforeEach(() => {
    vi.mocked(api.getComplex).mockImplementation((no: string) =>
      Promise.resolve({ ...makeComplex(no), min_supply_area_m2: 113, max_supply_area_m2: 145 }),
    );
    vi.mocked(api.getPriceStats).mockImplementation((no: string) => Promise.resolve(makeStats(no)));
  });

  it("데스크톱 표·휴대폰 기본 탭 행 이름 = '최소/최대 공급면적' · 값 글자는 그대로", async () => {
    const { container } = renderPage("ids=A,B");
    await screen.findByTestId("compare-sources-footer");
    const row = Array.from(container.querySelectorAll("tbody tr")).find((tr) => tr.querySelector("td")?.textContent === "최소 공급면적");
    expect(row).toBeDefined();
    expect(row!.querySelectorAll("td")[1].textContent).toBe("113m² (34평)");
    expect(screen.queryByText("최소 면적")).toBeNull();
    expect(screen.queryByText("최대 면적")).toBeNull();
    // 데스크톱 1 + 휴대폰 기본 탭(단지 2개) 2 — 탭 분류 목록 이름이 어긋나면 휴대폰 쪽이 빠진다
    expect(screen.getAllByText("최소 공급면적")).toHaveLength(3);
    expect(screen.getAllByText("최대 공급면적")).toHaveLength(3);
  });

  it("엑셀 내보내기 행 이름도 '최소/최대 공급면적'", async () => {
    const { exportCompareToXlsx } = await import("@/lib/compare-export");
    renderPage("ids=A,B");
    await screen.findByTestId("compare-sources-footer");
    await userEvent.click(screen.getByRole("button", { name: "엑셀" }));
    await waitFor(() => expect(exportCompareToXlsx).toHaveBeenCalled());
    const rows = vi.mocked(exportCompareToXlsx).mock.calls.at(-1)![1] as { label: string }[];
    const labels = rows.map((r) => r.label);
    expect(labels).toContain("최소 공급면적");
    expect(labels).toContain("최대 공급면적");
    expect(labels).not.toContain("최소 면적");
  });
});

describe("단지 비교 — 대표 면적 시세 두 줄 (세션 474 B27)", () => {
  beforeEach(() => {
    vi.mocked(api.getPriceStats).mockImplementation((no: string) => Promise.resolve(makeStats(no)));
  });

  const trade = (price: number, date: string, floor: number) => ({ price, date, floor, direct: false });

  it("E — 대표 면적 최저~최고 + (N건) N = 거래 목록 길이 · 전세가율 범위 · 중위 글자 없음 (세션 489 B29)", async () => {
    vi.mocked(api.getComplex).mockImplementation((no: string) =>
      Promise.resolve(
        no === "A"
          ? { ...makeComplex(no), rep_area_m2: 59, nearby_median_price: 17200, recent_trades_6m: 9, jeonse_rate: 61,
              jeonse_rate_min: 72, jeonse_rate_max: 80,
              area_prices: [{ area_m2: 59, price_median: 17200, trade_count: 3, price_min: 15700, price_max: 18000,
                trades: [trade(15700, "2026-06-26", 4), trade(17200, "2026-06-05", 8), trade(18000, "2026-05-05", 7)] }] }
          : { ...makeComplex(no), rep_area_m2: 84, nearby_median_price: 51000, recent_trades_6m: 12, jeonse_rate: 61,
              jeonse_rate_min: null, jeonse_rate_max: null,
              area_prices: [{ area_m2: 84, price_median: 51000, trade_count: 2, price_min: 51000, price_max: 51000,
                trades: [trade(51000, "2026-07-01", 3), trade(51000, "2026-06-01", 9)] }] },
      ),
    );
    const { container } = renderPage("ids=A,B");
    await waitFor(() => {
      expect(screen.getAllByText("59㎡ 1억 5,700만 ~ 1억 8,000만 (3건)").length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText("84㎡ 5억 1,000만 (2건)").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("72%~80%").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("1억 7,200만")).toBeNull();
    expect(screen.queryByText(/\(9건\)|\(12건\)/)).toBeNull(); // 잡 값 recent_trades_6m 은 안 쓴다
    expect(screen.queryByText("61%")).toBeNull();
    expect(screen.queryByText("주변 중위가")).toBeNull();
    // I — 표 칸 글자에 중위·중앙값 0건(부동산원 지역 통계 각주는 예외라 표 칸만 본다)
    for (const cell of Array.from(container.querySelectorAll("td, dd"))) expect(cell.textContent).not.toMatch(/중위|중앙값/);
  });

  it("E — 직거래만 있는 단지(범위 null · 거래 목록 있음)는 '59㎡ — (직거래만 2건)'", async () => {
    vi.mocked(api.getComplex).mockImplementation((no: string) =>
      Promise.resolve({ ...makeComplex(no), rep_area_m2: 59,
        area_prices: [{ area_m2: 59, price_median: 16000, trade_count: 2, price_min: null, price_max: null,
          trades: [{ ...trade(16000, "2026-06-10", 3), direct: true }, { ...trade(15000, "2026-05-02", 6), direct: true }] }] }),
    );
    renderPage("ids=A,B");
    await waitFor(() => {
      expect(screen.getAllByText("59㎡ — (직거래만 2건)").length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.queryByText(/1억 6,000만/)).toBeNull();
  });

  it("E·A' — 옛 값 단지: legacy_range 범위 + 작은 줄(직거래 포함) · 전세가율 '-'", async () => {
    vi.mocked(api.getComplex).mockImplementation((no: string) =>
      Promise.resolve({ ...makeComplex(no), nearby_median_price: 15000, jeonse_rate: 53.6, price_basis: "legacy_mixed" as const,
        jeonse_rate_min: null, jeonse_rate_max: null, legacy_range: { lower: 12000, upper: 18000, month: "202503" } }),
    );
    renderPage("ids=A,B");
    await waitFor(() => {
      expect(screen.getAllByText("1억 2,000만 ~ 1억 8,000만 (2025년 3월 거래 · 면적 섞임 · 직거래 포함 · 그 뒤 거래 없음)").length)
        .toBeGreaterThanOrEqual(1);
    });
    expect(screen.queryByText(/53\.6|54%|옛 값\)/)).toBeNull();
    expect(screen.queryByText("1억 5,000만")).toBeNull();
  });

  it("H — 비로그인(전세가율 칸 없음)이면 '이 단지' 전세가율 행을 그리지 않고 시군구 행만 · 값 null 이면 '-'", async () => {
    vi.mocked(api.getComplex).mockImplementation((no: string) => {
      // 비로그인 응답 = 네이버 재료 칸이 아예 없다(BE public_fields.strip_naver_fields)
      const c: Partial<ReturnType<typeof makeComplex>> = { ...makeComplex(no) };
      delete c.jeonse_rate;
      delete c.jeonse_rate_min;
      delete c.jeonse_rate_max;
      return Promise.resolve({ ...c, complex_no: no, complex_name: `단지${no}`, region_jeonse_ratio: 79.4, region_jeonse_period: "2026.01" });
    });
    renderPage("ids=A,B");
    await waitFor(() => {
      expect(screen.getAllByText("시군구 전세가율(부동산원)").length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.queryByText("전세가율(이 단지, 같은 면적)")).toBeNull();
    expect(document.body.textContent).not.toMatch(/불러오지|못 불러/);
  });

  it("H — 로그인 응답인데 값이 null 이면 행은 있고 칸은 '-'", async () => {
    vi.mocked(api.getComplex).mockImplementation((no: string) =>
      Promise.resolve({ ...makeComplex(no), jeonse_rate_min: null, jeonse_rate_max: null }),
    );
    const { container } = renderPage("ids=A,B");
    await waitFor(() => {
      expect(screen.getAllByText("전세가율(이 단지, 같은 면적)").length).toBeGreaterThanOrEqual(1);
    });
    const row = Array.from(container.querySelectorAll("tr")).find((tr) => tr.querySelector("th, td")?.textContent === "전세가율(이 단지, 같은 면적)");
    expect(row).toBeDefined();
    expect(Array.from(row!.querySelectorAll("td")).slice(-2).map((td) => td.textContent)).toEqual(["-", "-"]);
  });

  it("G — 출처 각주는 '정부 실거래 최저~최고(중개거래 기준)' · 중위 아님(부동산원 각주는 그대로)", async () => {
    renderPage("ids=A,B");
    const footer = await screen.findByTestId("compare-sources-footer");
    expect(footer).toHaveTextContent("전세가율 = 네이버부동산 전세 시세 ÷ 정부 실거래 최저~최고(중개거래 기준)");
    expect(footer.textContent).not.toMatch(/중위|중앙값/);
  });
});

// 세션 490 — 비로그인 손님: 네이버 자료 행·차트·상세 상자를 그리지 않고 로그인 전용 가격 통계도 부르지 않는다
describe("단지 비교 — 비로그인이면 네이버 자료 행·상자 숨김 (세션 490)", () => {
  const NAVER_LABELS = ["난방", "난방 연료", "시공사", "평당가", "매물수", "수영장", "관리사무소"];

  beforeEach(() => {
    vi.mocked(api.getComplex).mockImplementation((no: string) => Promise.resolve(makeComplex(no)));
    vi.mocked(api.getPriceStats).mockClear();
    vi.mocked(api.getPriceStats).mockImplementation((no: string) => Promise.resolve(makeStats(no)));
  });

  function rowLabels(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll("tbody tr")).map((tr) => tr.querySelector("td")?.textContent ?? "");
  }

  it("비로그인: 네이버 행 7개·차트 묶음이 없고 가격 통계를 부르지 않으며 출처에 네이버가 없다", async () => {
    mockSession.sessionToken = undefined;
    const { container } = renderPage("ids=A,B");
    await screen.findByTestId("compare-sources-footer");
    const labels = rowLabels(container);
    expect(labels).toContain("주소");
    expect(labels).toContain("건폐율");
    expect(labels).toContain("대표 면적 시세");
    for (const l of NAVER_LABELS) expect(labels).not.toContain(l);
    // 휴대폰 탭(시설)에도 네이버 행이 없다 — 데스크톱 표엔 이미 없으니 화면 전체에서 0
    await userEvent.click(screen.getByRole("tab", { name: "시설" }));
    expect(screen.queryByText("난방")).toBeNull();
    expect(screen.queryByText("관리사무소")).toBeNull();
    expect(screen.queryByTestId("compare-charts")).toBeNull();
    expect(api.getPriceStats).not.toHaveBeenCalled();
    const footer = screen.getByTestId("compare-sources-footer");
    expect(footer.textContent).not.toMatch(/네이버/);
    // 이 시험 단지들은 고를 면적이 없어 실거래가 추이 카드가 없다 → '실거래가 추이' 낱말이 빠진 출처(세션 491)
    expect(footer.textContent).toBe(
      "출처: 단지 기본 정보(세대수·동수·층·주차·용적률·건폐율) = 건축물대장 기준 · 대표 면적 시세 = 국토교통부 실거래가(공공데이터포털)",
    );
    expect(screen.getByTestId("compare-region-footnote")).toHaveTextContent("시군구 전세가율");
  });

  it("로그인: 네이버 행 7개·차트 묶음이 있고 가격 통계를 부르며 출처는 기존 글자", async () => {
    const { container } = renderPage("ids=A,B");
    await screen.findByTestId("compare-sources-footer");
    await waitFor(() => expect(api.getPriceStats).toHaveBeenCalledTimes(2));
    const labels = rowLabels(container);
    for (const l of NAVER_LABELS) expect(labels).toContain(l);
    expect(screen.getByTestId("compare-charts")).toBeInTheDocument();
    expect(screen.getByTestId("compare-sources-footer")).toHaveTextContent("네이버부동산 매물 호가 집계");
  });

  // 로그인 확인 전 = 단지 응답이 와도 표·차트·출처를 그리지 않고 로딩 모양만(세션 493 — 네이버 칸 깜빡임 차단)
  async function renderBeforeTokenReady() {
    mockSession.sessionToken = undefined;
    mockSession.tokenReady = false;
    const view = renderPage("ids=A,B");
    await waitFor(() => expect(api.getComplex).toHaveBeenCalledTimes(2));
    // 단지 응답이 화면에 반영될 시간을 준다 — 옛 코드는 이 사이에 표(네이버 행 포함)를 그렸다
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    return view;
  }

  it("로그인 확인 전(tokenReady false): 네이버 칸 0개 · 차트 없음 · 로딩 모양 · 가격 통계를 쏘지 않는다", async () => {
    vi.mocked(api.getComplex).mockClear();
    const { container } = await renderBeforeTokenReady();
    const labels = rowLabels(container);
    for (const l of NAVER_LABELS) expect(labels).not.toContain(l);
    expect(screen.queryByText("난방")).toBeNull();
    expect(screen.queryByTestId("compare-charts")).toBeNull();
    expect(screen.queryByTestId("compare-sources-footer")).toBeNull();
    expect(screen.getByRole("status", { name: "로딩 중" })).toBeInTheDocument();
    expect(api.getPriceStats).not.toHaveBeenCalled();
  });

  it("확인 전 → 비로그인 확정: 네이버 칸 없이 공개 화면만 나온다", async () => {
    vi.mocked(api.getComplex).mockClear();
    const { container, rerender } = await renderBeforeTokenReady();
    mockSession.tokenReady = true;
    rerender(<TestQueryProvider><ComparePage /></TestQueryProvider>);
    await screen.findByTestId("compare-sources-footer");
    const labels = rowLabels(container);
    expect(labels).toContain("주소");
    for (const l of NAVER_LABELS) expect(labels).not.toContain(l);
    expect(screen.queryByTestId("compare-charts")).toBeNull();
  });

  it("확인 전 → 로그인 확정: 네이버 행·차트가 나오고 가격 통계를 부른다", async () => {
    vi.mocked(api.getComplex).mockClear();
    const { container, rerender } = await renderBeforeTokenReady();
    mockSession.sessionToken = "tok";
    mockSession.tokenReady = true;
    rerender(<TestQueryProvider><ComparePage /></TestQueryProvider>);
    await screen.findByTestId("compare-sources-footer");
    await waitFor(() => expect(api.getPriceStats).toHaveBeenCalledTimes(2));
    const labels = rowLabels(container);
    for (const l of NAVER_LABELS) expect(labels).toContain(l);
    expect(screen.getByTestId("compare-charts")).toBeInTheDocument();
  });
});

// 세션 491 — 비로그인 비교표: 실거래가 추이(단지마다 작은 그래프 · 같은 세로 눈금 · 기록 없는 단지는 칸 없음 · 실패는 다시 시도)
describe("단지 비교 — 비로그인 실거래가 추이 (세션 491)", () => {
  // 띠 그래프 창(오늘 달까지 24개월) 안에 드는 달 — 시험 날짜와 무관하게
  const recent = monthsEndingAt(currentYm(), 24).slice(-3);
  function history(area: number, lo: number, hi: number) {
    return {
      area_m2: area,
      months: [
        { month: recent[0], trade_count: 2, price_min: lo, price_max: hi, price_median: null },
        { month: recent[2], trade_count: 1, price_min: hi, price_max: hi, price_median: null },
      ],
      two_year: { min: lo, max: hi, count: 3 },
      basis: null,
    };
  }
  const NO_RECORD = { area_m2: null, months: [], two_year: null, basis: null };
  const SHORT_FOOTER =
    "출처: 단지 기본 정보(세대수·동수·층·주차·용적률·건폐율) = 건축물대장 기준 · 대표 면적 시세 = 국토교통부 실거래가(공공데이터포털)";
  // 대표 면적이 있는 단지(면적 고르기 = 단지 화면 defaultArea)
  const REP: Record<string, number> = { A: 84, B: 59, C: 84 };
  const withRep = (no: string) => ({ ...makeComplex(no), rep_area_m2: REP[no] ?? 84 });

  beforeEach(() => {
    vi.mocked(api.getComplex).mockImplementation((no: string) => Promise.resolve(withRep(no)));
    vi.mocked(api.getPublicPriceHistory).mockClear();
    vi.mocked(api.getPublicPriceHistory).mockImplementation((no: string) => {
      if (no === "A") return Promise.resolve(history(84, 79000, 86000));
      if (no === "B") return Promise.resolve(history(59, 75000, 84000));
      return Promise.resolve(NO_RECORD);
    });
  });

  it("비로그인: 기록 있는 단지마다 칸 1개 · 제목 = 이름+면적 · 모든 칸 같은 눈금 · 기록 없는 단지는 칸 없음", async () => {
    mockSession.sessionToken = undefined;
    renderPage("ids=A,B,C");
    const card = await screen.findByTestId("compare-public-trend");
    expect(within(card).getByRole("heading", { level: 2 }).textContent).toBe("실거래가 추이 · 대표 면적 · 최근 2년");
    await waitFor(() => expect(within(card).getAllByTestId("compare-public-trend-cell")).toHaveLength(2));
    const cells = within(card).getAllByTestId("compare-public-trend-cell");
    await waitFor(() => expect(within(cells[0]).getByTestId("consumer-bands")).toBeInTheDocument());
    expect(within(cells[0]).getByRole("heading", { level: 3 }).textContent).toBe("단지A 전용 84㎡");
    expect(within(cells[1]).getByRole("heading", { level: 3 }).textContent).toBe("단지B 전용 59㎡");
    // 같은 눈금: A(7.9~8.6억)·B(7.5~8.4억) 두 칸 모두 7억5000만~8억6000만 (C 는 기록 없음 → 눈금에서도 빠짐)
    for (const cell of cells) {
      const bands = within(cell).getByTestId("consumer-bands");
      expect(bands.textContent).toContain("8억6,000만");
      expect(bands.textContent).toContain("7억5,000만");
    }
    expect(within(cells[0]).getByTestId("consumer-bands").textContent).not.toContain("7억9,000만");
    expect(card).not.toHaveTextContent("단지C");
    expect(screen.queryByText("최근 2년 실거래 없음")).toBeNull();
    // 공개 창구 — 단지 번호 + 단지 화면과 같은 면적(토큰 인자 없음)
    expect(vi.mocked(api.getPublicPriceHistory).mock.calls).toEqual([["A", 84], ["B", 59], ["C", 84]]);
    expect(screen.getByTestId("compare-sources-footer")).toHaveTextContent("실거래가 추이");
  });

  it("전부 기록 없음: 카드 없음 · 출처는 짧은 글자", async () => {
    mockSession.sessionToken = undefined;
    vi.mocked(api.getPublicPriceHistory).mockImplementation(() => Promise.resolve(NO_RECORD));
    renderPage("ids=A,B");
    await waitFor(() => expect(api.getPublicPriceHistory).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId("compare-sources-footer").textContent).toBe(SHORT_FOOTER));
    expect(screen.queryByTestId("compare-public-trend")).toBeNull();
  });

  it("대표 면적이 없어도 범위 있는 면적으로 부른다(단지 화면 defaultArea) · 고를 면적이 없으면 호출 0", async () => {
    mockSession.sessionToken = undefined;
    vi.mocked(api.getComplex).mockImplementation((no: string) =>
      Promise.resolve(
        no === "A"
          ? {
              ...makeComplex(no),
              rep_area_m2: null,
              area_prices: [
                { area_m2: 49, price_median: null, trade_count: 0, price_min: null, price_max: null },
                { area_m2: 59, price_median: null, trade_count: 3, price_min: 75000, price_max: 84000 },
              ],
            }
          : { ...makeComplex(no), rep_area_m2: null, area_prices: [] },
      ),
    );
    vi.mocked(api.getPublicPriceHistory).mockImplementation(() => Promise.resolve(history(59, 75000, 84000)));
    renderPage("ids=A,B");
    const card = await screen.findByTestId("compare-public-trend");
    await waitFor(() => expect(within(card).getByTestId("consumer-bands")).toBeInTheDocument());
    expect(vi.mocked(api.getPublicPriceHistory).mock.calls).toEqual([["A", 59]]);
    expect(within(card).getAllByTestId("compare-public-trend-cell")).toHaveLength(1);
  });

  it("아파트+오피스텔 섞임: 오피스텔 칸은 안 그리고 공개 창구도 안 부른다", async () => {
    mockSession.sessionToken = undefined;
    vi.mocked(api.getComplex).mockImplementation((no: string) =>
      Promise.resolve(no === "B" ? { ...withRep(no), real_estate_type_code: "OPST" } : withRep(no)),
    );
    renderPage("ids=A,B");
    const card = await screen.findByTestId("compare-public-trend");
    const cells = within(card).getAllByTestId("compare-public-trend-cell");
    expect(cells).toHaveLength(1);
    await waitFor(() => expect(within(cells[0]).getByTestId("consumer-bands")).toBeInTheDocument());
    expect(within(cells[0]).getByRole("heading", { level: 3 }).textContent).toBe("단지A 전용 84㎡");
    // 눈금 = A 만(오피스텔 B 는 범위 계산에서도 빠짐)
    expect(within(cells[0]).getByTestId("consumer-bands").textContent).toContain("7억9,000만");
    expect(vi.mocked(api.getPublicPriceHistory).mock.calls.map((c) => c[0])).toEqual(["A"]);
    expect(screen.getByTestId("compare-sources-footer")).toHaveTextContent("실거래가 추이");
  });

  it("전부 오피스텔: 카드 없음 · 호출 0 · 출처 줄에서 '실거래가 추이' 낱말만 빠진다", async () => {
    mockSession.sessionToken = undefined;
    vi.mocked(api.getComplex).mockImplementation((no: string) =>
      Promise.resolve({ ...withRep(no), real_estate_type_name: "오피스텔" }),
    );
    renderPage("ids=A,B");
    const footer = await screen.findByTestId("compare-sources-footer");
    expect(screen.queryByTestId("compare-public-trend")).toBeNull();
    expect(api.getPublicPriceHistory).not.toHaveBeenCalled();
    expect(footer.textContent).toBe(SHORT_FOOTER);
  });

  it("한 단지 응답이 늦으면 먼저 온 칸도 회색 자리 — 다 받은 뒤 모든 칸을 같은 눈금으로", async () => {
    mockSession.sessionToken = undefined;
    let releaseB: (v: ReturnType<typeof history>) => void = () => {};
    vi.mocked(api.getPublicPriceHistory).mockImplementation((no: string) =>
      no === "A"
        ? Promise.resolve(history(84, 79000, 86000))
        : new Promise((resolve) => { releaseB = resolve; }),
    );
    renderPage("ids=A,B");
    const card = await screen.findByTestId("compare-public-trend");
    const cells = within(card).getAllByTestId("compare-public-trend-cell");
    // A 응답은 이미 왔다(제목에 면적) — 그래도 B 를 기다리는 동안 띠를 그리지 않는다
    await waitFor(() => expect(within(cells[0]).getByRole("heading", { level: 3 }).textContent).toBe("단지A 전용 84㎡"));
    for (const cell of cells) {
      expect(within(cell).queryByTestId("consumer-bands")).toBeNull();
      expect(cell.querySelector(".animate-pulse")).not.toBeNull();
    }
    releaseB(history(59, 75000, 84000));
    await waitFor(() => expect(within(cells[1]).getByTestId("consumer-bands")).toBeInTheDocument());
    for (const cell of cells) {
      const bands = within(cell).getByTestId("consumer-bands");
      expect(bands.textContent).toContain("8억6,000만");
      expect(bands.textContent).toContain("7억5,000만");
    }
  });

  it("로그인: 새 카드 없음 · 공개 창구 호출 0", async () => {
    renderPage("ids=A,B");
    await screen.findByTestId("compare-sources-footer");
    await waitFor(() => expect(api.getPriceStats).toHaveBeenCalled());
    expect(screen.queryByTestId("compare-public-trend")).toBeNull();
    expect(api.getPublicPriceHistory).not.toHaveBeenCalled();
  });

  it("실패한 단지 칸은 남아 '다시 시도'(기록 없음으로 숨기지 않음) · 누르면 다시 부른다", async () => {
    mockSession.sessionToken = undefined;
    vi.mocked(api.getPublicPriceHistory).mockImplementation((no: string) =>
      no === "A" ? Promise.reject(new Error("서버 오류")) : Promise.resolve(history(59, 75000, 84000)),
    );
    renderPage("ids=A,B");
    const card = await screen.findByTestId("compare-public-trend");
    const cells = within(card).getAllByTestId("compare-public-trend-cell");
    const retry = await within(cells[0]).findByRole("button", { name: "다시 시도" });
    expect(within(cells[0]).getByRole("heading", { level: 3 }).textContent).toBe("단지A");
    expect(within(cells[1]).getByTestId("consumer-bands")).toBeInTheDocument();
    const before = vi.mocked(api.getPublicPriceHistory).mock.calls.filter((c) => c[0] === "A").length;
    await userEvent.click(retry);
    await waitFor(() =>
      expect(vi.mocked(api.getPublicPriceHistory).mock.calls.filter((c) => c[0] === "A").length).toBe(before + 1),
    );
  });
});
