/**
 * 검색 페이지 테스트 — 로딩 상태, API 호출, 에러 처리
 * 실행: npx vitest run src/app/__tests__/search.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Suspense } from "react";

// next/navigation mock 오버라이드용
const mockPush = vi.fn();
const mockSearchParams = vi.fn(() => new URLSearchParams());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
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
  checkUserStatus: vi.fn().mockResolvedValue(null),
}));

// RegionSelector mock (내부에서 API 호출하므로)
vi.mock("@/components/RegionSelector", () => ({
  default: () => <div data-testid="region-selector" />,
}));

import SearchPage from "../search/page";

/** 테스트용 단지 데이터 팩토리 */
function makeComplex(no: string, name: string, reType = "APT") {
  return {
    complex_no: no,
    complex_name: name,
    real_estate_type_name: reType === "APT" ? "아파트" : "오피스텔",
    real_estate_type_code: reType,
    article_count: 5,
    sido: "서울",
    sigungu: "강남구",
    dong: "역삼동",
    total_household_count: 100,
  };
}

function renderSearch() {
  return render(
    <Suspense fallback={<div>loading</div>}>
      <SearchPage />
    </Suspense>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams.mockReturnValue(new URLSearchParams());
});

describe("SearchPage", () => {
  it("파라미터 없을 때 인라인 검색 폼 표시", async () => {
    renderSearch();
    await waitFor(() => {
      // 검색 입력 필드가 표시됨
      expect(screen.getByPlaceholderText(/아파트|단지|검색/i)).toBeInTheDocument();
    });
  });

  it("q 파라미터 → searchComplexes API 호출", async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("q=래미안"));
    mockSearchComplexes.mockResolvedValue({
      complexes: [makeComplex("C001", "래미안")],
      total: 1,
    });

    renderSearch();
    await waitFor(() => {
      expect(mockSearchComplexes).toHaveBeenCalled();
      const [keyword] = mockSearchComplexes.mock.calls[0];
      expect(keyword).toBe("래미안");
    });
  });

  it("sido 파라미터 → getComplexesByRegion API 호출", async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("sido=서울&sigungu=강남구"));
    mockGetComplexesByRegion.mockResolvedValue({
      complexes: [makeComplex("C002", "힐스테이트")],
      total: 1,
    });

    renderSearch();
    await waitFor(() => {
      expect(mockGetComplexesByRegion).toHaveBeenCalled();
    });
  });

  it("로딩 중 스피너 + 메시지 표시", async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("q=테스트"));
    // API가 resolve되지 않도록 pending 상태 유지
    mockSearchComplexes.mockReturnValue(new Promise(() => {}));

    renderSearch();
    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(screen.getByText("검색 중입니다. 잠시만 기다려주세요.")).toBeInTheDocument();
    });
  });

  it("검색 결과 테이블 렌더링", async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("q=래미안"));
    mockSearchComplexes.mockResolvedValue({
      complexes: [makeComplex("C001", "래미안퍼스티지"), makeComplex("C002", "래미안블레스티지")],
      total: 2,
    });

    renderSearch();
    await waitFor(() => {
      expect(screen.getByText("래미안퍼스티지")).toBeInTheDocument();
      expect(screen.getByText("래미안블레스티지")).toBeInTheDocument();
    });
  });

  it("API 에러 → 에러 메시지 표시", async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("q=에러테스트"));
    mockSearchComplexes.mockRejectedValue(new Error("서버 오류"));

    renderSearch();
    await waitFor(() => {
      expect(screen.getByText(/오류|실패|에러/i)).toBeInTheDocument();
    });
  });

  it("결과 0건 → 빈 상태 메시지", async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("q=없는단지"));
    mockSearchComplexes.mockResolvedValue({ complexes: [], total: 0 });

    renderSearch();
    await waitFor(() => {
      const matches = screen.getAllByText(/검색 결과가 없습니다|결과 없음|0개/i);
      expect(matches.length).toBeGreaterThan(0);
    });
  });
});
