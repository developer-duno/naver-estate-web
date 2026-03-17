/**
 * ArticleTable 컴포넌트 테스트 - 매물 행 렌더링, 빈 상태
 * 실행: npx vitest run src/components/__tests__/ArticleTable.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ArticleTable from "../ArticleTable";
import type { Article } from "@/types";

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
});
