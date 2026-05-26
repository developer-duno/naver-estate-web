/**
 * 미분양 메인 페이지 통합 테스트 — 탭 전환, API 호출, 로딩/에러/빈 상태
 * 실행: npx vitest run src/app/__tests__/mibunyang.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MibunyangPage from "../mibunyang/page";
import { TestQueryProvider } from "@/test-setup";

const { mockRouter, mockSearchParams } = vi.hoisted(() => ({
  mockRouter: { replace: vi.fn(), push: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
  mockSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
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
  beforeEach(() => { mockRouter.replace.mockClear(); mockRouter.push.mockClear(); });

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
  beforeEach(() => { mockRouter.replace.mockClear(); mockRouter.push.mockClear(); });

  it("지역 선택 후 탭이 표시된다 (5개)", async () => {
    renderPage("region=서울특별시&tab=apartments&page=1");
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /미분양 단지/ })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /미분양만/ })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /지역 통계/ })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /실거래/ })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /즐겨찾기/ })).toBeInTheDocument();
    });
  });

  it("아파트 탭에서 데이터가 표시된다", async () => {
    renderPage("region=서울특별시&tab=apartments&page=1");
    // 카드뷰 + 테이블 양쪽 DOM 렌더 (hidden md:block / md:hidden)
    await waitFor(() => {
      expect(screen.getAllByText("테스트단지").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("미분양만 탭으로 전환 시 URL이 업데이트된다", async () => {
    const user = userEvent.setup();
    renderPage("region=서울특별시&tab=apartments&page=1");
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "미분양만" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("tab", { name: "미분양만" }));
    expect(mockRouter.replace).toHaveBeenCalled();
  });

  it("실거래 탭에서 거래 데이터가 표시된다", async () => {
    renderPage("region=서울특별시&tab=trades&page=1");
    // 카드뷰 + 테이블 양쪽 DOM 렌더 (hidden md:block / md:hidden)
    await waitFor(() => {
      expect(screen.getAllByText("테스트아파트").length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe("미분양 메인 — Radix Tabs 키보드 내비", () => {
  beforeEach(() => { mockRouter.replace.mockClear(); mockRouter.push.mockClear(); });

  it("ArrowRight 키로 다음 탭으로 포커스가 이동한다 (Radix Tabs roving focus)", async () => {
    const user = userEvent.setup();
    renderPage("region=서울특별시&tab=apartments&page=1");
    const firstTab = screen.getByRole("tab", { name: /미분양 단지/ });
    firstTab.focus();
    expect(firstTab).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    // Radix Tabs 의 자동 활성화 = ArrowRight 시 다음 탭 (미분양만) 포커스 + onValueChange 트리거 → URL 갱신
    expect(mockRouter.replace).toHaveBeenCalled();
  });
});

describe("미분양 메인 — 즐겨찾기 탭", () => {
  beforeEach(() => { mockRouter.replace.mockClear(); mockRouter.push.mockClear(); });

  it("지역 미선택 시에도 탭바가 표시된다", () => {
    renderPage();
    expect(screen.getByRole("tab", { name: /즐겨찾기/ })).toBeInTheDocument();
  });

  it("즐겨찾기 탭에서 빈 상태 안내가 표시된다", () => {
    renderPage("tab=favorites");
    expect(screen.getByText("즐겨찾기한 단지가 없습니다")).toBeInTheDocument();
  });

  it("지역 미선택 + 즐겨찾기 탭이면 '지역을 선택해주세요'가 표시되지 않는다", () => {
    renderPage("tab=favorites");
    expect(screen.queryByText("지역을 선택해주세요")).not.toBeInTheDocument();
  });
});

describe("미분양 메인 — 즐겨찾기 일괄 비교", () => {
  const favs = [
    { id: "F1", name: "단지A", region: "서울", added_at: 1000 },
    { id: "F2", name: "단지B", region: "경기", added_at: 2000 },
    { id: "F3", name: "단지C", region: "인천", added_at: 3000 },
    { id: "F4", name: "단지D", region: "부산", added_at: 4000 },
    { id: "F5", name: "단지E", region: "대구", added_at: 5000 },
  ];

  beforeEach(() => {
    mockRouter.replace.mockClear();
    mockRouter.push.mockClear();
    localStorage.setItem("mb_favorites", JSON.stringify(favs));
  });

  afterEach(() => { localStorage.removeItem("mb_favorites"); });

  it("즐겨찾기 목록에 체크박스가 표시된다", () => {
    renderPage("tab=favorites");
    // 전체 선택 + 개별 5개 = 6개 체크박스
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBe(6);
  });

  it("선택 비교 버튼이 비활성화 상태로 표시된다 (0개 선택)", () => {
    renderPage("tab=favorites");
    const btn = screen.getByRole("button", { name: "선택 비교" });
    expect(btn).toBeDisabled();
  });

  it("체크박스 2개 선택 시 선택 비교 버튼이 활성화된다", () => {
    renderPage("tab=favorites");
    const checkboxes = screen.getAllByRole("checkbox");
    // checkboxes[0] = 전체 선택, [1]~[5] = 개별 (added_at 내림차순 정렬)
    fireEvent.click(checkboxes[1]);
    fireEvent.click(checkboxes[2]);
    expect(screen.getByRole("button", { name: "선택 비교" })).not.toBeDisabled();
    expect(screen.getByText("2/4개 선택")).toBeInTheDocument();
  });

  it("최대 4개까지만 선택 가능하다", () => {
    renderPage("tab=favorites");
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]);
    fireEvent.click(checkboxes[2]);
    fireEvent.click(checkboxes[3]);
    fireEvent.click(checkboxes[4]);
    // 5번째 체크박스는 disabled
    expect(checkboxes[5]).toBeDisabled();
    expect(screen.getByText("4/4개 선택")).toBeInTheDocument();
  });

  it("전체 선택 시 최대 4개까지 선택된다", () => {
    renderPage("tab=favorites");
    const allCheckbox = screen.getByLabelText("전체 선택");
    fireEvent.click(allCheckbox);
    expect(screen.getByText("4/4개 선택")).toBeInTheDocument();
  });

  it("선택 비교 클릭 시 compare 페이지로 이동한다", async () => {
    renderPage("tab=favorites");
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]); // 정렬 후 첫 번째 (added_at 내림차순: F5)
    fireEvent.click(checkboxes[2]); // 정렬 후 두 번째 (F4)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "선택 비교" })).not.toBeDisabled();
    });
    mockRouter.push.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "선택 비교" }));
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    const url = mockRouter.push.mock.calls[0][0] as string;
    expect(url).toContain("/mibunyang/compare?ids=");
    expect(url).toContain("F5");
    expect(url).toContain("F4");
  });
});

describe("미분양 메인 — 즐겨찾기 정렬", () => {
  // 정렬 테스트 전용 데이터 (기존 beforeEach와 분리)
  const sortFavs = [
    { id: "S1", name: "다단지", region: "인천", added_at: 3000 },
    { id: "S2", name: "가단지", region: "서울", added_at: 1000 },
    { id: "S3", name: "나단지", region: "경기", added_at: 2000 },
  ];

  beforeEach(() => {
    mockRouter.push.mockClear();
    localStorage.setItem("mb_favorites", JSON.stringify(sortFavs));
  });

  afterEach(() => { localStorage.removeItem("mb_favorites"); });

  // 단지명순 선택 시 가나다순으로 정렬된다
  it("단지명순 선택 시 가나다순 정렬", () => {
    renderPage("tab=favorites");
    const select = screen.getByLabelText("정렬 기준");
    fireEvent.change(select, { target: { value: "name" } });

    const rows = screen.getAllByRole("row");
    // rows[0] = thead, rows[1~3] = tbody
    expect(rows[1].textContent).toContain("가단지");
    expect(rows[2].textContent).toContain("나단지");
    expect(rows[3].textContent).toContain("다단지");
  });

  // region 없는 항목도 지역순 정렬 에러 없이 동작한다
  it("region 없는 항목도 지역순 정렬 에러 없음", () => {
    const mixedFavs = [
      { id: "M1", name: "단지X", added_at: 1000 },
      { id: "M2", name: "단지Y", region: "서울", added_at: 2000 },
      { id: "M3", name: "단지Z", region: "경기", added_at: 3000 },
    ];
    localStorage.setItem("mb_favorites", JSON.stringify(mixedFavs));
    renderPage("tab=favorites");

    const select = screen.getByLabelText("정렬 기준");
    fireEvent.change(select, { target: { value: "region" } });

    // 에러 없이 렌더링되고 3개 행이 표시된다
    const rows = screen.getAllByRole("row");
    expect(rows.length).toBe(4); // thead 1 + tbody 3
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
