/**
 * PriceHeader 컴포넌트 테스트 — #9 매물 가치 뱃지 (가격변동·직거래)
 * 실행: npx vitest run src/components/__tests__/PriceHeader.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PriceHeader from "../article/PriceHeader";
import type { Article } from "@/types";

// 테스트 팩토리
function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    article_no: "A001",
    complex_no: "C001",
    trade_type_name: "매매",
    deal_or_warrant_prc: "5억",
    ...overrides,
  };
}

describe("PriceHeader — 매물 가치 뱃지", () => {
  it("price_change_state=INCREASE면 '가격상승' 뱃지 표시", () => {
    render(<PriceHeader article={makeArticle({ price_change_state: "INCREASE" })} />);
    expect(screen.getByText("가격상승")).toBeInTheDocument();
  });

  it("price_change_state=DECREASE면 '가격하락' 뱃지 표시", () => {
    render(<PriceHeader article={makeArticle({ price_change_state: "DECREASE" })} />);
    expect(screen.getByText("가격하락")).toBeInTheDocument();
  });

  it("price_change_state=SAME이면 변동 뱃지 미표시", () => {
    render(<PriceHeader article={makeArticle({ price_change_state: "SAME" })} />);
    expect(screen.queryByText("가격상승")).not.toBeInTheDocument();
    expect(screen.queryByText("가격하락")).not.toBeInTheDocument();
  });

  it("is_direct_trade=true면 '직거래' 뱃지 표시", () => {
    render(<PriceHeader article={makeArticle({ is_direct_trade: true })} />);
    expect(screen.getByText("직거래")).toBeInTheDocument();
  });

  it("가치 필드가 없으면 가치 뱃지 없이 정상 렌더", () => {
    render(<PriceHeader article={makeArticle()} />);
    expect(screen.queryByText("직거래")).not.toBeInTheDocument();
    expect(screen.getByText("5억")).toBeInTheDocument();
  });
});

describe("PriceHeader — #10 거래완료 뱃지", () => {
  it("trade_complete=true면 '거래완료' 뱃지 표시", () => {
    render(<PriceHeader article={makeArticle({ trade_complete: true })} />);
    expect(screen.getByText("거래완료")).toBeInTheDocument();
  });

  it("trade_complete=false면 '거래완료' 뱃지 미표시", () => {
    render(<PriceHeader article={makeArticle({ trade_complete: false })} />);
    expect(screen.queryByText("거래완료")).not.toBeInTheDocument();
  });

  it("trade_complete 미설정이면 '거래완료' 뱃지 미표시", () => {
    render(<PriceHeader article={makeArticle()} />);
    expect(screen.queryByText("거래완료")).not.toBeInTheDocument();
  });
});
