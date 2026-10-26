/**
 * 소비자 화면 섹션 S0~S3(세션 482 PR 1b) — 정상 1 + 빈 자료(카드 숨김) 1씩, 설계 예시값 그대로 나오는지.
 * 실행: npx vitest run src/components/complex/consumer/__tests__/sections.test.tsx
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import ConsumerHeader from "../ConsumerHeader";
import NeighborhoodSection from "../NeighborhoodSection";
import PriceRangeSection from "../PriceRangeSection";
import PriceTrendSection from "../PriceTrendSection";
import { END_YM, HOOD, KAPT, OFFICIAL, SUBWAY, makeComplex, makeHistory, makeTrend } from "./fixtures";

vi.mock("next/navigation", () => ({ usePathname: () => "/complex/6139" }));

const AREAS = makeComplex().area_prices!;

describe("S0 머리", () => {
  const header = {
    starred: false, onBack: () => {}, onToggleFavorite: () => {}, isCompared: false, compareFull: false, onToggleCompare: () => {},
  };
  it("사실 칩 + 한 줄 요약", () => {
    render(<ConsumerHeader complex={makeComplex()} summary={{ area: 59, min: 15700, max: 18000, ltv: 10990 }} {...header} />);
    expect(screen.getByRole("heading", { name: "자연" })).toBeInTheDocument();
    expect(screen.getByText("1997년 사용승인")).toBeInTheDocument();
    expect(screen.getByText("199세대")).toBeInTheDocument();
    expect(screen.getByText("1개동")).toBeInTheDocument();
    expect(screen.getByTestId("consumer-summary").textContent).toBe(
      "59㎡ 기준 최근 거래 1억 5,700만~1억 8,000만 · 담보대출 한도 최대 약 1억 990만 (선순위 없을 때 · 참고)",
    );
  });
  it("면적 자료 없으면 요약 줄 생략", () => {
    render(<ConsumerHeader complex={makeComplex()} summary={null} {...header} />);
    expect(screen.queryByTestId("consumer-summary")).toBeNull();
  });
});

describe("S1 얼마짜리 집인가", () => {
  const base = { areaPrices: AREAS, selected: 59, onSelect: () => {}, twoYear: { min: 14700, max: 20000 }, official: OFFICIAL, kapt: KAPT, rangeSource: "출처글자" };

  it("설계 예시값 — 범위·3건·2년 막대·공시 63~72%·관리비 약 19만 원 · 중위 글자 0", () => {
    const { container } = render(<PriceRangeSection {...base} />);
    expect(screen.getByTestId("consumer-range").textContent).toBe("1억 5,700만 ~ 1억 8,000만");
    expect(screen.getByText("최근 6개월 중개거래 3건 · 국토교통부 실거래")).toBeInTheDocument();
    expect(screen.getByText("2년 최저 1억 4,700만")).toBeInTheDocument();
    expect(screen.getByText("2년 최고 2억")).toBeInTheDocument();
    expect(screen.getByText("1억 1,300만")).toBeInTheDocument();
    expect(screen.getByText(/실거래의 63~72%/)).toBeInTheDocument();
    expect(screen.getByText("약 19만 원")).toBeInTheDocument();
    expect(screen.getByText(/2026\.07 K-apt/)).toBeInTheDocument();
    expect(screen.getByText("출처글자")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/중위|1억 7,200만/); // 이 단지 중위값(17200)은 어디에도 없다
    expect(screen.queryByTestId("consumer-trades")).toBeNull(); // 거래 목록이 비면 표 생략
  });

  it("거래 없는 면적 칩은 흐리게 '거래 없음'·누를 수 없음 · 다른 면적을 누르면 onSelect", () => {
    const onSelect = vi.fn();
    render(<PriceRangeSection {...base} onSelect={onSelect} />);
    const dim = screen.getByRole("button", { name: /42㎡ · 거래 없음/ });
    expect(dim).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /84㎡/ }));
    expect(onSelect).toHaveBeenCalledWith(84);
  });

  it("거래 목록이 있으면 표 — 직거래는 '직거래'", () => {
    const areas = makeComplex({
      area_prices: [{
        ...AREAS[0],
        trades: [
          { price: 17200, date: "2026-06-21", floor: 5, direct: false },
          { price: 14000, date: "2026-06-02", floor: 2, direct: true },
        ],
      }],
    }).area_prices!;
    render(<PriceRangeSection {...base} areaPrices={areas} />);
    const table = screen.getByTestId("consumer-trades");
    expect(within(table).getByText("2026.06.21")).toBeInTheDocument();
    expect(within(table).getByText("5층")).toBeInTheDocument();
    expect(within(table).getByText("직거래")).toBeInTheDocument();
    expect(screen.getByText("최근 6개월 중개거래 1건 · 국토교통부 실거래")).toBeInTheDocument();
  });

  it("면적 자료가 하나도 없으면 안내 문장 + 공시가·관리비 상자만(비율 없음)", () => {
    const empty = AREAS.map((a) => ({ ...a, price_min: null, price_max: null }));
    render(<PriceRangeSection {...base} areaPrices={empty} selected={null} twoYear={null} />);
    expect(screen.getByText("이 단지의 정부 실거래 기록이 아직 없어요")).toBeInTheDocument();
    expect(screen.queryByTestId("consumer-range")).toBeNull();
    expect(screen.getByText("1억 1,300만")).toBeInTheDocument(); // 대표 평형(호수 최다)
    expect(screen.queryByText(/실거래의/)).toBeNull();
  });
});

describe("S2 어떻게 변해 왔나", () => {
  it("띠 7개(1건 달은 점) · 지역 문장 설계 예시 그대로", () => {
    const { container } = render(<PriceTrendSection history={makeHistory()} trend={makeTrend()} endYm={END_YM} />);
    const bands = screen.getByTestId("consumer-bands");
    expect(bands.querySelectorAll("[data-month]")).toHaveLength(7);
    expect(bands.querySelectorAll("circle")).toHaveLength(2); // 202512·202602 = 1건
    expect(bands.querySelector('[data-month="202501"]')).toBeNull(); // 빈 달은 비움
    expect(bands.textContent).toContain("24.11");
    expect(bands.textContent).toContain("26.10");
    expect(screen.getByTestId("consumer-region-sentence").textContent).toBe(
      "유성구 아파트는 2년 동안 중위 매매가 4억→4억 600만 · 전세가율 69.2%→69.5%",
    );
    expect(container.textContent).toContain("한국부동산원 전국주택가격동향조사 2024.10~2026.09");
  });

  it("둘 다 비면 카드 숨김", () => {
    const { container } = render(
      <PriceTrendSection history={{ ...makeHistory(), months: [], two_year: null }} trend={{ ...makeTrend(), items: [] }} endYm={END_YM} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("지역만 있으면 띠 없이 지역만", () => {
    render(<PriceTrendSection history={null} trend={makeTrend()} endYm={END_YM} />);
    expect(screen.queryByTestId("consumer-bands")).toBeNull();
    expect(screen.getByTestId("consumer-region-sentence")).toBeInTheDocument();
  });
});

describe("S3 주변은 어떤가", () => {
  it("지하철 3역 · 동네 숫자 · 위험 칩 2", () => {
    render(<NeighborhoodSection stations={SUBWAY.stations} neighborhood={HOOD} />);
    expect(screen.getByText("갑천역")).toBeInTheDocument();
    expect(screen.getByText("1.1km")).toBeInTheDocument();
    expect(screen.getByText("대전1호선 · 직선거리")).toBeInTheDocument();
    expect(screen.getByText("5만 4,325명")).toBeInTheDocument();
    expect(screen.getByText(/평균 36세/)).toBeInTheDocument();
    expect(screen.getByText("55%")).toBeInTheDocument();
    expect(screen.getByText("사업체 4,819곳")).toBeInTheDocument();
    expect(screen.getByText("2004년 이전 집")).toBeInTheDocument();
    expect(screen.getByText("아파트 40% · 오피스텔 1% · 다세대 2% · 단독 52%")).toBeInTheDocument();
    expect(screen.getByText("홍수 위험지도 영향 동")).toBeInTheDocument();
    expect(screen.getByText("산사태 위험지도 영향 동")).toBeInTheDocument();
    expect(screen.getByText(HOOD.source)).toBeInTheDocument();
  });

  it("위험 영향 없으면 칩 없음", () => {
    render(<NeighborhoodSection stations={[]} neighborhood={{ ...HOOD, flood: { affected: false }, landslide: null }} />);
    expect(screen.queryByText(/위험지도 영향 동/)).toBeNull();
    expect(screen.queryByTestId("consumer-subway")).toBeNull();
  });

  it("둘 다 없으면 카드 숨김", () => {
    const { container } = render(<NeighborhoodSection stations={[]} neighborhood={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
