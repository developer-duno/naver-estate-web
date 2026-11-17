/**
 * 「중개 실무」 첫 화면 「내 거래 신고 기한」 카드(DealDeadlines · 세션 519) — 빈 안내 · 줄 순서 · 줄 누르면 그 거래를 고름 ·
 * 당사자용·계약일 없는 거래는 안 보임 · 저장이 깨져 있으면 빈 안내 · 다른 탭 반영
 * 실행: npx vitest run src/components/broker/__tests__/DealDeadlines.test.tsx
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import DealDeadlines from "../DealDeadlines";
import { DEALS_KEY, emptyState, readDeals, type Deal, type DealsState } from "@/lib/broker/deals-storage";

const EMPTY = "체크 목록에서 계약일을 넣으면 여기에 신고 기한이 보입니다.";

/** 거래 하나(시험용) */
function makeDeal(over: Partial<Deal> & Pick<Deal, "id" | "type">): Deal {
  return { no: 1, checks: [], createdAt: 1, ...over };
}
const seed = (deals: Deal[], active: DealsState["active"] = {}) =>
  localStorage.setItem(DEALS_KEY, JSON.stringify({ ...emptyState(), deals, active }));

/** 그림 ②와 같은 가짜 거래 4개 + 안 보여야 할 거래 2개(당사자용 · 계약일 없음) */
function pictureDeals(): Deal[] {
  return [
    makeDeal({ id: "j2", type: "jeonse", no: 2, contractDate: "2026-11-05", checks: ["jeonse.registry"] }),
    makeDeal({ id: "w1", type: "wolse", no: 1, contractDate: "2026-11-12", checks: ["wolse.lease-report"] }),
    makeDeal({ id: "s1", type: "sale", no: 1, contractDate: "2026-11-02" }),
    makeDeal({ id: "j3", type: "jeonse", no: 3, contractDate: "2026-10-10" }),
    makeDeal({ id: "j1", type: "jeonse", no: 1 }),
    makeDeal({ id: "t1", type: "jeonse-tenant", no: 1, contractDate: "2026-11-01" }),
  ];
}

const rowTexts = () =>
  within(screen.getByRole("region", { name: "내 거래 신고 기한" }))
    .getAllByRole("link")
    .map((a) => a.textContent);

describe("DealDeadlines", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-17T03:00:00Z")); // 한국 2026-11-17 낮
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("저장된 거래가 없으면 빈 안내만", () => {
    render(<DealDeadlines />);
    expect(screen.getByRole("heading", { level: 2, name: "내 거래 신고 기한" })).toBeInTheDocument();
    expect(screen.getByText(EMPTY)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("순서 = 지난 것 → 남은 것 이른 순 → 신고 체크한 것 · 당사자용·계약일 없는 거래는 안 보인다", () => {
    seed(pictureDeals());
    render(<DealDeadlines />);
    expect(rowTexts()).toEqual([
      "전세 거래 3 · 계약 10. 10.기한 지남 · 11. 9.(월)",
      "매매 거래 1 · 계약 11. 2.12. 2.(수) · 15일 남음",
      "전세 거래 2 · 계약 11. 5.12. 5.(토) · 18일 남음",
      "월세 거래 1 · 계약 11. 12.신고 체크함 ✓",
    ]);
    expect(screen.getByText(/이 기기에 저장한 거래 중 계약일을 넣은 것만 보입니다/)).toBeInTheDocument();
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  it("줄 주소는 그 유형의 거래 장 · 누르면 그 거래를 고른 상태로 저장(다른 거래·체크는 그대로)", () => {
    seed(pictureDeals(), { jeonse: "j2" });
    render(<DealDeadlines />);
    const link = screen.getByRole("link", { name: /전세 거래 3/ });
    expect(link).toHaveAttribute("href", "/broker/jeonse");
    expect(screen.getByRole("link", { name: /매매 거래 1/ })).toHaveAttribute("href", "/broker/sale");
    fireEvent.click(link);
    const s = readDeals().state;
    expect(s.active.jeonse).toBe("j3");
    expect(s.deals.find((d) => d.id === "j2")!.checks).toEqual(["jeonse.registry"]);
    expect(s.deals).toHaveLength(6);
  });

  it("늘어난 기한 안이면 늘어난 날짜와 남은 날수", () => {
    vi.setSystemTime(new Date("2026-12-06T03:00:00Z"));
    seed([makeDeal({ id: "j2", type: "jeonse", no: 2, contractDate: "2026-11-05" })]);
    render(<DealDeadlines />);
    expect(rowTexts()).toEqual(["전세 거래 2 · 계약 11. 5.12. 7.(월) · 늘어난 기한까지 1일 남음"]);
  });

  it("계약일 있는 거래가 당사자용뿐이면 빈 안내", () => {
    seed([makeDeal({ id: "t1", type: "jeonse-tenant", contractDate: "2026-11-01" })]);
    render(<DealDeadlines />);
    expect(screen.getByText(EMPTY)).toBeInTheDocument();
  });

  it("저장된 글자가 깨져 있으면 빈 안내", () => {
    localStorage.setItem(DEALS_KEY, "{깨짐");
    render(<DealDeadlines />);
    expect(screen.getByText(EMPTY)).toBeInTheDocument();
  });

  it("다른 탭이 같은 키를 바꾸면(storage 이벤트) 다시 읽는다", () => {
    render(<DealDeadlines />);
    expect(screen.getByText(EMPTY)).toBeInTheDocument();
    seed([makeDeal({ id: "s1", type: "sale", contractDate: "2026-11-02" })]);
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: DEALS_KEY }));
    });
    expect(rowTexts()).toEqual(["매매 거래 1 · 계약 11. 2.12. 2.(수) · 15일 남음"]);
  });
});
