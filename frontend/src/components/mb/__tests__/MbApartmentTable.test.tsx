/**
 * MbApartmentTable 테스트 — 평당가 + 할인율 2 컬럼 추가 (단계 5)
 * 실행: npx vitest run src/components/mb/__tests__/MbApartmentTable.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { MbApartment } from "@/types";

// next/navigation mock — 컴포넌트가 useSearchParams 로 q 를 직접 읽음 (세션 299 A3)
const mockReplace = vi.fn();
const mockSearchParams = vi.fn(() => new URLSearchParams());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace }),
  usePathname: () => "/mibunyang",
  useSearchParams: () => mockSearchParams(),
}));

import MbApartmentTable from "../MbApartmentTable";

function makeApt(overrides: Partial<MbApartment> & { id: string; name: string }): MbApartment {
  return {
    region: "서울",
    gu: "강남",
    units: 300,
    unsold: 50,
    unsold_rate: 16.7,
    presale_move_in: "2026-12",
    builder: "테스트건설",
    ...overrides,
  };
}

describe("MbApartmentTable — 평당가/할인율 컬럼 (단계 5)", () => {
  it("데스크톱 thead 에 '평당가' SortableTh + '할인율' 헤더가 렌더된다", () => {
    render(<MbApartmentTable apartments={[makeApt({ id: "A", name: "단지A" })]} />);
    expect(screen.getByText("평당가")).toBeInTheDocument();
    expect(screen.getByText("할인율")).toBeInTheDocument();
  });

  it("presale_pp + discount_pct 값이 있으면 데스크톱 tbody 에 렌더된다", () => {
    const apts = [
      makeApt({ id: "A", name: "단지A", presale_pp: 2500, discount_pct: 5.5 }),
    ];
    render(<MbApartmentTable apartments={apts} />);
    expect(screen.getByText("2,500")).toBeInTheDocument();
    expect(screen.getByText("5.5%")).toBeInTheDocument();
  });

  it("presale_pp 가 null 이면 '-' fallback", () => {
    render(<MbApartmentTable apartments={[makeApt({ id: "A", name: "단지A" })]} />);
    const dashes = screen.getAllByText("-");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it("presale_pp 가 0(미공개)이면 데스크톱 셀 '-' + '0' 미표시 (세션 300)", () => {
    render(<MbApartmentTable apartments={[makeApt({ id: "A", name: "단지A", presale_pp: 0 })]} />);
    // 평당가 0 은 "0" 으로 찍히지 않고 "-" 로 (normalizePp)
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    const dashes = screen.getAllByText("-");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("모바일 카드: presale_pp 가 0(미공개)이면 '평당 0만' 미렌더 (세션 300)", () => {
    const { container } = render(
      <MbApartmentTable apartments={[makeApt({ id: "A", name: "단지A", presale_pp: 0 })]} />,
    );
    const cards = container.querySelector('[data-testid="mb-apt-cards"]');
    expect(cards?.textContent).not.toContain("평당");
  });

  it("모바일 카드: presale_pp + discount_pct 인라인 노출", () => {
    const apts = [
      makeApt({ id: "A", name: "단지A", presale_pp: 2500, discount_pct: 5.5 }),
    ];
    const { container } = render(<MbApartmentTable apartments={apts} />);
    const cards = container.querySelector('[data-testid="mb-apt-cards"]');
    expect(cards?.textContent).toContain("평당 2,500만");
    expect(cards?.textContent).toContain("할인 5.5%");
  });

  it("모바일 카드: presale_pp 와 discount_pct 모두 null 이면 4행 블록 미렌더", () => {
    const { container } = render(<MbApartmentTable apartments={[makeApt({ id: "A", name: "단지A" })]} />);
    const cards = container.querySelector('[data-testid="mb-apt-cards"]');
    expect(cards?.textContent).not.toContain("평당");
    expect(cards?.textContent).not.toContain("할인");
  });

  it("빈 배열이면 EmptyState 카피 ('표시할 미분양 단지가 없어요') 표시", () => {
    render(<MbApartmentTable apartments={[]} />);
    expect(screen.getByText("표시할 미분양 단지가 없어요")).toBeInTheDocument();
  });
});

describe("MbApartmentTable — SortableTh 허용 방향 (backend mb.py MbAptSortBy Literal 동기화, 422 방지)", () => {
  const apts = [makeApt({ id: "A", name: "단지A" })];

  it("'세대수'(asc 미지원) — desc 상태에서 재클릭 시 units_asc 대신 해제('')", () => {
    const onSortChange = vi.fn();
    render(<MbApartmentTable apartments={apts} sort="units_desc" onSortChange={onSortChange} />);
    const table = screen.getByRole("table");
    fireEvent.click(within(table).getByText("세대수"));
    expect(onSortChange).toHaveBeenCalledWith("");
    expect(onSortChange).not.toHaveBeenCalledWith("units_asc");
  });

  it("'미분양률'(asc 미지원) — desc 상태에서 재클릭 시 해제('')", () => {
    const onSortChange = vi.fn();
    render(<MbApartmentTable apartments={apts} sort="unsold_rate_desc" onSortChange={onSortChange} />);
    const table = screen.getByRole("table");
    fireEvent.click(within(table).getByText("미분양률"));
    expect(onSortChange).toHaveBeenCalledWith("");
  });

  it("'미분양'(asc 지원) — desc 상태에서 재클릭 시 unsold_asc 3단 사이클 유지", () => {
    const onSortChange = vi.fn();
    render(<MbApartmentTable apartments={apts} sort="unsold_desc" onSortChange={onSortChange} />);
    const table = screen.getByRole("table");
    fireEvent.click(within(table).getByText("미분양"));
    expect(onSortChange).toHaveBeenCalledWith("unsold_asc");
  });

  it("비활성 컬럼 첫 클릭은 ascAllowed 무관하게 desc 정렬", () => {
    const onSortChange = vi.fn();
    render(<MbApartmentTable apartments={apts} onSortChange={onSortChange} />);
    const table = screen.getByRole("table");
    fireEvent.click(within(table).getByText("세대수"));
    expect(onSortChange).toHaveBeenCalledWith("units_desc");
  });

  it("'평당가' 헤더 클릭 → pp_desc (셀 값 presale_pp 와 정렬 일치 — 종전 price mislabel 정정, 세션 297)", () => {
    const onSortChange = vi.fn();
    render(<MbApartmentTable apartments={apts} onSortChange={onSortChange} />);
    const table = screen.getByRole("table");
    fireEvent.click(within(table).getByText("평당가"));
    expect(onSortChange).toHaveBeenCalledWith("pp_desc");
    expect(onSortChange).not.toHaveBeenCalledWith("price_desc");
  });
});

describe("MbApartmentTable — 키워드 0건 '검색어 지우기' (세션 299 A3)", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSearchParams.mockReturnValue(new URLSearchParams());
  });

  it("q 존재 + 0건 → 키워드 인용 문구 + '검색어 지우기' 버튼 렌더", () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("region=서울&q=래미안"));
    render(<MbApartmentTable apartments={[]} />);
    expect(screen.getByText('"래미안" 검색 결과가 없어요')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "검색어 지우기" })).toBeInTheDocument();
  });

  it("'검색어 지우기' 클릭 → q 제거 + page=1 로 replace (다른 파라미터 보존)", () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("region=서울&q=래미안&page=3"));
    render(<MbApartmentTable apartments={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "검색어 지우기" }));
    expect(mockReplace).toHaveBeenCalledTimes(1);
    const [url, opts] = mockReplace.mock.calls[0];
    expect(url).toContain("/mibunyang?");
    expect(url).toContain("region=%EC%84%9C%EC%9A%B8");
    expect(url).toContain("page=1");
    expect(url).not.toContain("q=");
    expect(opts).toEqual({ scroll: false });
  });

  it("q 없음 + 0건 → 기존 문구 유지 + 지우기 버튼 미노출", () => {
    render(<MbApartmentTable apartments={[]} />);
    expect(screen.getByText("표시할 미분양 단지가 없어요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "검색어 지우기" })).not.toBeInTheDocument();
  });
});
