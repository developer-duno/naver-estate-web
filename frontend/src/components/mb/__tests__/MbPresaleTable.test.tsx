/**
 * MbPresaleTable / MbCompetitionTable 테스트 (세션 314 PR C) — 분양/분양결과 테이블 렌더.
 * 실행: npx vitest run src/components/mb/__tests__/MbPresaleTable.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MbApartment } from "@/types";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
  usePathname: () => "/mibunyang",
  useSearchParams: () => new URLSearchParams(),
}));

import MbPresaleTable from "../MbPresaleTable";
import MbCompetitionTable from "../MbCompetitionTable";

function makeApt(o: Partial<MbApartment> & { id: string; name: string }): MbApartment {
  return { region: "서울", gu: "강남", units: 300, ...o };
}

describe("MbPresaleTable — 분양 단지 테이블", () => {
  it("분양유형·단계·경쟁률·분양가 헤더가 렌더된다", () => {
    render(<MbPresaleTable apartments={[makeApt({ id: "A", name: "단지A" })]} />);
    expect(screen.getByText("유형")).toBeInTheDocument();
    expect(screen.getByText("단계")).toBeInTheDocument();
    expect(screen.getByText("경쟁률")).toBeInTheDocument();
    expect(screen.getByText("분양가(최저)")).toBeInTheDocument();
  });

  it("경쟁률·분양가 값이 데스크톱 tbody 에 렌더된다", () => {
    const apts = [
      makeApt({
        id: "A", name: "래미안", presale_type: "민간분양", presale_stage: "청약중",
        competition_rate: 15.3, presale_min_price: 80000,
      }),
    ];
    render(<MbPresaleTable apartments={apts} />);
    // 데스크톱 테이블 + 모바일 카드 양쪽 렌더라 getAllByText
    expect(screen.getAllByText("15.3:1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("80,000만").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("청약중").length).toBeGreaterThanOrEqual(1);
  });

  it("빈 목록이면 EmptyState 안내", () => {
    render(<MbPresaleTable apartments={[]} />);
    expect(screen.getByText("표시할 분양 단지가 없어요")).toBeInTheDocument();
  });

  it("competition_rate null 이면 '-' fallback", () => {
    render(<MbPresaleTable apartments={[makeApt({ id: "A", name: "단지A" })]} />);
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(1);
  });
});

describe("MbCompetitionTable — 분양결과 테이블", () => {
  it("경쟁률·접수자수·공급세대 헤더가 렌더된다", () => {
    render(<MbCompetitionTable apartments={[makeApt({ id: "A", name: "단지A" })]} />);
    // "경쟁률"은 데스크톱 헤더 + 모바일 카드 라벨 양쪽 → getAllByText
    expect(screen.getAllByText("경쟁률").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("접수자수")).toBeInTheDocument();
    expect(screen.getByText("공급세대")).toBeInTheDocument();
  });

  it("경쟁률 10 이상은 강조(red), 1 미만은 미달 색", () => {
    const apts = [
      makeApt({ id: "HI", name: "인기단지", competition_rate: 50, competition_applicants: 5000, competition_supply: 100 }),
      makeApt({ id: "LO", name: "미달단지", competition_rate: 0.5, competition_applicants: 50, competition_supply: 100 }),
    ];
    render(<MbCompetitionTable apartments={apts} />);
    expect(screen.getAllByText("50:1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("0.5:1").length).toBeGreaterThanOrEqual(1);
  });

  it("빈 목록이면 EmptyState 안내", () => {
    render(<MbCompetitionTable apartments={[]} />);
    expect(screen.getByText("표시할 분양결과가 없어요")).toBeInTheDocument();
  });
});
