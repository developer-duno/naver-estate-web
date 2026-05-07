/**
 * ArticleCardMobile 컴포넌트 테스트 — 모바일 매물 카드뷰 렌더링
 * 실행: npx vitest run src/components/__tests__/ArticleCardMobile.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ArticleCardMobile from "../ArticleCardMobile";
import type { Article } from "@/types";

beforeEach(() => {
  localStorage.clear();
});

// 테스트 팩토리
function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    article_no: "A001",
    complex_no: "C001",
    trade_type_name: "매매",
    building_name: "101동",
    floor_info: "10",
    deal_or_warrant_prc: "5억",
    area2_m2: 84,
    numeric_price: 50000,
    room_count: 3,
    bathroom_count: 2,
    direction: "남향",
    article_feature_desc: "초역세권 풀옵션",
    ...overrides,
  };
}

describe("ArticleCardMobile", () => {
  it("매물 카드 렌더링", () => {
    render(<ArticleCardMobile articles={[makeArticle()]} />);
    expect(screen.getByText("매매")).toBeInTheDocument();
    expect(screen.getByText("5억")).toBeInTheDocument();
    expect(screen.getByText("101동")).toBeInTheDocument();
  });

  it("빈 매물 목록", () => {
    render(<ArticleCardMobile articles={[]} />);
    expect(screen.getByText(/매물이 없습니다/)).toBeInTheDocument();
  });

  it("빈 매물 + 필터 활성 → '필터 초기화' 버튼 클릭 시 onResetFilters 호출", () => {
    const reset = vi.fn();
    render(<ArticleCardMobile articles={[]} hasActiveFilters onResetFilters={reset} />);
    expect(screen.getByText(/필터 조건이 너무 좁/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "필터 초기화" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("빈 매물 + 필터 비활성 → '데이터 갱신' 안내 문구 유지", () => {
    render(<ArticleCardMobile articles={[]} hasActiveFilters={false} />);
    expect(screen.getByText(/데이터 갱신/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "필터 초기화" })).not.toBeInTheDocument();
  });

  it("여러 매물 카드 렌더링", () => {
    const arts = [makeArticle(), makeArticle({ article_no: "A002", building_name: "102동" })];
    render(<ArticleCardMobile articles={arts} />);
    expect(screen.getByText("101동")).toBeInTheDocument();
    expect(screen.getByText("102동")).toBeInTheDocument();
  });

  it("가격 하락 표시", () => {
    const art = makeArticle({ numeric_price: 48000, previous_price: 50000 });
    render(<ArticleCardMobile articles={[art]} />);
    // ↓2,000 표시
    expect(screen.getByText(/↓/)).toBeInTheDocument();
    expect(screen.getByText(/2,000/)).toBeInTheDocument();
  });

  it("월세 가격 형식", () => {
    const art = makeArticle({ trade_type_name: "월세", deal_or_warrant_prc: "1,000", rent_prc: "50" });
    render(<ArticleCardMobile articles={[art]} />);
    expect(screen.getByText("1,000 / 50")).toBeInTheDocument();
  });

  it("카드 클릭 시 onRowClick 호출", () => {
    const handler = vi.fn();
    render(<ArticleCardMobile articles={[makeArticle()]} onRowClick={handler} />);
    fireEvent.click(screen.getByText("5억"));
    expect(handler).toHaveBeenCalledWith("A001");
  });

  it("체크박스 선택", () => {
    const handler = vi.fn();
    render(
      <ArticleCardMobile
        articles={[makeArticle()]}
        selectedArticleNos={new Set()}
        onSelectionChange={handler}
        onSelectAll={vi.fn()}
      />,
    );
    const checkboxes = screen.getAllByRole("checkbox");
    // 전체선택 + 개별 = 2개
    expect(checkboxes).toHaveLength(2);
    fireEvent.click(checkboxes[1]);
    expect(handler).toHaveBeenCalledWith("A001", true);
  });

  // B-1 Phase 2: 액션 영역 (메모/즐겨찾기) 회귀 가드
  describe("B-1 액션 영역 — 메모·즐겨찾기 버튼 (옵션 B layout)", () => {
    it("메모(📄) 우상단 + 즐겨찾기(☆) 1행 우측 렌더링", () => {
      render(<ArticleCardMobile articles={[makeArticle()]} />);
      expect(screen.getByLabelText("매물 메모 추가")).toBeInTheDocument();
      expect(screen.getByLabelText("매물 즐겨찾기 추가")).toBeInTheDocument();
    });

    it("메모 버튼 클릭 → 모달 진입 + 카드 onClick 차단 (stopPropagation)", () => {
      const onRow = vi.fn();
      render(<ArticleCardMobile articles={[makeArticle()]} onRowClick={onRow} />);
      fireEvent.click(screen.getByLabelText("매물 메모 추가"));
      expect(screen.getByRole("dialog", { name: "매물 메모" })).toBeInTheDocument();
      expect(onRow).not.toHaveBeenCalled();
    });

    it("즐겨찾기 클릭 → ★ + 카드 onClick 차단", () => {
      const onRow = vi.fn();
      render(<ArticleCardMobile articles={[makeArticle()]} onRowClick={onRow} />);
      fireEvent.click(screen.getByLabelText("매물 즐겨찾기 추가"));
      expect(screen.getByText("★")).toBeInTheDocument();
      expect(onRow).not.toHaveBeenCalled();
    });

    it("complex_name optional 누락 시 graceful (즐겨찾기 정상 렌더)", () => {
      const noName = makeArticle({ complex_name: undefined });
      render(<ArticleCardMobile articles={[noName]} />);
      expect(screen.getByLabelText("매물 즐겨찾기 추가")).toBeInTheDocument();
    });

    it("카드 본문 클릭 → onRowClick 호출 (액션 외부 영역)", () => {
      const onRow = vi.fn();
      render(<ArticleCardMobile articles={[makeArticle()]} onRowClick={onRow} />);
      fireEvent.click(screen.getByText("101동"));
      expect(onRow).toHaveBeenCalledWith("A001");
    });
  });
});
