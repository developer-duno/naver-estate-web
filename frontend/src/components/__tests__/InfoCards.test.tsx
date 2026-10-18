/**
 * InfoCards 컴포넌트 테스트 — #9 매물 가치 정보행 (동일주소·사진수·분양권 프리미엄)
 * 실행: npx vitest run src/components/__tests__/InfoCards.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import InfoCards from "../article/InfoCards";
import type { Article } from "@/types";

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    article_no: "A001",
    complex_no: "C001",
    trade_type_name: "매매",
    ...overrides,
  };
}

describe("InfoCards — 매물 가치 정보행", () => {
  it("동일주소 매물이 2건 이상이면 가격대와 함께 행 표시", () => {
    render(<InfoCards article={makeArticle({
      same_addr_cnt: 3, same_addr_min_prc: "13억", same_addr_max_prc: "14억",
    })} />);
    expect(screen.getByText("동일주소 매물")).toBeInTheDocument();
    expect(screen.getByText("3건 (13억 ~ 14억)")).toBeInTheDocument();
  });

  it("동일주소 매물이 1건이면 행 미표시 (묶음 아님)", () => {
    render(<InfoCards article={makeArticle({ same_addr_cnt: 1 })} />);
    expect(screen.queryByText("동일주소 매물")).not.toBeInTheDocument();
  });

  it("사진 수가 있으면 '사진 수' 행 표시", () => {
    render(<InfoCards article={makeArticle({ site_image_count: 12 })} />);
    expect(screen.getByText("사진 수")).toBeInTheDocument();
    expect(screen.getByText("12장")).toBeInTheDocument();
  });

  it("분양권 매물이면 프리미엄 행 표시", () => {
    render(<InfoCards article={makeArticle({
      is_presale: true, same_addr_premium_min: "-1000", same_addr_premium_max: "0",
    })} />);
    expect(screen.getByText("분양권 프리미엄")).toBeInTheDocument();
    expect(screen.getByText("-1000 ~ 0")).toBeInTheDocument();
  });

  it("일반 매물(비분양권)은 프리미엄 값이 있어도 행 미표시", () => {
    render(<InfoCards article={makeArticle({
      is_presale: false, same_addr_premium_min: "-1000",
    })} />);
    expect(screen.queryByText("분양권 프리미엄")).not.toBeInTheDocument();
  });
});

describe("InfoCards — #10 매물 상세 정보행", () => {
  it("지하철 도보시간이 있으면 '도보 N분' 행 표시", () => {
    render(<InfoCards article={makeArticle({ walking_time_to_subway: 5 })} />);
    expect(screen.getByText("지하철 도보시간")).toBeInTheDocument();
    expect(screen.getByText("도보 5분")).toBeInTheDocument();
  });

  it("도보시간 0분은 의미 불명확하므로 행 미표시", () => {
    render(<InfoCards article={makeArticle({ walking_time_to_subway: 0 })} />);
    expect(screen.queryByText("지하철 도보시간")).not.toBeInTheDocument();
  });

  it("분양권 유형명이 있으면 '분양권 유형' 행 표시", () => {
    render(<InfoCards article={makeArticle({ isale_right_type_name: "일반분양" })} />);
    expect(screen.getByText("분양권 유형")).toBeInTheDocument();
    expect(screen.getByText("일반분양")).toBeInTheDocument();
  });

  it("일반 매물(분양권 유형명 부재)은 '분양권 유형' 행 미표시", () => {
    render(<InfoCards article={makeArticle()} />);
    expect(screen.queryByText("분양권 유형")).not.toBeInTheDocument();
  });
});

describe("InfoCards — 단지 정보 (세션 429)", () => {
  it("recent_trades_6m 이 있어도 '최근6개월거래' 행 미표시 — 거래 횟수가 아니라 시세 기록 줄 수", () => {
    render(
      <InfoCards
        article={makeArticle()}
        complex={{ complex_no: "C001", complex_name: "테스트단지", recent_trades_6m: 42, jeonse_rate: 60 }}
      />,
    );
    expect(screen.getByText("전세가율")).toBeInTheDocument();
    expect(screen.queryByText("최근6개월거래")).not.toBeInTheDocument();
    expect(screen.queryByText("42건")).not.toBeInTheDocument();
  });

  it("주변시세는 총액(만원)이라 '/평' 을 붙이지 않는다 (세션 471)", () => {
    const { container } = render(
      <InfoCards
        article={makeArticle()}
        complex={{ complex_no: "C001", complex_name: "테스트단지", nearby_median_price: 18000 }}
      />,
    );
    expect(screen.getByText("주변시세")).toBeInTheDocument();
    expect(container.textContent).not.toContain("/평");
  });

  it("월세 매물: 전환율(이 매물)·시도 전환율·법정 상한 + 출처 줄, 판정 라벨 없음 (세션 473)", () => {
    const { container } = render(<InfoCards article={makeArticle({
      trade_type_name: "월세",
      monthly_rent_yield: 12,   // 옛 '수익률 (높음)' 이 다시 나오면 안 된다
      article_rent_conversion_rate: 4.8,
      article_rent_conversion_basis: "네이버 시세 전세가 기준(같은 평형, 2026.10.08)",
      region_rent_conversion_rate: 5.9,
      region_rent_conversion_period: "2026.01",
      region_rent_conversion_name: "경남",
      legal_rent_conversion_cap: 5.0,
      bok_base_rate: 3.0,
    })} />);
    expect(screen.getByText("전월세전환율(이 매물)")).toBeInTheDocument();
    expect(screen.getByText("4.8%")).toBeInTheDocument();
    expect(screen.getByText("경남 전환율(부동산원)")).toBeInTheDocument();
    expect(screen.getByText("5.9%")).toBeInTheDocument();
    expect(screen.getByText("5.0% (기준금리 3.00%+2%p)")).toBeInTheDocument();
    const src = screen.getByTestId("article-standards-source");
    expect(src).toHaveTextContent("한국부동산원 전월세전환율(2026.01)");
    expect(src).toHaveTextContent("주택임대차보호법 제7조의2");
    expect(src).toHaveTextContent("네이버 시세 전세가 기준(같은 평형, 2026.10.08)");
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\(낮음\)|\(높음\)|\(주의\)|월세 수익률/);
  });

  it("전세 매물: 전세가율(매물)에 '(주의)' 없이 + HUG 보증 한도 (세션 473)", () => {
    const { container } = render(<InfoCards article={makeArticle({
      trade_type_name: "전세", article_jeonse_ratio: 83, legal_rent_conversion_cap: 5.0, bok_base_rate: 3.0,
    })} />);
    expect(screen.getByText("83%")).toBeInTheDocument();
    expect(screen.getByText("주택가격의 90%")).toBeInTheDocument();
    expect(screen.queryByText("법정 상한")).toBeNull();       // 월세가 아니면 전환율 상한은 안 보인다
    expect(screen.getByTestId("article-standards-source")).toHaveTextContent("HUG 전세보증금반환보증");
    expect(container.textContent ?? "").not.toMatch(/\(주의\)/);
  });
});
