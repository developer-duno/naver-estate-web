/**
 * ArticleTable 컴포넌트 테스트 - 매물 행 렌더링, 빈 상태
 * 실행: npx vitest run src/components/__tests__/ArticleTable.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ArticleTable from "../ArticleTable";
import type { Article } from "@/types";

beforeEach(() => {
  localStorage.clear();
});

const sampleArticle: Article = {
  article_no: "A001",
  complex_no: "C001",
  trade_type_name: "매매",
  building_name: "101동",
  floor_info: "10",
  deal_or_warrant_prc: "5억",
  area2_m2: 84,
  area2_pyeong: 25.4,
  direction: "남향",
  numeric_price: 50000,
};

describe("ArticleTable", () => {
  it("매물 행 렌더링", () => {
    render(<ArticleTable articles={[sampleArticle]} />);
    expect(screen.getByText("101동")).toBeInTheDocument();
  });

describe("ArticleTable — 추가", () => {
  it("층 정보 표시", () => {
    render(<ArticleTable articles={[sampleArticle]} />);
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("가격 표시", () => {
    render(<ArticleTable articles={[sampleArticle]} />);
    expect(screen.getByText("5억")).toBeInTheDocument();
  });

  it("면적 헤더 존재", () => {
    render(<ArticleTable articles={[sampleArticle]} />);
    expect(screen.getByText("면적")).toBeInTheDocument();
  });
});


  it("거래유형 뱃지 표시", () => {
    render(<ArticleTable articles={[sampleArticle]} />);
    expect(screen.getByText("매매")).toBeInTheDocument();
  });

  it("빈 매물 목록", () => {
    render(<ArticleTable articles={[]} />);
    expect(screen.getByText(/매물이 없습니다|결과가 없습니다|없습니다|No/i)).toBeInTheDocument();
  });

  it("방향 표시", () => {
    render(<ArticleTable articles={[sampleArticle]} />);
    expect(screen.getByText("남향")).toBeInTheDocument();
  });

  it("컬럼 헤더 표시", () => {
    render(<ArticleTable articles={[sampleArticle]} />);
    expect(screen.getByText("거래")).toBeInTheDocument();
    expect(screen.getByText("동")).toBeInTheDocument();
  });

  it("필터 활성 시 필터 초기화 버튼 노출 + 콜백 호출", () => {
    const onReset = vi.fn();
    render(<ArticleTable articles={[]} hasActiveFilters onResetFilters={onReset} />);
    const btn = screen.getByText("필터 초기화");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("필터 없을 때는 갱신 안내 표시 (필터 초기화 버튼 없음)", () => {
    render(<ArticleTable articles={[]} />);
    expect(screen.queryByText("필터 초기화")).toBeNull();
    expect(screen.getByText(/데이터 갱신/)).toBeInTheDocument();
  });

  // B-1 Phase 1: 액션 열 (즐겨찾기) 회귀 가드 (메모 폐기 후 즐겨찾기 단독)
  describe("B-1 액션 열 — 즐겨찾기 버튼", () => {
    it("즐겨찾기(☆) 버튼 렌더링", () => {
      render(<ArticleTable articles={[sampleArticle]} />);
      expect(screen.getByLabelText("매물 즐겨찾기 추가")).toBeInTheDocument();
    });

    it("즐겨찾기 클릭 → ★ + 행 onClick 차단", () => {
      const onRow = vi.fn();
      render(<ArticleTable articles={[sampleArticle]} onRowClick={onRow} />);
      fireEvent.click(screen.getByLabelText("매물 즐겨찾기 추가"));
      expect(screen.getByText("★")).toBeInTheDocument();
      expect(onRow).not.toHaveBeenCalled();
    });

    it("complex_name optional 누락 시 graceful (button 정상 렌더)", () => {
      const noName: Article = { ...sampleArticle, complex_name: undefined };
      render(<ArticleTable articles={[noName]} />);
      expect(screen.getByLabelText("매물 즐겨찾기 추가")).toBeInTheDocument();
    });

    it("행 클릭 → onRowClick 정상 동작 (액션 열 외부)", () => {
      const onRow = vi.fn();
      render(<ArticleTable articles={[sampleArticle]} onRowClick={onRow} />);
      fireEvent.click(screen.getByText("101동"));
      expect(onRow).toHaveBeenCalledWith("A001");
    });
  });
});
