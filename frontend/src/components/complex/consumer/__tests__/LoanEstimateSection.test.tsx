/**
 * S4 내 돈으로 가능한가(참고 계산) — 설계 예시값 · 규제 문구 · 금지 낱말 0(미분양 FundingPlanner.test.tsx:342 답습) ·
 * 링크 2곳 · 입력값이 어디로도 안 나간다(fetch 0).
 * 실행: npx vitest run src/components/complex/consumer/__tests__/LoanEstimateSection.test.tsx
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import LoanEstimateSection from "../LoanEstimateSection";
import { makeComplex } from "./fixtures";

const AREAS = makeComplex().area_prices!;
const base = { areaPrices: AREAS, selected: 59, onSelect: () => {}, zone: "normal" as const, sido: "대전", regionLabel: "유성구" };

function type(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

afterEach(() => vi.restoreAllMocks());

describe("LoanEstimateSection", () => {
  it("설계 예시 — 보수적 1억 5,700만 · 유성구 비규제 70% = 1억 990만 · 선순위 5,000만 → 약 5,990만", () => {
    render(<LoanEstimateSection {...base} />);
    expect(screen.getByRole("button", { name: "보수적 1억 5,700만" })).toHaveAttribute("aria-pressed", "true");
    const result = screen.getByTestId("consumer-loan-result");
    expect(result.textContent).toContain("유성구 비규제 · 담보가치의 70%");
    expect(result.textContent).toContain("1억 990만");
    type(/선순위/, "5000");
    expect(result.textContent).toContain("− 선순위 대출5,000만");
    expect(result.textContent).toContain("약 5,990만");
  });

  it("높은 쪽 집값을 고르면 그 값으로", () => {
    render(<LoanEstimateSection {...base} />);
    fireEvent.click(screen.getByRole("button", { name: "1억 8,000만" }));
    expect(screen.getByTestId("consumer-loan-result").textContent).toContain("1억 2,600만"); // 18000 × 0.7
  });

  it("선순위가 한도보다 크면 '지금은 담보 여력이 없어요'", () => {
    render(<LoanEstimateSection {...base} />);
    type(/선순위/, "20000");
    expect(screen.getByText("지금은 담보 여력이 없어요")).toBeInTheDocument();
  });

  it("연소득만 넣으면 금리 안내 · 금리까지 넣으면 소득 기준·둘 중 작은 값·월 상환", () => {
    render(<LoanEstimateSection {...base} />);
    type(/연소득/, "1000");
    expect(screen.getByText("금리를 넣으면 소득 기준도 계산")).toBeInTheDocument();
    type(/금리/, "4");
    const text = screen.getByTestId("consumer-loan-result").textContent ?? "";
    expect(text).toContain("스트레스 금리 4.75%");
    expect(text).toContain("둘 중 작은 값");
    expect(text).toContain("월 상환 · 30년 원리금균등 · 연 4%");
  });

  it("규제지역 · 구역 모름 문구", () => {
    const { rerender } = render(<LoanEstimateSection {...base} zone="overheated" sido="서울" regionLabel="강남구" />);
    expect(screen.getByTestId("consumer-loan-result").textContent).toContain("강남구는 규제지역 — 담보가치의 40% · 수도권 최대 6억");
    rerender(<LoanEstimateSection {...base} zone={null} />);
    expect(screen.getByTestId("consumer-loan-result").textContent).toContain("규제지역이면 40%로 줄어요");
  });

  it("금지 낱말 0 — 모든 입력을 넣은 상태에서", () => {
    const BANNED = ["후순위로 해결", "연결", "신청하면", "대부", "해결", "보장", "승인 보장", "최저 금리", "무심사"];
    render(<LoanEstimateSection {...base} />);
    type(/선순위/, "5000");
    type(/임차보증금/, "1000");
    type(/연소득/, "4800");
    type(/기존 대출 월 상환/, "30");
    type(/금리/, "4.2");
    const text = screen.getByTestId("consumer-loan").textContent ?? "";
    for (const w of BANNED) expect(text, w).not.toContain(w);
  });

  it("링크 2곳 — 새 탭 · noopener noreferrer · 기준 글자 · 저장 안 함 안내", () => {
    render(<LoanEstimateSection {...base} />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["https://finlife.fss.or.kr", "https://portal.kfb.or.kr"]);
    for (const l of links) {
      expect(l).toHaveAttribute("target", "_blank");
      expect(l).toHaveAttribute("rel", "noopener noreferrer");
    }
    expect(screen.getByText(/무주택 · 은행 기준 · 2026년 10월 규정 · 입력값은 저장되지 않아요/)).toBeInTheDocument();
  });

  it("입력해도 서버 요청 0", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<LoanEstimateSection {...base} />);
    type(/선순위/, "5000");
    type(/연소득/, "4800");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("선택 면적에 범위가 없으면 카드 숨김", () => {
    const { container } = render(<LoanEstimateSection {...base} selected={42} />);
    expect(container).toBeEmptyDOMElement();
  });
});
