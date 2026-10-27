/**
 * 소비자 화면 섹션 S0~S3(세션 482 PR 1b) — 정상 1 + 빈 자료(카드 숨김) 1씩, 설계 예시값 그대로 나오는지.
 * 실행: npx vitest run src/components/complex/consumer/__tests__/sections.test.tsx
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import ConsumerHeader from "../ConsumerHeader";
import NeighborhoodSection from "../NeighborhoodSection";
import PriceRangeSection from "../PriceRangeSection";
import PriceTrendSection, { JEONSE_MIN_SPAN, axisRange, trendPoints } from "../PriceTrendSection";
import { END_YM, HOOD, SUBWAY, makeComplex, makeHistory, makeTrend } from "./fixtures";

/** 서버 공개 요약 빵부스러기 — 링크 재료(플래그 false 동안 링크 0 확인용) */
const BREADCRUMB = {
  sido: "대전", sigungu_code: "30200", sigungu_name: "유성구",
  dong_code: "3020012300", dong_name: "봉명동", dong_has_page: true,
};

vi.mock("next/navigation", () => ({ usePathname: () => "/complex/6139" }));

const AREAS = makeComplex().area_prices!;

describe("S0 머리", () => {
  const header = {
    starred: false, onBack: () => {}, onToggleFavorite: () => {}, isCompared: false, compareFull: false, onToggleCompare: () => {},
  };
  const range = { kind: "range" as const, area: 59, period: "6m" as const, min: 15700, max: 18000, ltv: 10990, zoneUnknown: false };
  it("사실 칩 + 한 줄 요약", () => {
    render(<ConsumerHeader complex={makeComplex()} summary={range} {...header} />);
    // 세션 483 PR 3b: 이름은 서버 h1 이 바로 위에 있어 머리 줄에서 뺀다 — 버튼 이름표에만 남는다
    expect(screen.queryByText("자연")).toBeNull();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("button", { name: "자연 비교 추가" })).toBeInTheDocument();
    expect(screen.getByText("1997년 사용승인")).toBeInTheDocument();
    expect(screen.getByText("199세대")).toBeInTheDocument();
    expect(screen.getByText("1개동")).toBeInTheDocument();
    expect(screen.getByTestId("consumer-summary").textContent).toBe(
      "59㎡ 기준 최근 거래 1억 5,700만~1억 8,000만 · 담보대출 한도 최대 약 1억 990만 (가진 집 담보 · 선순위 없을 때 · 참고)",
    );
  });
  it("2년 단계 · 구역 모름 꼬리표(보완 F2·A-5)", () => {
    render(<ConsumerHeader complex={makeComplex()} summary={{ ...range, period: "2y", min: 14700, max: 20000, ltv: 10290, zoneUnknown: true }} {...header} />);
    const t = screen.getByTestId("consumer-summary").textContent ?? "";
    expect(t).toContain("59㎡ 기준 최근 2년 거래 1억 4,700만~2억");
    expect(t.endsWith("(규제지역이면 더 낮아요)")).toBe(true);
  });
  it("직접 입력 단계면 한도 숫자 생략", () => {
    render(<ConsumerHeader complex={makeComplex()} summary={{ kind: "manual" }} {...header} />);
    const t = screen.getByTestId("consumer-summary").textContent ?? "";
    expect(t).toContain("최근 2년 정부 실거래 기록 없음");
    expect(t).not.toMatch(/최대 약|\d억/);
  });
  it("면적 자료 없으면 요약 줄 생략", () => {
    render(<ConsumerHeader complex={makeComplex()} summary={null} {...header} />);
    expect(screen.queryByTestId("consumer-summary")).toBeNull();
  });
});

describe("S1 얼마짜리 집인가", () => {
  const base = { areaPrices: AREAS, selected: 59, onSelect: () => {}, twoYear: { min: 14700, max: 20000 } };

  it("면적 칩 · 2년 막대 · 2년 최저/최고만 — 범위 숫자·공시가·관리비는 서버 '한눈에 보기'로 옮겼다(세션 483 PR 3b)", () => {
    const { container } = render(<PriceRangeSection {...base} />);
    expect(screen.getByTestId("consumer-range-bar")).toBeInTheDocument();
    expect(screen.getByText("2년 최저 1억 4,700만")).toBeInTheDocument();
    expect(screen.getByText("2년 최고 2억")).toBeInTheDocument();
    expect(screen.getByText("노란 띠 = 59㎡ 최근 6개월 거래 범위")).toBeInTheDocument();
    expect(screen.queryByTestId("consumer-range")).toBeNull(); // 큰 범위 숫자 줄 삭제
    expect(container.textContent).not.toMatch(/1억 5,700만|1억 1,300만|약 19만 원|공시가격|관리비/);
    expect(container.textContent).not.toMatch(/중위|1억 7,200만/); // 이 단지 중위값(17200)은 어디에도 없다
  });

  it("거래 없는 면적 칩은 흐리게 '거래 없음'·누를 수 없음 · 다른 면적을 누르면 onSelect", () => {
    const onSelect = vi.fn();
    render(<PriceRangeSection {...base} onSelect={onSelect} />);
    const dim = screen.getByRole("button", { name: /42㎡ · 거래 없음/ });
    expect(dim).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /84㎡/ }));
    expect(onSelect).toHaveBeenCalledWith(84);
  });

  it("거래 목록이 있으면 표 — 직거래는 '직거래'(#773 부터 라이브에 보이던 표 그대로)", () => {
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
  });

  it("거래 목록이 비면 표 생략", () => {
    render(<PriceRangeSection {...base} />);
    expect(screen.queryByTestId("consumer-trades")).toBeNull();
  });

  it("2년 최저=최고(막대 못 그림)면 '2년 거래' 한 줄", () => {
    render(<PriceRangeSection {...base} twoYear={{ min: 17000, max: 17000 }} />);
    expect(screen.queryByTestId("consumer-range-bar")).toBeNull();
    expect(screen.getByText("2년 거래 1억 7,000만")).toBeInTheDocument();
  });

  const empty = AREAS.map((a) => ({ ...a, price_min: null, price_max: null }));
  it("6개월·2년 모두 없으면 '최근 2년 정부 실거래 기록 없음'", () => {
    render(<PriceRangeSection {...base} areaPrices={empty} selected={null} twoYear={null} />);
    expect(screen.getByTestId("consumer-no-range").textContent).toBe("최근 2년 정부 실거래 기록 없음");
    expect(screen.queryByTestId("consumer-range-bar")).toBeNull();
  });

  it("6개월 없고 2년 있으면 '최근 6개월 거래 없음 · 2년 범위' (보완 F5)", () => {
    render(<PriceRangeSection {...base} areaPrices={empty} selected={59} twoYear={{ min: 14700, max: 20000 }} />);
    expect(screen.getByTestId("consumer-no-range").textContent).toBe("최근 6개월 거래 없음 · 2년 범위 1억 4,700만~2억");
  });

  it("2년 답을 받기 전엔 '2년 기록 없음'을 단정하지 않는다", () => {
    render(<PriceRangeSection {...base} areaPrices={empty} selected={59} twoYear={null} twoYearReady={false} />);
    expect(screen.getByTestId("consumer-no-range").textContent).toBe("최근 6개월 거래 없음");
  });

  it("오피스텔은 '정부 실거래 자료를 아직 받지 않아요' (보완 F4)", () => {
    render(<PriceRangeSection {...base} areaPrices={empty} selected={null} twoYear={null} officetel />);
    expect(screen.getByTestId("consumer-no-range").textContent).toBe("오피스텔은 정부 실거래 자료를 아직 받지 않아요");
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
    // 세션 483 PR 3b(결정 24): 지역 흐름 선 그래프 → 한 줄(전세가율은 마지막 달)
    expect(screen.getByTestId("consumer-region-sentence").textContent).toBe(
      "유성구 아파트 2년 중위 매매가 4억→4억 600만 · 전세가율 69.5% · 한국부동산원 전국주택가격동향조사 2024.10~2026.09",
    );
    expect(container.querySelector("[data-testid^='trend-']")).toBeNull(); // 선 그래프 없음
    expect(container.querySelectorAll("svg")).toHaveLength(1); // 띠 그래프만
  });

  it("지역 페이지가 열리기 전(REGION_PAGES_ENABLED=false)엔 허브 링크 0", () => {
    const { container } = render(
      <PriceTrendSection history={null} trend={makeTrend()} endYm={END_YM} breadcrumb={BREADCRUMB} />,
    );
    expect(container.querySelector('a[href^="/region"]')).toBeNull();
  });

  it("축 범위 — 전세가율은 최소 5%p(좁으면 가운데 ±2.5), 그 밖은 최소~최대 + 10% 여백 · 0부터 아님", () => {
    expect(JEONSE_MIN_SPAN).toBe(5);
    expect(axisRange([69.1, 70.1], 5).map((v) => +v.toFixed(2))).toEqual([67.1, 72.1]);
    expect(axisRange([60, 70], 5)).toEqual([59, 71]);
    expect(axisRange([40000, 40600])).toEqual([39940, 40660]);
  });

  it("전세가율 69.1~70.1 이면 y 차이가 그림 칸 높이의 20% 이하(1%p ÷ 5%p) — 과장 없음", () => {
    const items = Array.from({ length: 24 }, (_, i) => ({
      period: `2025${String((i % 12) + 1).padStart(2, "0")}`,
      jeonse_ratio: i === 3 ? 69.1 : i === 17 ? 70.1 : 69.6,
      sale_price_median: 40000,
    }));
    const ys = trendPoints(items, "jeonse_ratio").map((p) => p.y);
    const plot = 96 - 16 - 16;
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(plot * 0.2 + 1e-9);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(plot * 0.19);
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
  it("지하철 3역 그대로 · 동네는 한 줄(칸·집 종류 띠·위험지도 없음 — 세션 483 PR 3b 결정 24)", () => {
    const { container } = render(<NeighborhoodSection stations={SUBWAY.stations} neighborhood={HOOD} breadcrumb={BREADCRUMB} />);
    expect(screen.getByText("갑천역")).toBeInTheDocument();
    expect(screen.getByText("1.1km")).toBeInTheDocument();
    expect(screen.getByText("대전1호선 · 직선거리")).toBeInTheDocument();
    expect(screen.getByTestId("consumer-neighborhood").textContent).toBe(
      `온천2동 사는 사람 5만 4,325명 · 1인 가구 55% · 아파트 40% · ${HOOD.source}`,
    );
    expect(container.textContent).not.toMatch(/위험지도|사업체|단독 52%/);
    expect(container.querySelector('a[href^="/region"]')).toBeNull(); // 플래그 false = 동 페이지 링크 0
  });

  it("동네 없으면 지하철만", () => {
    render(<NeighborhoodSection stations={SUBWAY.stations} neighborhood={null} />);
    expect(screen.queryByTestId("consumer-neighborhood")).toBeNull();
    expect(screen.getByTestId("consumer-subway")).toBeInTheDocument();
  });

  it("둘 다 없으면 카드 숨김", () => {
    const { container } = render(<NeighborhoodSection stations={[]} neighborhood={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
