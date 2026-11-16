/**
 * 체크 목록 부품(DealChecklist) — 이 기기 저장·거래 1 자동 생성·비우기/되돌리기 10초·다른 탭 반영·저장 실패 알림·StrictMode
 * 실행: npx vitest run src/components/broker/__tests__/DealChecklist.test.tsx
 */
import { StrictMode } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import DealChecklist, { UNDO_MS } from "../DealChecklist";
import { DEALS_KEY, MAX_DEALS, addDeal, emptyState, toggleCheck, type DealsState } from "@/lib/broker/deals-storage";

const FIRST = "등기사항증명서로 권리관계 확인";
const SECOND = "신탁등기가 있으면 신탁원부 확인";

/** 저장소에 미리 넣어 둘 상태(거래 1 + 체크) */
function seeded(checks: string[] = ["jeonse.registry"]): DealsState {
  const r = addDeal(emptyState(), "jeonse", 1_000)!;
  return checks.reduce((s, c) => toggleCheck(s, r.deal.id, c), r.state);
}

const box = (name: string) => screen.getByRole("checkbox", { name }) as HTMLInputElement;
const saved = () => JSON.parse(localStorage.getItem(DEALS_KEY) ?? "null") as DealsState | null;

describe("DealChecklist", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("묶음 0개에서 처음 체크하면 「거래 1」이 생기고 이 기기에 저장된다", () => {
    render(<DealChecklist type="jeonse" />);
    expect(screen.getByText(/아직 거래가 없습니다/)).toBeInTheDocument();
    expect(screen.getByText(/18개 중 0개 확인/)).toBeInTheDocument();
    fireEvent.click(box(FIRST));
    expect(box(FIRST).checked).toBe(true);
    expect(screen.getByRole("combobox", { name: "거래 고르기" })).toHaveDisplayValue("거래 1 · 전세");
    expect(screen.getByText(/18개 중 1개 확인/)).toBeInTheDocument();
    const s = saved()!;
    expect(s.deals).toHaveLength(1);
    expect(s.deals[0]).toMatchObject({ no: 1, type: "jeonse", checks: ["jeonse.registry"] });
  });

  it("체크 → 저장 → 다시 그려도 체크가 남아 있다(첫 그림은 꺼진 상태, 마운트 뒤 채움)", async () => {
    const first = render(<DealChecklist type="jeonse" />);
    fireEvent.click(box(FIRST));
    first.unmount();
    render(<DealChecklist type="jeonse" />);
    await waitFor(() => expect(box(FIRST).checked).toBe(true));
    expect(box(SECOND).checked).toBe(false);
  });

  it("[+ 새 거래] → 거래 2 · 계약일을 넣으면 고르기 글자에 계약일", () => {
    localStorage.setItem(DEALS_KEY, JSON.stringify(seeded()));
    render(<DealChecklist type="jeonse" />);
    fireEvent.click(screen.getByRole("button", { name: "+ 새 거래" }));
    const select = screen.getByRole("combobox", { name: "거래 고르기" });
    expect(select).toHaveDisplayValue("거래 2 · 전세");
    expect(box(FIRST).checked).toBe(false);
    fireEvent.change(screen.getByLabelText("계약일(선택)"), { target: { value: "2026-11-20" } });
    expect(select).toHaveDisplayValue("거래 2 · 전세 · 계약일 2026. 11. 20.");
    fireEvent.change(select, { target: { value: saved()!.deals[0].id } });
    expect(box(FIRST).checked).toBe(true);
  });

  it("거래가 20개면 [+ 새 거래] 비활성 + 안내", () => {
    let s = emptyState();
    for (let i = 0; i < MAX_DEALS; i++) s = addDeal(s, "jeonse", i + 1)!.state;
    localStorage.setItem(DEALS_KEY, JSON.stringify(s));
    render(<DealChecklist type="jeonse" />);
    expect(screen.getByRole("button", { name: "+ 새 거래" })).toBeDisabled();
    expect(screen.getByText("거래는 20개까지 저장됩니다. 끝난 거래는 비워서 다시 쓰세요.")).toBeInTheDocument();
  });

  it("비우기 → 바로 지우고 알림 → 10초 안 되돌리기면 그대로 복원", () => {
    vi.useFakeTimers();
    localStorage.setItem(DEALS_KEY, JSON.stringify(seeded(["jeonse.registry", "jeonse.trust"])));
    render(<DealChecklist type="jeonse" />);
    fireEvent.click(screen.getByRole("button", { name: "비우기" }));
    expect(box(FIRST).checked).toBe(false);
    expect(saved()!.deals[0].checks).toEqual([]);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("거래 1의 체크 2개를 지웠습니다.");
    act(() => {
      vi.advanceTimersByTime(UNDO_MS - 1_000);
    });
    fireEvent.click(within(status).getByRole("button", { name: "되돌리기" }));
    expect(box(FIRST).checked).toBe(true);
    expect(box(SECOND).checked).toBe(true);
    expect(saved()!.deals[0].checks).toEqual(["jeonse.registry", "jeonse.trust"]);
    expect(status).toBeEmptyDOMElement();
  });

  it("되돌리기를 안 누르면 10초 뒤 알림이 사라지고 체크는 지운 채로 · 체크 0개면 비우기 비활성", () => {
    vi.useFakeTimers();
    localStorage.setItem(DEALS_KEY, JSON.stringify(seeded()));
    render(<DealChecklist type="jeonse" />);
    fireEvent.click(screen.getByRole("button", { name: "비우기" }));
    expect(screen.getByRole("status")).toHaveTextContent("지웠습니다");
    act(() => {
      vi.advanceTimersByTime(UNDO_MS);
    });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(box(FIRST).checked).toBe(false);
    expect(screen.getByRole("button", { name: "비우기" })).toBeDisabled();
  });

  it("되돌리기는 지운 거래로 복원한다 — 비운 뒤 다른 거래로 바꿔도 그 거래는 그대로", () => {
    vi.useFakeTimers();
    // 거래 1(체크 2개) + 거래 2(체크 1개), 거래 1을 고른 상태
    const base = seeded(["jeonse.registry", "jeonse.trust"]);
    const two = addDeal(base, "jeonse", 2_000)!;
    const s = { ...toggleCheck(two.state, two.deal.id, "jeonse.fee"), active: { jeonse: base.deals[0].id } };
    localStorage.setItem(DEALS_KEY, JSON.stringify(s));
    render(<DealChecklist type="jeonse" />);
    const select = screen.getByRole("combobox", { name: "거래 고르기" });
    expect(select).toHaveDisplayValue("거래 1 · 전세");
    fireEvent.click(screen.getByRole("button", { name: "비우기" }));
    fireEvent.change(select, { target: { value: two.deal.id } });
    expect(select).toHaveDisplayValue("거래 2 · 전세");
    fireEvent.click(within(screen.getByRole("status")).getByRole("button", { name: "되돌리기" }));
    const after = saved()!;
    expect(after.deals.find((d) => d.no === 1)!.checks).toEqual(["jeonse.registry", "jeonse.trust"]);
    expect(after.deals.find((d) => d.no === 2)!.checks).toEqual(["jeonse.fee"]);
    // 화면은 여전히 거래 2 — 거래 1의 체크가 거래 2 화면에 나타나지 않는다
    expect(box(FIRST).checked).toBe(false);
    expect(box("중개보수·실비 금액과 산출내역 설명").checked).toBe(true);
  });

  it("다른 탭이 저장소를 통째로 지우면(storage 이벤트 key=null) 화면 체크가 다 꺼진다", async () => {
    localStorage.setItem(DEALS_KEY, JSON.stringify(seeded(["jeonse.registry", "jeonse.trust"])));
    render(<DealChecklist type="jeonse" />);
    await waitFor(() => expect(box(FIRST).checked).toBe(true));
    localStorage.clear();
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    await waitFor(() => expect(box(FIRST).checked).toBe(false));
    expect(box(SECOND).checked).toBe(false);
    expect(screen.getByText(/아직 거래가 없습니다/)).toBeInTheDocument();
  });

  it("다른 탭이 같은 키를 바꾸면(storage 이벤트) 다시 읽는다", async () => {
    render(<DealChecklist type="jeonse" />);
    expect(box(FIRST).checked).toBe(false);
    localStorage.setItem(DEALS_KEY, JSON.stringify(seeded()));
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: DEALS_KEY }));
    });
    await waitFor(() => expect(box(FIRST).checked).toBe(true));
  });

  it("저장이 막힌 브라우저 → 주황 줄 · 화면의 체크는 그대로", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    render(<DealChecklist type="jeonse" />);
    expect(screen.queryByText(/저장을 막아 두어/)).toBeNull();
    fireEvent.click(box(FIRST));
    expect(box(FIRST).checked).toBe(true);
    expect(screen.getByText("이 브라우저는 저장을 막아 두어, 창을 닫으면 체크 표시가 사라집니다.")).toBeInTheDocument();
  });

  it.each([
    ["JSON 아님", "{깨짐"],
    ["JSON 이지만 모양이 틀림(deals 가 null)", JSON.stringify({ v: 1, deals: null, active: {} })],
  ])("저장된 글자가 깨져 있으면(%s) 화면이 죽지 않고 한 번 알린 뒤 새로 시작한다", async (_name, text) => {
    localStorage.setItem(DEALS_KEY, text);
    render(<DealChecklist type="jeonse" />);
    expect(await screen.findByText("저장된 체크를 읽지 못해 새로 시작합니다.")).toBeInTheDocument();
    fireEvent.click(box(FIRST));
    expect(screen.queryByText("저장된 체크를 읽지 못해 새로 시작합니다.")).toBeNull();
    expect(saved()!.deals[0].checks).toEqual(["jeonse.registry"]);
  });

  it("StrictMode(effect 두 번)에서도 저장된 체크를 채우고, 다른 탭 반영이 한 번만 걸린다", async () => {
    localStorage.setItem(DEALS_KEY, JSON.stringify(seeded()));
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    render(
      <StrictMode>
        <DealChecklist type="jeonse" />
      </StrictMode>,
    );
    await waitFor(() => expect(box(FIRST).checked).toBe(true));
    const added = add.mock.calls.filter(([t]) => t === "storage").length;
    const removed = remove.mock.calls.filter(([t]) => t === "storage").length;
    expect(added - removed).toBe(1);
    fireEvent.click(box(SECOND));
    expect(saved()!.deals[0].checks).toEqual(["jeonse.registry", "jeonse.trust"]);
  });
});

describe("DealChecklist single — 세입자·집주인용(세션 514)", () => {
  const TENANT_FIRST = "중개사에게 등기사항증명서·건축물대장을 보여 달라고 하고 근저당·압류·신탁 설명 듣기";
  const TENANT_SECOND =
    "집주인에게 확정일자 현황과 국세·지방세 납세증명서 받기(계약 전에 열람에 동의했으면 그것으로 갈음)";

  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("거래 고르기·새 거래·계약일 칸을 그리지 않는다 · 진행 막대·비우기·저장 안내는 있다", () => {
    render(<DealChecklist type="jeonse-tenant" single />);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: "+ 새 거래" })).toBeNull();
    expect(screen.queryByLabelText("계약일(선택)")).toBeNull();
    expect(screen.queryByText(/아직 거래가 없습니다/)).toBeNull();
    expect(screen.queryByText("내 거래")).toBeNull();
    expect(screen.getByRole("progressbar", { name: "확인한 항목" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "비우기" })).toBeDisabled();
    expect(screen.getByText(/15개 중 0개 확인/)).toHaveTextContent("15개 중 0개 확인");
    expect(screen.getByText(/이 기기 이 브라우저에만 저장됩니다/)).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(15);
  });

  it("처음 체크하면 그 유형의 「거래 1」이 생겨 저장되고, 다시 그려도 남는다", async () => {
    const first = render(<DealChecklist type="jeonse-tenant" single />);
    fireEvent.click(box(TENANT_FIRST));
    expect(screen.getByText(/15개 중 1개 확인/)).toBeInTheDocument();
    expect(saved()!.deals).toEqual([
      expect.objectContaining({ no: 1, type: "jeonse-tenant", checks: ["jeonse-tenant.registry-explain"] }),
    ]);
    first.unmount();
    render(<DealChecklist type="jeonse-tenant" single />);
    await waitFor(() => expect(box(TENANT_FIRST).checked).toBe(true));
  });

  it("비우기 → 「체크 M개를 지웠습니다.」(거래 번호 없이) → 되돌리기면 복원", () => {
    vi.useFakeTimers();
    render(<DealChecklist type="jeonse-tenant" single />);
    fireEvent.click(box(TENANT_FIRST));
    fireEvent.click(box(TENANT_SECOND));
    fireEvent.click(screen.getByRole("button", { name: "비우기" }));
    expect(box(TENANT_FIRST).checked).toBe(false);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("체크 2개를 지웠습니다.");
    expect(status.textContent).not.toContain("거래");
    act(() => {
      vi.advanceTimersByTime(UNDO_MS - 1_000);
    });
    fireEvent.click(within(status).getByRole("button", { name: "되돌리기" }));
    expect(box(TENANT_FIRST).checked).toBe(true);
    expect(box(TENANT_SECOND).checked).toBe(true);
    expect(saved()!.deals[0].checks).toEqual(["jeonse-tenant.registry-explain", "jeonse-tenant.landlord-info"]);
    expect(status).toBeEmptyDOMElement();
  });

  it("중개사 거래가 20개로 꽉 차 있어도 세입자 첫 체크는 「거래 1」로 저장된다(상한은 중개사용만 · 세션 514)", async () => {
    let s = emptyState();
    for (let i = 0; i < MAX_DEALS; i++) s = addDeal(s, "jeonse", i + 1)!.state;
    localStorage.setItem(DEALS_KEY, JSON.stringify(s));
    render(<DealChecklist type="jeonse-tenant" single />);
    await waitFor(() => expect(screen.getByText(/15개 중 0개 확인/)).toBeInTheDocument());
    fireEvent.click(box(TENANT_FIRST));
    expect(box(TENANT_FIRST).checked).toBe(true);
    const after = saved()!;
    expect(after.deals).toHaveLength(MAX_DEALS + 1);
    expect(after.deals.find((d) => d.type === "jeonse-tenant")).toMatchObject({ no: 1, checks: ["jeonse-tenant.registry-explain"] });
  });

  it("세입자 거래가 있어도 중개사 장의 「20개까지」 판정은 중개사 거래만 센다", async () => {
    let s = emptyState();
    for (let i = 0; i < MAX_DEALS - 1; i++) s = addDeal(s, "jeonse", i + 1)!.state;
    s = addDeal(s, "jeonse-tenant", 100)!.state;
    localStorage.setItem(DEALS_KEY, JSON.stringify(s));
    render(<DealChecklist type="jeonse" />);
    await waitFor(() => expect(screen.getByRole("combobox", { name: "거래 고르기" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "+ 새 거래" })).toBeEnabled();
    expect(screen.queryByText(/거래는 20개까지 저장됩니다/)).toBeNull();
  });

  it("중개사용 전세 거래가 저장돼 있어도 세입자 화면은 비어 있고, 세입자 체크는 전세 거래에 안 섞인다", async () => {
    localStorage.setItem(DEALS_KEY, JSON.stringify(seeded(["jeonse.registry", "jeonse.trust"])));
    render(<DealChecklist type="jeonse-tenant" single />);
    await waitFor(() => expect(screen.getByText(/15개 중 0개 확인/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "비우기" })).toBeDisabled();
    fireEvent.click(box(TENANT_FIRST));
    const s = saved()!;
    expect(s.deals.find((d) => d.type === "jeonse")!.checks).toEqual(["jeonse.registry", "jeonse.trust"]);
    expect(s.deals.find((d) => d.type === "jeonse-tenant")).toMatchObject({ no: 1, checks: ["jeonse-tenant.registry-explain"] });
  });
});

describe("DealChecklist — 이 판이 모르는 유형·항목 체크를 지우지 않는다(세션 515)", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** 새 판이 저장했을 법한 저장 글자 — 아는 전세 거래(모르는 항목 체크 1개 포함) + 모르는 유형 거래 1개 */
  function futureText(): string {
    return JSON.stringify({
      v: 1,
      deals: [
        { id: "jeonse-a-1", no: 1, type: "jeonse", checks: ["jeonse.registry", "jeonse.future-item"], createdAt: 1 },
        { id: "zz-unknown-tenant-x-1", no: 1, type: "zz-unknown-tenant", checks: ["zz-unknown-tenant.registry"], createdAt: 2 },
      ],
      active: { jeonse: "jeonse-a-1", "zz-unknown-tenant": "zz-unknown-tenant-x-1" },
    });
  }
  const savedRaw = () => JSON.parse(localStorage.getItem(DEALS_KEY)!) as { deals: Record<string, unknown>[]; active: Record<string, string> };

  it("T7 체크 1개를 눌러도 모르는 유형 거래·모르는 항목 체크·active 열쇠가 저장 글자에 남는다", async () => {
    localStorage.setItem(DEALS_KEY, futureText());
    render(<DealChecklist type="jeonse" />);
    await waitFor(() => expect(box(FIRST).checked).toBe(true));
    expect(screen.getByText(/18개 중 1개 확인/)).toBeInTheDocument();
    fireEvent.click(box(SECOND));
    const s = savedRaw();
    expect(s.deals.find((d) => d.id === "zz-unknown-tenant-x-1")).toEqual(JSON.parse(futureText()).deals[1]);
    expect(s.deals.find((d) => d.id === "jeonse-a-1")!.checks).toEqual(["jeonse.registry", "jeonse.trust", "jeonse.future-item"]);
    expect(s.active).toEqual({ jeonse: "jeonse-a-1", "zz-unknown-tenant": "zz-unknown-tenant-x-1" });
  });

  it("비우기 알림은 보이던 체크 수(1개) · 저장 글자는 모르는 체크까지 비고, 되돌리면 둘 다 돌아온다", async () => {
    localStorage.setItem(DEALS_KEY, futureText());
    render(<DealChecklist type="jeonse" />);
    await waitFor(() => expect(box(FIRST).checked).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "비우기" }));
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("거래 1의 체크 1개를 지웠습니다.");
    expect(savedRaw().deals.find((d) => d.id === "jeonse-a-1")!.checks).toEqual([]);
    fireEvent.click(within(status).getByRole("button", { name: "되돌리기" }));
    expect(box(FIRST).checked).toBe(true);
    expect(savedRaw().deals.find((d) => d.id === "jeonse-a-1")!.checks).toEqual(["jeonse.registry", "jeonse.future-item"]);
  });
});
