/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ArticleDetail 컴포넌트 테스트 - 모달 렌더링, 닫기
 * 실행: npx vitest run src/components/__tests__/ArticleDetail.test.tsx
 *
 * 뮤테이션 검증(세션 395): ArticleDetailBody 의 queryFn 에서 sessionToken 인자를 제거하면
 * "세션 토큰 전달" describe 의 3 케이스가 FAIL 하는 것을 확인한 뒤 복원했다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { TestQueryProvider } from "../../test-setup";

// B2 게이트 토큰 훅 — 케이스별로 반환값을 바꾼다 (CheckoutButton.test.tsx 패턴 답습)
const useSessionTokenMock = vi.fn();
vi.mock("@/hooks/useSessionToken", () => ({
  useSessionToken: () => useSessionTokenMock(),
}));

vi.mock("@/lib/api", () => ({
  getArticleLive: vi.fn().mockResolvedValue({
    article_no: "A001",
    complex_no: "C001",
    complex_name: "래미안테스트",
    trade_type_name: "매매",
    deal_or_warrant_prc: "5억",
    area2_m2: 84,
    floor_info: "10/25",
    direction: "남향",
    realtor_name: "행복공인",
    building_name: "101동",
  }),
  // 부모 ArticleDetailBody 의 useQuery 3개에 응답 — 모두 빈 데이터 → hasContent=false → emptyHint 노출 회귀 가드
  getPriceStats: vi.fn().mockResolvedValue({ complex_no: "C001", total_articles: 0, by_area: [], by_floor: [] }),
  getPyeongDetails: vi.fn().mockResolvedValue({ pyeong_details: [] }),
  getArticles: vi.fn().mockResolvedValue({ articles: [], total: 0 }),
  // PriceHistoryTable 등 다른 자식이 쓰는 api
  getArticlePriceHistory: vi.fn().mockResolvedValue({ items: [] }),
}));

let ArticleDetail: any;
beforeEach(async () => {
  vi.resetModules();
  // 기본값 = 승인 중개사 로그인 상태 (토큰 있음 + 해석 완료)
  useSessionTokenMock.mockReturnValue({
    sessionToken: "tok", tokenReady: true, tokenError: false, dismissTokenError: vi.fn(),
  });
  const mod = await import("../ArticleDetail");
  ArticleDetail = mod.default;
});

describe("ArticleDetail — 추가", () => {
  it("dialog role 존재", async () => {
    const onClose = vi.fn();
    render(<TestQueryProvider><ArticleDetail articleNo="A001" onClose={onClose} /></TestQueryProvider>);
    await waitFor(() => {
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("매물 상세 타이틀", async () => {
    const onClose = vi.fn();
    render(<TestQueryProvider><ArticleDetail articleNo="A001" onClose={onClose} /></TestQueryProvider>);
    await waitFor(() => {
      expect(screen.getByText("매물 상세")).toBeInTheDocument();
    });
  });

  it("닫기 버튼 aria-label", async () => {
    const onClose = vi.fn();
    render(<TestQueryProvider><ArticleDetail articleNo="A001" onClose={onClose} /></TestQueryProvider>);
    await waitFor(() => {
      const btn = screen.getByLabelText("닫기");
      expect(btn).toBeInTheDocument();
    });
  });

  it("로딩 상태 표시", () => {
    const onClose = vi.fn();
    render(<TestQueryProvider><ArticleDetail articleNo="A001" onClose={onClose} /></TestQueryProvider>);
    const spinner = screen.getByRole("status");
    expect(spinner).toBeInTheDocument();
  });

  it("로딩 중 '불러오는 중' 안내 문구", () => {
    const onClose = vi.fn();
    render(<TestQueryProvider><ArticleDetail articleNo="A001" onClose={onClose} /></TestQueryProvider>);
    expect(screen.getByText(/불러오는 중/)).toBeInTheDocument();
  });
});


describe("ArticleDetail", () => {
  it("로딩 후 매물 정보 표시", async () => {
    const onClose = vi.fn();
    render(<TestQueryProvider><ArticleDetail articleNo="A001" onClose={onClose} /></TestQueryProvider>);
    await waitFor(() => {
      // 매물 데이터가 로드된 후 닫기 버튼이 표시되어야 함
      const closeBtn = screen.queryByRole("button");
      expect(closeBtn).not.toBeNull();
    }, { timeout: 3000 });
  });

  it("onClose 프롭 전달", () => {
    const onClose = vi.fn();
    render(<TestQueryProvider><ArticleDetail articleNo="A001" onClose={onClose} /></TestQueryProvider>);
    // 컴포넌트가 크래시 없이 렌더링됨을 확인
    expect(onClose).not.toHaveBeenCalled();
  });
});

// 세션 217: ChartAccordion hasContent=false 시 emptyHint 노출 회귀 가드 (PR ② 빈 박스 정정)
describe("ArticleDetail — ChartAccordion 빈 박스 정정", () => {
  it("시세/관리비 데이터 없을 때 ChartAccordion 펼치면 '아직 수집되지 않았습니다' emptyHint 노출", async () => {
    const onClose = vi.fn();
    render(<TestQueryProvider><ArticleDetail articleNo="A001" onClose={onClose} /></TestQueryProvider>);
    // 매물 로드 대기 → ChartAccordion 펼치기 → emptyHint 메시지 확인
    await waitFor(() => expect(screen.getByText("시세 정보")).toBeInTheDocument(), { timeout: 3000 });
    // 기본 닫힘 → 펼침
    const market = screen.getByText("시세 정보");
    market.click();
    await waitFor(() => {
      expect(screen.getByText(/시세 정보가 아직 수집되지 않았습니다/)).toBeInTheDocument();
    });
  });
});

// 세션 105: 헤더에 즐겨찾기 버튼 통합 회귀 가드 (메모 폐기 후 즐겨찾기 단독)
describe("ArticleDetail — 헤더 즐겨찾기 버튼", () => {
  it("매물 로드 후 ☆ 즐겨찾기 버튼 렌더", async () => {
    const onClose = vi.fn();
    render(<TestQueryProvider><ArticleDetail articleNo="A001" onClose={onClose} /></TestQueryProvider>);
    await waitFor(() => {
      expect(screen.getByLabelText("매물 즐겨찾기 추가")).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("로딩 중(article 미정) 시 즐겨찾기 버튼 미렌더", () => {
    const onClose = vi.fn();
    render(<TestQueryProvider><ArticleDetail articleNo="A001" onClose={onClose} /></TestQueryProvider>);
    // 로딩 직후엔 article 데이터가 아직 없어 즐겨찾기 버튼이 렌더되지 않아야 함
    expect(screen.queryByLabelText("매물 즐겨찾기 추가")).not.toBeInTheDocument();
  });
});

// 세션 274: 시세 조회(isError) 시 emptyHint 에 "다시 시도" 버튼 노출 + 클릭 시 refetch 회귀 가드
describe("ArticleDetail — 시세 조회 실패 시 다시 시도", () => {
  it("getPriceStats 실패 시 ChartAccordion 펼치면 '다시 시도' 버튼 노출 + 클릭 시 재호출", async () => {
    const api = await import("@/lib/api");
    // 부모 priceStatsQuery 를 isError 로 만들어 emptyHint 의 실패 분기 트리거
    vi.mocked(api.getPriceStats).mockRejectedValue(new Error("500"));
    const onClose = vi.fn();
    render(<TestQueryProvider><ArticleDetail articleNo="A001" onClose={onClose} /></TestQueryProvider>);

    await waitFor(() => expect(screen.getByText("시세 정보")).toBeInTheDocument(), { timeout: 3000 });
    // 기본 닫힘 → 펼침
    fireEvent.click(screen.getByText("시세 정보"));

    // isError 분기 → 안내 문구 + 다시 시도 버튼
    const retryBtn = await screen.findByText("다시 시도");
    expect(retryBtn).toBeInTheDocument();
    expect(screen.getByText("시세 정보를 불러오지 못했습니다.")).toBeInTheDocument();

    // 다시 시도 클릭 → getPriceStats 재호출 (refetch)
    const callsBefore = vi.mocked(api.getPriceStats).mock.calls.length;
    fireEvent.click(retryBtn);
    await waitFor(() => {
      expect(vi.mocked(api.getPriceStats).mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});

describe("ArticleDetail — 배경 스크롤 잠금 (세션 295)", () => {
  it("모달이 열리면 body overflow=hidden, 닫히면 이전 값 복원", async () => {
    document.body.style.overflow = "auto"; // prev 값 시뮬
    const { unmount } = render(
      <TestQueryProvider><ArticleDetail articleNo="A001" onClose={vi.fn()} /></TestQueryProvider>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("auto");
    document.body.style.overflow = "";
  });
});

// 세션 297: 삭제된 매물(404) dead-end 해소 — 영원한 "다시 시도" 대신 안내 + 즐겨찾기 제거 CTA
// ApiError 는 vi.resetModules() 후 컴포넌트가 바인딩한 같은 모듈 인스턴스에서 가져와야 instanceof 통과
describe("ArticleDetail — 삭제된 매물 404 분기 (세션 297)", () => {
  async function make404() {
    const api = await import("@/lib/api");
    const { ApiError } = await import("@/lib/api/core");
    vi.mocked(api.getArticleLive).mockRejectedValue(
      new ApiError("매물 정보를 찾을 수 없습니다", 404),
    );
  }

  it("404 이면 '더 이상 확인할 수 없어요' 안내 + '다시 시도' 미노출", async () => {
    await make404();
    render(<TestQueryProvider><ArticleDetail articleNo="DEAD01" onClose={vi.fn()} /></TestQueryProvider>);
    await waitFor(() => {
      expect(screen.getByText("이 매물은 더 이상 확인할 수 없어요.")).toBeInTheDocument();
    }, { timeout: 3000 });
    expect(screen.getByText(/거래가 완료됐거나 네이버에서 내려간/)).toBeInTheDocument();
    expect(screen.queryByText("다시 시도")).not.toBeInTheDocument();
  });

  it("onRemoveFavorite prop 있으면 '즐겨찾기에서 제거' 버튼 노출 + 클릭 시 호출", async () => {
    await make404();
    const onRemoveFavorite = vi.fn();
    render(
      <TestQueryProvider>
        <ArticleDetail articleNo="DEAD01" onClose={vi.fn()} onRemoveFavorite={onRemoveFavorite} />
      </TestQueryProvider>,
    );
    const removeBtn = await screen.findByText("즐겨찾기에서 제거", undefined, { timeout: 3000 });
    fireEvent.click(removeBtn);
    expect(onRemoveFavorite).toHaveBeenCalledTimes(1);
  });

  it("onRemoveFavorite prop 없으면 (단지 페이지 경유) 제거 버튼 미노출", async () => {
    await make404();
    render(<TestQueryProvider><ArticleDetail articleNo="DEAD01" onClose={vi.fn()} /></TestQueryProvider>);
    await waitFor(() => {
      expect(screen.getByText("이 매물은 더 이상 확인할 수 없어요.")).toBeInTheDocument();
    }, { timeout: 3000 });
    expect(screen.queryByText("즐겨찾기에서 제거")).not.toBeInTheDocument();
  });

  it("404 아닌 에러(500)는 기존 '다시 시도' 분기 유지", async () => {
    const api = await import("@/lib/api");
    const { ApiError } = await import("@/lib/api/core");
    // 컴포넌트 retry 가 비404 를 1회 재시도하므로 지속형 reject
    vi.mocked(api.getArticleLive).mockRejectedValue(new ApiError("API 오류: 500", 500));
    render(<TestQueryProvider><ArticleDetail articleNo="ERR500" onClose={vi.fn()} /></TestQueryProvider>);
    const retryBtn = await screen.findByText("다시 시도", undefined, { timeout: 3000 });
    expect(retryBtn).toBeInTheDocument();
    expect(screen.getByText("매물 정보를 불러올 수 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText("즐겨찾기에서 제거")).not.toBeInTheDocument();
  });
});

// 세션 395: B2 게이트 이후 모달이 토큰 없이 호출해 항상 401 이던 결함 회귀 가드.
// 라이브 로그 2026-09-09 01:54:36 — price-stats/pyeong-details/articles 가 모달에서만 401.
describe("ArticleDetail — 세션 토큰 전달 (B2 게이트, 세션 395)", () => {
  // 앞 describe 들이 getArticleLive 를 지속형 reject 로 덮어써 mock 구현이 파일 내에서
  // 이월된다(vi.resetModules() 는 모듈만 리셋, mock 구현은 유지) → 매물 본문부터 복원
  beforeEach(async () => {
    const api = await import("@/lib/api");
    vi.mocked(api.getArticleLive).mockResolvedValue({
      article_no: "A001",
      complex_no: "C001",
      complex_name: "래미안테스트",
      trade_type_name: "매매",
      deal_or_warrant_prc: "5억",
      area2_m2: 84,
      floor_info: "10/25",
      direction: "남향",
      realtor_name: "행복공인",
      building_name: "101동",
    } as any);
    vi.mocked(api.getPriceStats).mockResolvedValue({
      complex_no: "C001", total_articles: 0, by_area: [], by_floor: [],
    } as any);
  });

  it("토큰이 있으면 시세·면적·경쟁매물 조회에 토큰 인자를 함께 넘긴다", async () => {
    const api = await import("@/lib/api");
    render(<TestQueryProvider><ArticleDetail articleNo="A001" onClose={vi.fn()} /></TestQueryProvider>);

    await waitFor(() => {
      expect(vi.mocked(api.getPriceStats)).toHaveBeenCalledWith("C001", "tok");
    }, { timeout: 3000 });
    expect(vi.mocked(api.getPyeongDetails)).toHaveBeenCalledWith("C001", "tok");
    expect(vi.mocked(api.getArticles)).toHaveBeenCalledWith("C001", { trade_types: "매매" }, "tok");
  });

  it("tokenReady=false 면 세 조회 모두 실행되지 않는다 (토큰 도착 전 401 캐시 방지)", async () => {
    useSessionTokenMock.mockReturnValue({
      sessionToken: undefined, tokenReady: false, tokenError: false, dismissTokenError: vi.fn(),
    });
    const api = await import("@/lib/api");
    // 앞 케이스들의 호출 이력이 같은 mock 인스턴스에 누적되므로 "미호출" 단언 전 초기화
    vi.mocked(api.getPriceStats).mockClear();
    vi.mocked(api.getPyeongDetails).mockClear();
    vi.mocked(api.getArticles).mockClear();
    render(<TestQueryProvider><ArticleDetail articleNo="A001" onClose={vi.fn()} /></TestQueryProvider>);

    // 매물 본문은 뜨지만(getArticleLive 는 게이트 밖) B2 게이트 3종은 미호출
    await waitFor(() => expect(screen.getByText("시세 정보")).toBeInTheDocument(), { timeout: 3000 });
    expect(vi.mocked(api.getPriceStats)).not.toHaveBeenCalled();
    expect(vi.mocked(api.getPyeongDetails)).not.toHaveBeenCalled();
    expect(vi.mocked(api.getArticles)).not.toHaveBeenCalled();
  });

  it("401(비로그인·미승인) 이면 '다시 시도' 대신 승인 중개사 잠금 안내를 보여준다", async () => {
    useSessionTokenMock.mockReturnValue({
      sessionToken: undefined, tokenReady: true, tokenError: false, dismissTokenError: vi.fn(),
    });
    const api = await import("@/lib/api");
    const { ApiError } = await import("@/lib/api/core");
    vi.mocked(api.getPriceStats).mockRejectedValue(new ApiError("Unauthorized", 401));

    render(<TestQueryProvider><ArticleDetail articleNo="A001" onClose={vi.fn()} /></TestQueryProvider>);
    await waitFor(() => expect(screen.getByText("시세 정보")).toBeInTheDocument(), { timeout: 3000 });
    fireEvent.click(screen.getByText("시세 정보"));

    expect(await screen.findByText(/승인된 공인중개사만 볼 수 있어요/)).toBeInTheDocument();
    expect(screen.queryByText("시세 정보를 불러오지 못했습니다.")).not.toBeInTheDocument();
  });
});
