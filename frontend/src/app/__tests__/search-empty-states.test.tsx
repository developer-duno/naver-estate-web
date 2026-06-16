/**
 * /search 빈 결과·에러 UI 보강 테스트 (세션 88)
 * 5 케이스: 서버 0 + 키워드 / 최근 검색 칩 / 필터 0 / 에러+필터활성 / 에러+필터비활성
 * 실행: npx vitest run src/app/__tests__/search-empty-states.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { Suspense } from "react";
import { TestQueryProvider } from "../../test-setup";

// next/navigation mock 오버라이드
const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockSearchParams = vi.fn(() => new URLSearchParams());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/search",
  useSearchParams: () => mockSearchParams(),
  useParams: () => ({}),
}));

// API mock
const mockSearchComplexes = vi.fn();
const mockGetComplexesByRegion = vi.fn();

vi.mock("@/lib/api", () => ({
  searchComplexes: (...args: unknown[]) => mockSearchComplexes(...args),
  getComplexesByRegion: (...args: unknown[]) => mockGetComplexesByRegion(...args),
  getComplex: vi.fn(),
  getArticles: vi.fn(),
  checkUserStatus: vi.fn().mockResolvedValue(null),
}));

// RegionSelector 내부 API 호출 회피
vi.mock("@/components/RegionSelector", () => ({
  default: () => <div data-testid="region-selector" />,
}));

// 세션 314: 검색 로직은 SearchExperience 가 담당 (search/page.tsx 는 홈 리다이렉트).
import SearchExperience from "@/components/search/SearchExperience";

function makeComplex(no: string, name: string, code = "APT") {
  return {
    complex_no: no,
    complex_name: name,
    real_estate_type_name: code === "APT" ? "아파트" : "오피스텔",
    real_estate_type_code: code,
    article_count: 5,
    sido: "서울",
    sigungu: "강남구",
    dong: "역삼동",
    total_household_count: 100,
  };
}

function renderSearch() {
  return render(
    <TestQueryProvider>
      <Suspense fallback={<div>loading</div>}>
        <SearchExperience />
      </Suspense>
    </TestQueryProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams.mockReturnValue(new URLSearchParams());
  localStorage.clear();
});

describe("/search 빈 결과·에러 UI 보강", () => {
  it("서버 결과 0 + 키워드 → 키워드를 인용한 안내 표시", async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("q=존재하지않는단지xyz"));
    mockSearchComplexes.mockResolvedValue({ complexes: [], total: 0 });

    renderSearch();

    await waitFor(() => {
      expect(
        screen.getByText('"존재하지않는단지xyz"에 대한 검색 결과가 없습니다.'),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("다른 키워드나 지역으로 다시 시도해보세요.")).toBeInTheDocument();
  });

  it("서버 결과 0 + localStorage 히스토리 3건 → 최근 검색 칩 렌더 + 클릭 시 router.push", async () => {
    // 히스토리 3건 — keyword 2 + region 1
    localStorage.setItem(
      "search_history",
      JSON.stringify([
        { type: "keyword", keyword: "래미안", timestamp: 1000 },
        { type: "keyword", keyword: "힐스테이트", timestamp: 999 },
        { type: "region", sido: "서울", sigungu: "강남구", dong: "역삼동", timestamp: 998 },
      ]),
    );
    mockSearchParams.mockReturnValue(new URLSearchParams("q=없는키워드"));
    mockSearchComplexes.mockResolvedValue({ complexes: [], total: 0 });

    renderSearch();

    await waitFor(() => {
      expect(screen.getByText("최근 검색")).toBeInTheDocument();
    });
    // 3개 칩 렌더 확인
    expect(screen.getByRole("button", { name: "래미안" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "힐스테이트" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "서울 강남구 역삼동" })).toBeInTheDocument();

    // 키워드 칩 클릭 → router.push 호출
    fireEvent.click(screen.getByRole("button", { name: "래미안" }));
    expect(mockPush).toHaveBeenCalledWith("/search?q=%EB%9E%98%EB%AF%B8%EC%95%88");
  });

  it("필터 적용 후 0개 사각지대 — 매물유형 탭 좁힘으로 통과 0건일 때 안내 + 초기화 버튼", async () => {
    // types=OPST 만 선택. 단지는 모두 APT → 클라이언트 필터 통과 0건
    mockSearchParams.mockReturnValue(new URLSearchParams("q=래미안&types=OPST"));
    mockSearchComplexes.mockResolvedValue({
      complexes: [makeComplex("C001", "래미안A", "APT"), makeComplex("C002", "래미안B", "APT")],
      total: 2,
    });

    renderSearch();

    await waitFor(() => {
      expect(screen.getByText("필터 조건에 맞는 단지가 없습니다.")).toBeInTheDocument();
    });
    expect(screen.getByText(/전체 2개 단지 중 0개가 통과/)).toBeInTheDocument();
    // 초기화 버튼 노출
    expect(screen.getByRole("button", { name: "필터 초기화" })).toBeInTheDocument();
  });

  it("에러 + 필터 활성 → '다시 시도' + '필터 초기화' 둘 다 노출", async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("q=에러&min_price=10000"));
    mockSearchComplexes.mockRejectedValue(new Error("서버 오류"));

    renderSearch();

    await waitFor(() => {
      expect(screen.getByText(/검색에 실패했습니다/)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "필터 초기화" })).toBeInTheDocument();
  });

  it("에러 + 필터 비활성 → '다시 시도'만, '필터 초기화' 미노출", async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("q=에러"));
    mockSearchComplexes.mockRejectedValue(new Error("서버 오류"));

    renderSearch();

    await waitFor(() => {
      expect(screen.getByText(/검색에 실패했습니다/)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "필터 초기화" })).not.toBeInTheDocument();
  });

  it("region_fallback 응답 → 동에 단지 없어 시구 단위로 표시 안내 노출", async () => {
    mockSearchParams.mockReturnValue(
      new URLSearchParams("sido=대전광역시&sigungu=대덕구&dong=문평동"),
    );
    mockGetComplexesByRegion.mockResolvedValue({
      complexes: [makeComplex("C111", "시구단위단지", "APT")],
      total: 1,
      source: "region_fallback",
      notice: "'문평동'에 등록된 단지가 아직 없어 '대덕구' 단위로 결과를 표시합니다.",
      fallback_dong: "문평동",
    });

    renderSearch();

    await waitFor(() => {
      expect(
        screen.getByText(
          /'문평동'에 등록된 단지가 아직 없어 '대덕구' 단위로 결과를 표시합니다/,
        ),
      ).toBeInTheDocument();
    });
    // 시구 단위 단지는 정상 노출
    expect(screen.getAllByText("시구단위단지").length).toBeGreaterThan(0);
  });

  it("dong 검색 502 에러 → 동 빼고 시구 단위로 검색 버튼 노출", async () => {
    mockSearchParams.mockReturnValue(
      new URLSearchParams("sido=대전광역시&sigungu=대덕구&dong=문평동"),
    );
    mockGetComplexesByRegion.mockRejectedValue(new Error("502"));

    renderSearch();

    await waitFor(() => {
      expect(
        screen.getByText(
          /'대전광역시 대덕구 문평동' 검색 결과가 없습니다/,
        ),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "대덕구 단위로 검색" })).toBeInTheDocument();
  });

  it("직접 진입(파라미터 없음) + 히스토리 존재 → 최근 검색 칩 노출 + 클릭 시 push (세션 299 A1)", async () => {
    localStorage.setItem(
      "search_history",
      JSON.stringify([{ type: "keyword", keyword: "래미안", timestamp: 1000 }]),
    );
    mockSearchParams.mockReturnValue(new URLSearchParams());

    renderSearch();

    // 인라인 검색 폼과 함께 최근 검색 칩이 보인다
    await waitFor(() => {
      expect(screen.getByText("최근 검색")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "래미안" }));
    expect(mockPush).toHaveBeenCalledWith("/search?q=%EB%9E%98%EB%AF%B8%EC%95%88");
  });

  it("0건 + 필터·유형 설정 상태에서 최근 검색 칩 클릭 → 필터/유형 보존 push (세션 299 A4)", async () => {
    localStorage.setItem(
      "search_history",
      JSON.stringify([{ type: "keyword", keyword: "래미안", timestamp: 1000 }]),
    );
    mockSearchParams.mockReturnValue(new URLSearchParams("q=없는키워드&types=APT&min_price=10000"));
    mockSearchComplexes.mockResolvedValue({ complexes: [], total: 0 });

    renderSearch();

    await waitFor(() => {
      expect(screen.getByText("최근 검색")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "래미안" }));
    expect(mockPush).toHaveBeenCalledWith(
      "/search?q=%EB%9E%98%EB%AF%B8%EC%95%88&types=APT&min_price=10000",
    );
  });

  it("직접 진입 + URL 필터 설정 상태에서 인라인 키워드 검색 → 필터 보존 push (세션 299 A4)", async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("min_price=10000"));

    renderSearch();

    const input = await screen.findByLabelText("단지명 검색");
    fireEvent.change(input, { target: { value: "테스트" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockPush).toHaveBeenCalledWith("/search?q=%ED%85%8C%EC%8A%A4%ED%8A%B8&min_price=10000");
  });
});
