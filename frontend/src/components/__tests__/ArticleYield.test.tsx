/**
 * 수익률 표시 테스트 — ArticleTable + ArticleCardMobile에서 수익률/뱃지 렌더링
 * 실행: npx vitest run src/components/__tests__/ArticleYield.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ArticleCardMobile from "../ArticleCardMobile";
import type { Article } from "@/types";

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
    article_feature_desc: "초역세권",
    ...overrides,
  };
}

describe("ArticleCardMobile 수익률/뱃지", () => {
  it("월세 매물에 수익률 표시", () => {
    const art = makeArticle({
      trade_type_name: "월세",
      numeric_price: 5000,
      numeric_rent_price: 50,
      monthly_rent_yield: 12.0,
    });
    render(<ArticleCardMobile articles={[art]} />);
    expect(screen.getByText(/수익 12%/)).toBeInTheDocument();
  });

  it("전세 매물에 전세가율 표시", () => {
    const art = makeArticle({
      trade_type_name: "전세",
      numeric_price: 30000,
      article_jeonse_ratio: 60.0,
    });
    render(<ArticleCardMobile articles={[art]} />);
    expect(screen.getByText(/전세 60%/)).toBeInTheDocument();
  });

  it("매매 매물은 수익률 미표시", () => {
    const art = makeArticle({ trade_type_name: "매매" });
    render(<ArticleCardMobile articles={[art]} />);
    expect(screen.queryByText(/수익 \d+%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/전세 \d+%/)).not.toBeInTheDocument();
  });

  it("오피스텔 매물에 유형 뱃지 표시", () => {
    const art = makeArticle({ article_real_estate_type_name: "오피스텔" });
    render(<ArticleCardMobile articles={[art]} />);
    expect(screen.getByText("오피스텔")).toBeInTheDocument();
  });

  it("아파트 매물은 유형 뱃지 미표시", () => {
    const art = makeArticle({ article_real_estate_type_name: "아파트" });
    render(<ArticleCardMobile articles={[art]} />);
    // 아파트는 뱃지로 표시되지 않음 (텍스트 자체가 렌더링 안 됨)
    expect(screen.queryByText("아파트")).not.toBeInTheDocument();
  });

  it("유형명이 없으면 뱃지 미표시", () => {
    const art = makeArticle({ article_real_estate_type_name: undefined });
    render(<ArticleCardMobile articles={[art]} />);
    // border 클래스를 가진 매물유형 뱃지가 없어야 함
    const container = screen.getByText("매매").closest("div")?.parentElement;
    const estateBadges = container?.querySelectorAll(".border") ?? [];
    // 체크박스 border 등 제외하고 매물유형 뱃지만 확인
    expect(estateBadges.length).toBe(0);
  });
});
