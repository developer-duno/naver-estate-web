/**
 * 미분양 '단지 전체' 세대수 표시 테스트 (B22)
 * 미분양이 같은 단지 묶음 값으로 바뀐 뒤 세대수도 묶음 값(bundle_units)으로 보이는지 —
 * 있음(행 값과 다름) / 없음(null) / 같음 세 경우를 화면 자리마다 본다.
 * 실행: npx vitest run src/components/mb/__tests__/MbBundleUnits.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MbApartment } from "@/types";
import { BUNDLE_UNITS_LABEL, displayUnits, isBundleUnits } from "@/lib/mb-format";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/mibunyang",
  useSearchParams: () => new URLSearchParams(),
}));

import MbApartmentTable from "../MbApartmentTable";
import MbSelectedCard from "../MbSelectedCard";
import { OverviewSection } from "../MbDetailSections";
import MbPresaleTable from "../MbPresaleTable";
import { AXES } from "../MbCompareRadarChart";
import { MB_COMPARE_ROWS } from "@/lib/mb-compare-utils";

// 행 세대수 4 · 묶음 세대수 1,200 — 두 값이 갈라져야 어느 쪽을 그렸는지 구분된다
function makeApt(overrides: Partial<MbApartment> = {}): MbApartment {
  return { id: "A", name: "단지A", region: "서울", gu: "강남", units: 4, unsold: 231, ...overrides };
}

const CASES = {
  있음: { bundle_units: 1200 },
  없음: { bundle_units: null },
  같음: { units: 300, bundle_units: 300 },
} as const;

describe("displayUnits · isBundleUnits", () => {
  it("묶음 값이 있으면 그 값, 없으면 행 값", () => {
    expect(displayUnits(makeApt(CASES.있음))).toBe(1200);
    expect(displayUnits(makeApt(CASES.없음))).toBe(4);
    expect(displayUnits(makeApt({ units: undefined, bundle_units: undefined }))).toBeNull();
  });

  it("이름표는 묶음 값이 있고 행 값과 다를 때만", () => {
    expect(isBundleUnits(makeApt(CASES.있음))).toBe(true);
    expect(isBundleUnits(makeApt(CASES.없음))).toBe(false);
    expect(isBundleUnits(makeApt(CASES.같음))).toBe(false);
  });
});

describe("MbApartmentTable — 세대수 (모바일 카드 + 데스크톱 표)", () => {
  it("있음: 1,200 + 이름표, 행 값 4 는 안 보인다", () => {
    render(<MbApartmentTable apartments={[makeApt(CASES.있음)]} />);
    expect(screen.getAllByText(/1,200/).length).toBe(2); // 모바일 + 데스크톱
    expect(screen.getAllByText(BUNDLE_UNITS_LABEL).length).toBe(2);
    expect(screen.queryByText("4")).not.toBeInTheDocument();
    // 사장님 결정(2026-10-14): 표는 숫자 칸 안 아래 줄, 휴대폰 목록은 숫자 옆
    const tags = screen.getAllByText(BUNDLE_UNITS_LABEL);
    const inCell = tags.filter((t) => t.closest("td"));
    const inCard = tags.filter((t) => !t.closest("td"));
    expect(inCell.length).toBe(1);
    expect(inCell[0]).toHaveClass("block");
    expect(inCard.length).toBe(1);
    expect(inCard[0]).toHaveClass("ml-1");
    expect(inCard[0]).not.toHaveClass("block");
  });

  it("없음: 행 값 4 그대로, 이름표 없음", () => {
    render(<MbApartmentTable apartments={[makeApt(CASES.없음)]} />);
    expect(screen.getByText("4")).toBeInTheDocument(); // 데스크톱 셀
    expect(screen.getByText("4세대")).toBeInTheDocument(); // 모바일 카드
    expect(screen.queryByText(BUNDLE_UNITS_LABEL)).not.toBeInTheDocument();
  });

  it("같음: 300 그대로, 이름표 없음", () => {
    render(<MbApartmentTable apartments={[makeApt(CASES.같음)]} />);
    expect(screen.getByText("300세대")).toBeInTheDocument();
    expect(screen.queryByText(BUNDLE_UNITS_LABEL)).not.toBeInTheDocument();
  });
});

describe("MbSelectedCard — 세대수", () => {
  it("있음: 1,200세대 + 이름표", () => {
    render(<MbSelectedCard apt={makeApt(CASES.있음)} />);
    expect(screen.getByText(/1,200세대/)).toBeInTheDocument();
    expect(screen.getByText(BUNDLE_UNITS_LABEL)).toBeInTheDocument();
    expect(screen.queryByText(/^4세대/)).not.toBeInTheDocument();
  });

  it("없음: 4세대, 이름표 없음", () => {
    render(<MbSelectedCard apt={makeApt(CASES.없음)} />);
    expect(screen.getByText("4세대")).toBeInTheDocument();
    expect(screen.queryByText(BUNDLE_UNITS_LABEL)).not.toBeInTheDocument();
  });

  it("같음: 300세대, 이름표 없음", () => {
    render(<MbSelectedCard apt={makeApt(CASES.같음)} />);
    expect(screen.getByText("300세대")).toBeInTheDocument();
    expect(screen.queryByText(BUNDLE_UNITS_LABEL)).not.toBeInTheDocument();
  });
});

describe("OverviewSection — 세대수 막대·규모 판정도 같은 값", () => {
  const bar = () => screen.getAllByRole("progressbar").find((el) =>
    (el.getAttribute("aria-label") ?? "").includes("세대"),
  );

  it("있음: 막대가 1,200 으로 그려지고 이름표", () => {
    render(<OverviewSection apartment={makeApt(CASES.있음)} />);
    expect(bar()?.getAttribute("aria-valuenow")).toBe("1200");
    expect(screen.getByText(BUNDLE_UNITS_LABEL)).toHaveClass("block"); // 막대 밑 줄
  });

  it("없음: 막대가 행 값 4, 이름표 없음", () => {
    render(<OverviewSection apartment={makeApt(CASES.없음)} />);
    expect(bar()?.getAttribute("aria-valuenow")).toBe("4");
    expect(screen.queryByText(BUNDLE_UNITS_LABEL)).not.toBeInTheDocument();
  });

  it("같음: 막대 300, 이름표 없음", () => {
    render(<OverviewSection apartment={makeApt(CASES.같음)} />);
    expect(bar()?.getAttribute("aria-valuenow")).toBe("300");
    expect(screen.queryByText(BUNDLE_UNITS_LABEL)).not.toBeInTheDocument();
  });
});

describe("비교 화면 — 세대수도 묶음 값(미분양 행·미분양률 축과 짝)", () => {
  const unitsRow = MB_COMPARE_ROWS.find((r) => r.label === "세대수")!;
  const unitsAxis = AXES.find((x) => x.key === "units")!;

  it("비교표 세대수 행: 있음 1200 · 없음 4 · 같음 300", () => {
    expect(unitsRow.getValue(makeApt(CASES.있음))).toBe(1200);
    expect(unitsRow.getValue(makeApt(CASES.없음))).toBe(4);
    expect(unitsRow.getValue(makeApt(CASES.같음))).toBe(300);
  });

  it("레이더 세대수 축: 있음 1200 · 없음 4 · 둘 다 없으면 0", () => {
    expect(unitsAxis.getValue(makeApt(CASES.있음))).toBe(1200);
    expect(unitsAxis.getValue(makeApt(CASES.없음))).toBe(4);
    expect(unitsAxis.getValue(makeApt({ units: undefined, bundle_units: null }))).toBe(0);
  });
});

describe("MbPresaleTable — 같은 분양 탭의 선택 카드와 같은 세대수", () => {
  it("있음: 1,200 + 숫자 밑 이름표, 행 값 4 는 안 보인다", () => {
    render(<MbPresaleTable apartments={[makeApt(CASES.있음)]} />);
    expect(screen.getByText("1,200")).toBeInTheDocument();
    expect(screen.getByText(BUNDLE_UNITS_LABEL)).toHaveClass("block");
    expect(screen.queryByText("4")).not.toBeInTheDocument();
  });

  it("없음: 행 값 4, 이름표 없음", () => {
    render(<MbPresaleTable apartments={[makeApt(CASES.없음)]} />);
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.queryByText(BUNDLE_UNITS_LABEL)).not.toBeInTheDocument();
  });
});
