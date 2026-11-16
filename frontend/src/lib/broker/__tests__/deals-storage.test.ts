/**
 * 「중개 실무」 체크 저장(lib/broker/deals-storage.ts) — 모양 검사·모르는 id 버림·상한 20·비우기/되돌리기·쓰기 실패·계약일 형식
 * 실행: npx vitest run src/lib/broker/__tests__/deals-storage.test.ts
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DEALS_KEY,
  MAX_DEALS,
  activeDeal,
  addDeal,
  clearChecks,
  emptyState,
  isValidDate,
  parseDeals,
  readDeals,
  restoreChecks,
  setActive,
  setContractDate,
  toggleCheck,
  writeDeals,
  type DealsState,
} from "../deals-storage";

/** 거래 n 개짜리 상태 */
function stateWith(n: number): DealsState {
  let s = emptyState();
  for (let i = 0; i < n; i++) s = addDeal(s, "jeonse", 1_000 + i)!.state;
  return s;
}

const deal = (over: Record<string, unknown> = {}) => ({
  id: "jeonse-a-1",
  no: 1,
  type: "jeonse",
  checks: ["jeonse.registry"],
  createdAt: 1,
  ...over,
});
const raw = (over: Record<string, unknown> = {}) => JSON.stringify({ v: 1, deals: [deal()], active: {}, ...over });

describe("parseDeals — 읽을 때 모양 검사", () => {
  it("저장된 것이 없으면 빈 상태(ok)", () => {
    expect(parseDeals(null)).toEqual({ ok: true, state: emptyState() });
  });

  it("정상 모양은 그대로 읽는다", () => {
    const r = parseDeals(raw({ active: { jeonse: "jeonse-a-1" } }));
    expect(r.ok).toBe(true);
    expect(r.state.deals[0]).toMatchObject({ id: "jeonse-a-1", no: 1, checks: ["jeonse.registry"] });
    expect(r.state.active.jeonse).toBe("jeonse-a-1");
  });

  it.each([
    ["JSON 아님", "{깨짐"],
    ["판 번호 다름", JSON.stringify({ v: 2, deals: [], active: {} })],
    ["deals 가 배열 아님", JSON.stringify({ v: 1, deals: {}, active: {} })],
    ["active 없음", JSON.stringify({ v: 1, deals: [] })],
    ["거래 번호가 0", raw({ deals: [deal({ no: 0 })] })],
    ["checks 에 숫자", raw({ deals: [deal({ checks: [1] })] })],
    ["계약일 형식 틀림", raw({ deals: [deal({ contractDate: "2026-02-30" })] })],
    ["같은 id 두 번", raw({ deals: [deal(), deal()] })],
    ["배열 자체", "[]"],
  ])("모양이 틀리면 버리고 corrupt — %s", (_name, text) => {
    const r = parseDeals(text);
    expect(r).toEqual({ ok: false, reason: "corrupt", state: emptyState() });
  });

  it("지금 목록에 없는 항목 id 는 버리고, 모르는 유형의 거래는 뺀다", () => {
    const r = parseDeals(
      raw({
        deals: [
          deal({ checks: ["jeonse.registry", "jeonse.gone", "wolse.x", "jeonse.registry"] }),
          deal({ id: "wolse-1", type: "wolse", checks: [] }),
        ],
        active: { jeonse: "jeonse-a-1", wolse: "wolse-1" },
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.state.deals).toHaveLength(1);
    expect(r.state.deals[0].checks).toEqual(["jeonse.registry"]);
    expect(r.state.active).toEqual({ jeonse: "jeonse-a-1" });
  });

  it("active 가 없는 거래를 가리키면 뺀다", () => {
    expect(parseDeals(raw({ active: { jeonse: "nope" } })).state.active).toEqual({});
  });

  it("active 가 (읽을 때 빠진) 다른 유형 거래의 id 를 가리키면 뺀다", () => {
    // 지금 유형은 jeonse 하나뿐 — 다른 유형 거래는 읽을 때 먼저 빠지므로, 그 id 를 jeonse 의 active 로 둔 경우를 본다
    const r = parseDeals(raw({ deals: [deal(), deal({ id: "wolse-1", type: "wolse", checks: [] })], active: { jeonse: "wolse-1" } }));
    expect(r.state.deals.map((d) => d.id)).toEqual(["jeonse-a-1"]);
    expect(r.state.active).toEqual({});
  });

  it(`거래가 ${MAX_DEALS}개를 넘게 저장돼 있으면 앞 ${MAX_DEALS}개만`, () => {
    const many = Array.from({ length: MAX_DEALS + 3 }, (_, i) => deal({ id: `d${i}`, no: i + 1 }));
    expect(parseDeals(raw({ deals: many })).state.deals).toHaveLength(MAX_DEALS);
  });
});

describe("상태 바꾸기(순수 함수)", () => {
  it("addDeal — 번호는 1부터 차례로, 새 거래를 고른다 · 상한 20이면 null", () => {
    const s2 = stateWith(2);
    expect(s2.deals.map((d) => d.no)).toEqual([1, 2]);
    expect(activeDeal(s2, "jeonse")?.no).toBe(2);
    const s20 = stateWith(MAX_DEALS);
    expect(s20.deals).toHaveLength(MAX_DEALS);
    expect(addDeal(s20, "jeonse", 9_999)).toBeNull();
  });

  it("addDeal — 번호 = 그 유형의 가장 큰 번호 + 1(중간 번호가 비어도 겹치지 않는다: 1·3 → 4)", () => {
    const r = parseDeals(raw({ deals: [deal({ id: "a", no: 1 }), deal({ id: "c", no: 3 })] }));
    const next = addDeal(r.state, "jeonse", 5_000)!;
    expect(next.deal.no).toBe(4);
    expect(next.state.deals.map((d) => d.no)).toEqual([1, 3, 4]);
  });

  it("toggleCheck — 켜고 끈다 · 그 유형에 없는 id 는 무시", () => {
    const s = stateWith(1);
    const id = s.deals[0].id;
    const on = toggleCheck(s, id, "jeonse.registry");
    expect(on.deals[0].checks).toEqual(["jeonse.registry"]);
    expect(toggleCheck(on, id, "jeonse.registry").deals[0].checks).toEqual([]);
    expect(toggleCheck(s, id, "jeonse.unknown").deals[0].checks).toEqual([]);
  });

  it("clearChecks 뒤 restoreChecks 하면 원상", () => {
    let s = stateWith(1);
    const id = s.deals[0].id;
    for (const c of ["jeonse.registry", "jeonse.trust", "jeonse.fee"]) s = toggleCheck(s, id, c);
    const cleared = clearChecks(s, id);
    expect(cleared.state.deals[0].checks).toEqual([]);
    expect(cleared.removed).toEqual(["jeonse.registry", "jeonse.trust", "jeonse.fee"]);
    expect(restoreChecks(cleared.state, id, cleared.removed)).toEqual(s);
  });

  it("setContractDate — 형식 검사 · 빈 값이면 지운다", () => {
    const s = stateWith(1);
    const id = s.deals[0].id;
    const withDate = setContractDate(s, id, "2026-11-20")!;
    expect(withDate.deals[0].contractDate).toBe("2026-11-20");
    expect(setContractDate(s, id, "2026-13-01")).toBeNull();
    expect(setContractDate(s, id, "20261120")).toBeNull();
    expect("contractDate" in setContractDate(withDate, id, "")!.deals[0]).toBe(false);
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2028-02-29")).toBe(true);
  });
});

describe("읽기·쓰기(이 브라우저 저장소)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("쓴 것을 다시 읽으면 같다", () => {
    const s = toggleCheck(stateWith(1), stateWith(1).deals[0].id, "jeonse.registry");
    expect(writeDeals(s)).toBe(true);
    expect(localStorage.getItem(DEALS_KEY)).not.toBeNull();
    expect(readDeals()).toEqual({ ok: true, state: s });
  });

  it("쓰기가 막히면 false 를 돌려준다(화면이 알리게)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(writeDeals(stateWith(1))).toBe(false);
  });

  it("저장된 글자가 깨져 있으면 corrupt", () => {
    localStorage.setItem(DEALS_KEY, "{깨짐");
    expect(readDeals().ok).toBe(false);
  });
});

describe("유형이 둘 이상일 때 — 중개사용 전세와 세입자·집주인 목록이 섞이지 않는다(세션 514 · s513 검사 M8)", () => {
  /** 전세(중개사용) 거래 1개를 고르고 체크 2개 */
  function withJeonse(): DealsState {
    const r = addDeal(emptyState(), "jeonse", 1_000)!;
    return toggleCheck(toggleCheck(r.state, r.deal.id, "jeonse.registry"), r.deal.id, "jeonse.trust");
  }

  it("전세 거래를 고른 상태에서 세입자 목록의 고른 거래는 없다 — 전세 체크가 세입자 화면에 안 보인다", () => {
    const s = withJeonse();
    expect(activeDeal(s, "jeonse")?.checks).toEqual(["jeonse.registry", "jeonse.trust"]);
    expect(activeDeal(s, "jeonse-tenant")).toBeUndefined();
    expect(activeDeal(s, "jeonse-landlord")).toBeUndefined();
  });

  it("세입자 첫 거래는 그 유형의 「거래 1」 · 전세의 고른 거래는 그대로", () => {
    const s = withJeonse();
    const jeonseId = s.active.jeonse;
    const r = addDeal(s, "jeonse-tenant", 2_000)!;
    expect(r.deal).toMatchObject({ no: 1, type: "jeonse-tenant", checks: [] });
    expect(r.state.active).toEqual({ jeonse: jeonseId, "jeonse-tenant": r.deal.id });
    expect(activeDeal(r.state, "jeonse")?.id).toBe(jeonseId);
    expect(activeDeal(r.state, "jeonse-tenant")?.id).toBe(r.deal.id);
  });

  it("다른 유형의 항목 id 는 체크되지 않고, 세입자 비우기는 전세 체크를 건드리지 않는다", () => {
    const r = addDeal(withJeonse(), "jeonse-tenant", 2_000)!;
    let s = toggleCheck(r.state, r.deal.id, "jeonse.registry"); // 전세 id → 무시
    s = toggleCheck(s, r.deal.id, "jeonse-tenant.registry-explain");
    expect(activeDeal(s, "jeonse-tenant")?.checks).toEqual(["jeonse-tenant.registry-explain"]);
    const cleared = clearChecks(s, r.deal.id).state;
    expect(activeDeal(cleared, "jeonse-tenant")?.checks).toEqual([]);
    expect(activeDeal(cleared, "jeonse")?.checks).toEqual(["jeonse.registry", "jeonse.trust"]);
  });

  it("고른 거래 목록(active)에 다른 유형의 거래 id 를 넣어 두면 읽을 때 버린다 · setActive 도 막는다", () => {
    const s = withJeonse();
    const jeonseId = s.deals[0].id;
    const r = parseDeals(JSON.stringify({ ...s, active: { jeonse: jeonseId, "jeonse-tenant": jeonseId } }));
    expect(r.ok).toBe(true);
    expect(r.state.active).toEqual({ jeonse: jeonseId });
    expect(activeDeal(r.state, "jeonse-tenant")).toBeUndefined();
    expect(setActive(s, "jeonse-tenant", jeonseId)).toBe(s);
  });

  it("세입자 거래에 남은 전세 id·집주인 id 는 읽을 때 버린다", () => {
    const raw = JSON.stringify({
      v: 1,
      deals: [
        {
          id: "t1",
          no: 1,
          type: "jeonse-tenant",
          checks: ["jeonse.registry", "jeonse-landlord.show-info", "jeonse-tenant.fee"],
          createdAt: 1,
        },
      ],
      active: { "jeonse-tenant": "t1" },
    });
    expect(parseDeals(raw).state.deals[0].checks).toEqual(["jeonse-tenant.fee"]);
  });
});
