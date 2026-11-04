/**
 * 미분양 수 비공개 표시 시험 (세션 500 — 대구시 명단이 단지별 수를 공개하지 않는 단지)
 * - 글자 함수(지자체 이름·안내 줄) · 표(데스크톱·휴대폰 카드) · 지도 선택 카드 · 상세 정보 칸
 * - 옛 서버 응답(unsold_hidden 칸 없음)은 지금 화면과 똑같아야 한다
 * 실행: npx vitest run src/components/mb/__tests__/MbUnsoldHidden.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MbApartment } from "@/types";
import { isUnsoldHidden, unsoldHiddenNotice, unsoldListAuthority } from "@/lib/mb-unsold-hidden";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/mibunyang",
  useSearchParams: () => new URLSearchParams(),
}));

import MbApartmentTable from "../MbApartmentTable";
import MbSelectedCard from "../MbSelectedCard";
import { PresaleSection } from "../MbDetailSections";

function makeApt(overrides: Partial<MbApartment> = {}): MbApartment {
  return { id: "ah-1", name: "푸르지오", region: "대구", gu: "북구", units: 499, ...overrides };
}
const HIDDEN = { unsold: undefined, unsold_hidden: true, unsold_listed_as_of: "2026-09-30" };
const OLD_RESPONSE = { unsold: undefined }; // 옛 서버 — 칸 자체가 없다

// ── 글자 함수 ───────────────────────────────────────────────

describe("unsoldListAuthority — region 으로 지자체 이름", () => {
  it.each([
    ["대구", "대구시"],
    ["충남", "충청남도"],
    ["경기", "경기도"],
    ["서울", "지자체"],
    [undefined, "지자체"],
  ])("%s → %s", (region, expected) => {
    expect(unsoldListAuthority(region)).toBe(expected);
  });
});

describe("isUnsoldHidden — 응답 칸만 본다", () => {
  it("true 일 때만 비공개", () => {
    expect(isUnsoldHidden({ unsold_hidden: true })).toBe(true);
    expect(isUnsoldHidden({ unsold_hidden: false })).toBe(false);
    expect(isUnsoldHidden({})).toBe(false);
  });
});

describe("unsoldHiddenNotice — 그래프 위 안내 줄", () => {
  const hist = [{ base_month: "202607" }, { base_month: "202608" }, { base_month: "202606" }];

  it("기준일 달 + 추이 마지막 달 (순서가 섞여 와도 가장 늦은 달)", () => {
    expect(unsoldHiddenNotice("대구", "2026-09-30", hist)).toBe(
      "대구시 9월 말 명단은 이 단지의 미분양 수를 공개하지 않습니다. 아래는 8월까지의 추정치입니다.",
    );
  });

  it("기준일이 없으면 '대구시 명단은'", () => {
    expect(unsoldHiddenNotice("대구", null, hist)).toBe(
      "대구시 명단은 이 단지의 미분양 수를 공개하지 않습니다. 아래는 8월까지의 추정치입니다.",
    );
  });

  it("추이 기록이 비면 둘째 문장을 뺀다", () => {
    expect(unsoldHiddenNotice("대구", "2026-09-30", [])).toBe(
      "대구시 9월 말 명단은 이 단지의 미분양 수를 공개하지 않습니다.",
    );
  });
});

// ── 표 (데스크톱 셀 + 휴대폰 카드) ──────────────────────────

describe("MbApartmentTable — 미분양 칸", () => {
  it("비공개면 두 자리 모두 '비공개'(회색), 미분양률은 '-' 그대로", () => {
    render(<MbApartmentTable apartments={[makeApt(HIDDEN)]} />);
    const labels = screen.getAllByText("비공개");
    expect(labels).toHaveLength(2); // 휴대폰 카드 + 데스크톱 셀
    labels.forEach((el) => expect(el.className).toContain("text-gray-400"));
    const cell = labels.find((el) => el.tagName === "TD")!;
    expect(cell.nextElementSibling?.textContent).toBe("-"); // 미분양률 칸
  });

  it("옛 응답(칸 없음)은 지금처럼 '-' 이고 '비공개' 없음", () => {
    render(<MbApartmentTable apartments={[makeApt(OLD_RESPONSE)]} />);
    expect(screen.queryByText("비공개")).not.toBeInTheDocument();
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(2);
  });

  it("숫자가 있으면 숫자 그대로", () => {
    render(<MbApartmentTable apartments={[makeApt({ unsold: 25, unsold_hidden: false })]} />);
    expect(screen.getByText("25세대")).toBeInTheDocument();
    expect(screen.queryByText("비공개")).not.toBeInTheDocument();
  });
});

// ── 지도 선택 카드 ──────────────────────────────────────────

describe("MbSelectedCard — 미분양", () => {
  it("비공개면 '미분양 비공개'", () => {
    render(<MbSelectedCard apt={makeApt(HIDDEN)} />);
    expect(screen.getByText("미분양 비공개")).toBeInTheDocument();
  });

  it("옛 응답은 아무것도 안 보인다(지금 그대로)", () => {
    render(<MbSelectedCard apt={makeApt(OLD_RESPONSE)} />);
    expect(screen.queryByText(/미분양/)).not.toBeInTheDocument();
  });
});

// ── 상세 정보 칸 ────────────────────────────────────────────

describe("PresaleSection — '미분양 세대수' 칸", () => {
  const valueOf = () => screen.getByText("미분양 세대수").nextElementSibling?.textContent;

  it("비공개면 '비공개(대구시)'", () => {
    render(<PresaleSection apartment={makeApt(HIDDEN)} />);
    expect(valueOf()).toBe("비공개(대구시)");
  });

  it("옛 응답은 '-' 그대로", () => {
    render(<PresaleSection apartment={makeApt(OLD_RESPONSE)} />);
    expect(valueOf()).toBe("-");
  });

  it("숫자면 숫자", () => {
    render(<PresaleSection apartment={makeApt({ unsold: 1234, unsold_hidden: false })} />);
    expect(valueOf()).toBe("1,234세대");
  });
});
