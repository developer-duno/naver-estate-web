/**
 * S4 내 돈으로 가능한가(참고 계산) — 설계 예시값 · 두 모드(보완 F1, 결정 11) · 집값 단계(보완 F2, 결정 12) · 규제 문구(F7) ·
 * 금지 낱말 0(미분양 FundingPlanner.test.tsx:342 답습) · 링크 2곳 · 입력값이 어디로도 안 나간다(fetch 0).
 * 실행: npx vitest run src/components/complex/consumer/__tests__/LoanEstimateSection.test.tsx
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { AreaPrice } from "@/types";
import LoanEstimateSection from "../LoanEstimateSection";
import { makeComplex } from "./fixtures";

const AREAS = makeComplex().area_prices!;
const base = { areaPrices: AREAS, selected: 59, onSelect: () => {}, zone: "normal" as const, sido: "대전", regionLabel: "유성구" };
/** 서울 규제 단지 — 59㎡ 최근 6개월 10억~12억(가짜 자료) */
const SEOUL: AreaPrice[] = [{ area_m2: 59, households: 100, price_median: null, trade_count: 2, price_min: 100000, price_max: 120000, trades: [] }];
const NO_RANGE: AreaPrice[] = AREAS.map((a) => ({ ...a, price_min: null, price_max: null }));

function type(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
const result = () => screen.getByTestId("consumer-loan-result").textContent ?? "";

afterEach(() => vi.restoreAllMocks());

describe("LoanEstimateSection — 이미 가진 집(기본)", () => {
  it("설계 예시 — 6139 보수적 1억 5,700만 · 유성구 비규제 70% = 1억 990만 · 선순위 5,000만 → 약 5,990만 · 지방 상한 없음", () => {
    render(<LoanEstimateSection {...base} />);
    expect(screen.getByRole("button", { name: "이미 가진 집으로" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "보수적 1억 5,700만" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("consumer-loan-basis").textContent).toContain("생활안정자금 기준 · 1주택자 · 수도권·규제지역은 최대 1억(금융위 2025-06-28)");
    expect(result()).toContain("유성구 비규제 · 담보가치의 70%");
    expect(result()).toContain("1억 990만");
    type(/선순위/, "5000");
    expect(result()).toContain("− 선순위 대출5,000만");
    expect(result()).toContain("약 5,990만");
    expect(result()).not.toContain("생활안정자금 상한");
    expect(result()).toContain("지방 주택은 1억 상한 없이 은행마다 달라요");
    expect(screen.queryByText("수도권·규제지역 2주택 이상은 취급 금지")).toBeNull(); // 대전 비규제엔 안 붙인다
  });

  it("설계 예시 — 서울 규제 10억 · 40% = 4억 − 선순위 2억 = 2억 → 1억 상한 → 약 1억 · 2주택 안내", () => {
    render(<LoanEstimateSection {...base} areaPrices={SEOUL} zone="overheated" sido="서울" regionLabel="강남구" />);
    type(/선순위/, "20000");
    expect(result()).toContain("강남구는 규제지역 — 담보가치의 40%4억"); // 가진 집엔 가격별 상한 문구 없음
    expect(result()).toContain("생활안정자금 상한 · 수도권·규제지역최대 1억");
    expect(result()).toContain("추가로 가능한 담보대출(담보 기준) (소득 확인 전)약 1억");
    expect(screen.getByText("수도권·규제지역 2주택 이상은 취급 금지")).toBeInTheDocument();
  });

  it("선순위 칸 아래 '기존 대출 월 상환' 안내", () => {
    render(<LoanEstimateSection {...base} />);
    expect(screen.getByText("선순위 대출의 월 상환액은 아래 ‘기존 대출 월 상환’에 넣어 주세요")).toBeInTheDocument();
  });

  it("높은 쪽 집값을 고르면 그 값으로", () => {
    render(<LoanEstimateSection {...base} />);
    fireEvent.click(screen.getByRole("button", { name: "1억 8,000만" }));
    expect(result()).toContain("1억 2,600만"); // 18000 × 0.7
  });

  it("선순위가 한도보다 크면 '지금은 담보 여력이 없어요'", () => {
    render(<LoanEstimateSection {...base} />);
    type(/선순위/, "20000");
    expect(screen.getByText("지금은 담보 여력이 없어요")).toBeInTheDocument();
  });

  it("소득 빈칸이면 '(소득 확인 전)' · 연소득만 넣으면 금리 안내 · 금리까지 넣으면 소득 기준·둘 중 작은 값·월 상환", () => {
    render(<LoanEstimateSection {...base} />);
    expect(result()).toContain("(소득 확인 전)");
    type(/연소득/, "1000");
    expect(screen.getByText("금리를 넣으면 소득 기준도 계산")).toBeInTheDocument();
    type(/금리/, "4");
    expect(result()).toContain("스트레스 금리 4.75%");
    expect(result()).toContain("둘 중 작은 값");
    expect(result()).toContain("월 상환 · 30년 원리금균등 · 연 4%");
    expect(result()).not.toContain("(소득 확인 전)");
  });

  it("구역 모름 문구 · 지역 이름이 없으면 '이 단지 지역은'(조사)", () => {
    const { rerender } = render(<LoanEstimateSection {...base} zone={null} />);
    expect(result()).toContain("규제지역이면 40%로 줄어요");
    rerender(<LoanEstimateSection {...base} zone="overheated" regionLabel={null} />);
    expect(result()).toContain("이 단지 지역은 규제지역");
    expect(result()).not.toContain("지역는");
  });
});

describe("LoanEstimateSection — 이 집을 사려고", () => {
  it("6139 사려는 집 → 1억 990만 · 선순위 칸 숨김 · 무주택 구입 기준", () => {
    render(<LoanEstimateSection {...base} />);
    fireEvent.click(screen.getByRole("button", { name: "이 집을 사려고" }));
    expect(screen.queryByLabelText(/선순위/)).toBeNull();
    expect(screen.getByTestId("consumer-loan-basis").textContent).toContain("무주택 구입 기준");
    expect(result()).toContain("구입 담보대출 한도(담보 기준) (소득 확인 전)약 1억 990만");
    expect(result()).not.toContain("지방 주택은");
  });

  it("규제 문구에 가격별 상한 포함 · 수도권 6억 표기 · 1억 상한 없음", () => {
    render(<LoanEstimateSection {...base} areaPrices={SEOUL} zone="overheated" sido="서울" regionLabel="강남구" />);
    fireEvent.click(screen.getByRole("button", { name: "이 집을 사려고" }));
    expect(result()).toContain("강남구는 규제지역 — 담보가치의 40%, 15억 초과는 4억·25억 초과는 2억까지 · 수도권 최대 6억");
    expect(result()).toContain("약 4억");
    expect(result()).not.toContain("생활안정자금 상한");
  });
});

describe("LoanEstimateSection — 집값 단계(결정 12)", () => {
  it("6개월 범위가 없으면 2년 범위 칩 — '최근 2년' 라벨", () => {
    render(<LoanEstimateSection {...base} areaPrices={NO_RANGE} twoYear={{ min: 14700, max: 20000 }} />);
    expect(screen.getByText(/최근 2년 거래 범위에서 고르기/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "보수적 1억 4,700만" })).toHaveAttribute("aria-pressed", "true");
    expect(result()).toContain("1억 290만"); // 14700 × 0.7
  });

  it("2년도 없으면 직접 입력 — 카드는 보이고 공시가격은 참고 글자만(값을 채우지 않는다)", () => {
    render(<LoanEstimateSection {...base} areaPrices={NO_RANGE} twoYear={null} officialManwon={11300} />);
    expect(screen.getByTestId("consumer-loan")).toBeInTheDocument();
    expect(screen.getByText("공시가격 1억 1,300만 · 시세보다 낮을 수 있어요")).toBeInTheDocument();
    expect(screen.getByLabelText(/집값/)).toHaveValue("");
    expect(result()).toContain("집값을 넣으면 계산해요");
    type(/집값/, "20000");
    expect(result()).toContain("1억 4,000만"); // 20000 × 0.7
  });

  it("직접 입력 단계 + 공시가격 없음 → 참고 글자 없음(15111 같은 단지)", () => {
    render(<LoanEstimateSection {...base} areaPrices={[]} selected={null} twoYear={null} officialManwon={null} />);
    expect(screen.getByTestId("consumer-loan-manual")).toBeInTheDocument();
    expect(screen.queryByText(/공시가격/)).toBeNull();
  });
});

describe("LoanEstimateSection — 공통", () => {
  it("금지 낱말 0 — 두 모드 모두, 모든 입력을 넣은 상태에서", () => {
    const BANNED = ["후순위로 해결", "연결", "신청하면", "대부", "해결", "보장", "승인 보장", "최저 금리", "무심사"];
    render(<LoanEstimateSection {...base} />);
    type(/선순위/, "5000");
    type(/임차보증금/, "1000");
    type(/연소득/, "4800");
    type(/기존 대출 월 상환/, "30");
    type(/금리/, "4.2");
    const ownText = screen.getByTestId("consumer-loan").textContent ?? "";
    fireEvent.click(screen.getByRole("button", { name: "이 집을 사려고" }));
    const buyText = screen.getByTestId("consumer-loan").textContent ?? "";
    for (const w of BANNED) {
      expect(ownText, w).not.toContain(w);
      expect(buyText, w).not.toContain(w);
    }
  });

  it("링크 2곳 — 새 탭 · noopener noreferrer · 기준 글자 · 저장 안 함 안내", () => {
    render(<LoanEstimateSection {...base} />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["https://finlife.fss.or.kr", "https://portal.kfb.or.kr"]);
    for (const l of links) {
      expect(l).toHaveAttribute("target", "_blank");
      expect(l).toHaveAttribute("rel", "noopener noreferrer");
    }
    expect(screen.getByText(/은행 기준 · 2026년 10월 규정 · 입력값은 저장되지 않아요/)).toBeInTheDocument();
  });

  it("입력해도 서버 요청 0", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<LoanEstimateSection {...base} />);
    type(/선순위/, "5000");
    type(/연소득/, "4800");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
