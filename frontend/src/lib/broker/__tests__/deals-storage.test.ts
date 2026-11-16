/**
 * 「중개 실무」 체크 저장(lib/broker/deals-storage.ts) — 모양 검사·모르는 유형·id 는 화면에서 숨기고 쓸 때 보존·상한 20·비우기/되돌리기·쓰기 실패·계약일 형식
 * 실행: npx vitest run src/lib/broker/__tests__/deals-storage.test.ts
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DEALS_KEY,
  MAX_DEALS,
  MAX_UNKNOWN_DEALS,
  activeDeal,
  addDeal,
  clearChecks,
  emptyState,
  isValidDate,
  limitedDealCount,
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

  it("지금 목록에 없는 항목 id·모르는 유형의 거래는 화면용 상태에서 뺀다(쓸 때 보존은 아래 세션 515 묶음)", () => {
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

describe("거래 수 상한은 중개사용 목록만 센다 — 세입자·집주인은 유형마다 1개(세션 514)", () => {
  it("중개사 거래 20개로 꽉 차도 세입자·집주인 첫 거래는 만들어진다 · 중개사 새 거래는 여전히 막힌다", () => {
    const full = stateWith(MAX_DEALS);
    expect(limitedDealCount(full)).toBe(MAX_DEALS);
    expect(addDeal(full, "jeonse", 9_000)).toBeNull();
    const t = addDeal(full, "jeonse-tenant", 9_001)!;
    expect(t.deal).toMatchObject({ no: 1, type: "jeonse-tenant" });
    const l = addDeal(t.state, "jeonse-landlord", 9_002)!;
    expect(l.state.deals).toHaveLength(MAX_DEALS + 2);
    expect(limitedDealCount(l.state)).toBe(MAX_DEALS);
    expect(addDeal(l.state, "jeonse", 9_003)).toBeNull();
  });

  it("세입자 거래는 유형마다 1개 — 두 번째는 만들지 않는다", () => {
    const t = addDeal(emptyState(), "jeonse-tenant", 1)!;
    expect(addDeal(t.state, "jeonse-tenant", 2)).toBeNull();
  });

  it("읽을 때도 중개사 거래 20개 + 세입자 1개를 그대로 남긴다(세입자 둘째 거래는 버림)", () => {
    const many = Array.from({ length: MAX_DEALS }, (_, i) => deal({ id: `d${i}`, no: i + 1, checks: [] }));
    const tenant = (id: string, no: number) => deal({ id, no, type: "jeonse-tenant", checks: ["jeonse-tenant.fee"] });
    const r = parseDeals(raw({ deals: [...many, tenant("t1", 1), tenant("t2", 2)] }));
    expect(r.ok).toBe(true);
    expect(r.state.deals).toHaveLength(MAX_DEALS + 1);
    expect(r.state.deals.filter((d) => d.type === "jeonse-tenant").map((d) => d.id)).toEqual(["t1"]);
  });
});

describe("이 판이 모르는 유형·항목 체크는 읽을 때 숨기고 쓸 때 보존한다(세션 515)", () => {
  // 새 판(예: 월세 목록 추가 — 세션 516 에 매매가 생겨 예시를 월세로)이 저장한 거래를 옛 판으로 열린 탭이 체크 한 번에 지워 버리던 결함의 가드
  beforeEach(() => {
    localStorage.clear();
  });

  /** 새 판이 저장했을 법한 「이 판이 모르는 유형」 거래 */
  const futureDeal = (over: Record<string, unknown> = {}) => ({
    id: "wolse-tenant-x-1",
    no: 1,
    type: "wolse-tenant",
    checks: ["wolse-tenant.registry", "wolse-tenant.loan"],
    createdAt: 7,
    contractDate: "2026-12-01",
    ...over,
  });

  /** 저장 글자를 넣고 → 읽고 → fn 으로 바꾸고 → 쓴 뒤, 저장된 글자를 JSON 으로 돌려준다 */
  function roundTrip(text: string, fn: (s: DealsState) => DealsState = (s) => s) {
    localStorage.setItem(DEALS_KEY, text);
    const r = readDeals();
    expect(r.ok).toBe(true);
    expect(writeDeals(fn(r.state))).toBe(true);
    return JSON.parse(localStorage.getItem(DEALS_KEY)!) as {
      v: number;
      deals: Record<string, unknown>[];
      active: Record<string, string>;
    };
  }

  it("T1 모르는 유형 거래는 화면용 deals 에 없고, 아는 거래 체크를 바꿔 써도 처음 그대로 남는다", () => {
    const text = raw({ deals: [deal(), futureDeal()], active: { jeonse: "jeonse-a-1" } });
    expect(parseDeals(text).state.deals.map((d) => d.id)).toEqual(["jeonse-a-1"]);
    const out = roundTrip(text, (s) => toggleCheck(s, "jeonse-a-1", "jeonse.trust"));
    expect(out.deals.find((d) => d.id === "wolse-tenant-x-1")).toEqual(futureDeal());
    expect(out.deals.find((d) => d.id === "jeonse-a-1")?.checks).toEqual(["jeonse.registry", "jeonse.trust"]);
  });

  it("T2 아는 거래의 모르는 항목 체크는 화면용 checks 에 없고, 다른 항목을 바꿔 써도 남는다", () => {
    const text = raw({ deals: [deal({ checks: ["jeonse.registry", "jeonse.future-item"] })] });
    expect(parseDeals(text).state.deals[0].checks).toEqual(["jeonse.registry"]);
    const out = roundTrip(text, (s) => toggleCheck(s, "jeonse-a-1", "jeonse.trust"));
    expect(out.deals[0].checks).toEqual(["jeonse.registry", "jeonse.trust", "jeonse.future-item"]);
  });

  it("T3 active 의 모르는 유형 열쇠는 화면용 active 에 없고, 쓸 때 다시 붙는다", () => {
    const text = raw({ active: { jeonse: "jeonse-a-1", "wolse-tenant": "x1" } });
    expect(parseDeals(text).state.active).toEqual({ jeonse: "jeonse-a-1" });
    const out = roundTrip(text, (s) => toggleCheck(s, "jeonse-a-1", "jeonse.trust"));
    expect(out.active).toEqual({ jeonse: "jeonse-a-1", "wolse-tenant": "x1" });
  });

  it("T4 비우기는 모르는 체크까지 지우고(알림 숫자는 보이던 체크 수), 되돌리기는 모르는 체크까지 살린다", () => {
    localStorage.setItem(DEALS_KEY, raw({ deals: [deal({ checks: ["jeonse.registry", "jeonse.future-item"] })] }));
    const cleared = clearChecks(readDeals().state, "jeonse-a-1");
    expect(cleared.removed).toEqual(["jeonse.registry"]);
    writeDeals(cleared.state);
    expect(JSON.parse(localStorage.getItem(DEALS_KEY)!).deals[0].checks).toEqual([]);
    writeDeals(restoreChecks(cleared.state, "jeonse-a-1", cleared.removed, cleared.removedUnknown));
    expect(JSON.parse(localStorage.getItem(DEALS_KEY)!).deals[0].checks).toEqual(["jeonse.registry", "jeonse.future-item"]);
  });

  it(`T5 모르는 거래는 상한에 세지 않고(아는 거래 ${MAX_DEALS}개는 그대로), 보존은 앞 ${MAX_UNKNOWN_DEALS}개까지`, () => {
    const futures = Array.from({ length: MAX_UNKNOWN_DEALS + 10 }, (_, i) => futureDeal({ id: `f${i}`, no: i + 1 }));
    const known = (n: number) => Array.from({ length: n }, (_, i) => deal({ id: `d${i}`, no: i + 1, checks: [] }));
    // 모르는 거래를 앞에 둔다 — 상한에 세면 아는 거래가 잘린다
    const full = raw({ deals: [...futures, ...known(MAX_DEALS)] });
    const r = parseDeals(full);
    expect(r.state.deals).toHaveLength(MAX_DEALS);
    expect(limitedDealCount(r.state)).toBe(MAX_DEALS);
    const out = roundTrip(full);
    expect(out.deals.filter((d) => d.type === "wolse-tenant").map((d) => d.id)).toEqual(
      futures.slice(0, MAX_UNKNOWN_DEALS).map((d) => d.id),
    );
    expect(out.deals.filter((d) => d.type === "jeonse")).toHaveLength(MAX_DEALS);
    // 아는 거래가 상한보다 1개 적으면 모르는 거래가 많아도 새 거래를 만들 수 있다
    expect(addDeal(parseDeals(raw({ deals: [...futures, ...known(MAX_DEALS - 1)] })).state, "jeonse", 9_000)).not.toBeNull();
  });

  it("T6 쓴 글자에 새 칸이 없다 — 최상위는 v·deals·active, 거래는 기존 칸만(옛 판이 읽어도 corrupt 가 아니다)", () => {
    const text = raw({
      deals: [deal({ checks: ["jeonse.registry", "jeonse.future-item"], contractDate: "2026-11-20" }), futureDeal()],
      active: { jeonse: "jeonse-a-1", "wolse-tenant": "wolse-tenant-x-1" },
    });
    const out = roundTrip(text, (s) => toggleCheck(s, "jeonse-a-1", "jeonse.trust"));
    expect(Object.keys(out).sort()).toEqual(["active", "deals", "v"]);
    expect(out.v).toBe(1);
    const allowed = new Set(["id", "no", "type", "checks", "createdAt", "contractDate"]);
    for (const d of out.deals) expect(Object.keys(d).filter((k) => !allowed.has(k))).toEqual([]);
    expect(parseDeals(JSON.stringify(out)).ok).toBe(true);
  });
});

describe("매매 유형(세션 516) — 중개사 sale · 매수인 sale-buyer 체크가 저장→읽기에서 살아남고 전세 거래와 섞이지 않는다", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("전세·매매·매수인 거래가 함께 저장돼도 각자의 체크·고른 거래가 그대로 읽힌다", () => {
    let s = addDeal(emptyState(), "jeonse", 1_000)!.state;
    s = toggleCheck(s, s.active.jeonse!, "jeonse.registry");
    const sale = addDeal(s, "sale", 2_000)!;
    s = toggleCheck(sale.state, sale.deal.id, "sale.registry");
    s = toggleCheck(s, sale.deal.id, "jeonse.trust"); // 전세 id → 매매 거래에 안 들어간다
    const buyer = addDeal(s, "sale-buyer", 3_000)!;
    s = toggleCheck(buyer.state, buyer.deal.id, "sale-buyer.loan-calc");
    s = toggleCheck(s, buyer.deal.id, "sale.registry"); // 중개사 매매 id → 매수인 거래에 안 들어간다
    expect(writeDeals(s)).toBe(true);
    const r = readDeals();
    expect(r).toEqual({ ok: true, state: s });
    expect(activeDeal(r.state, "jeonse")?.checks).toEqual(["jeonse.registry"]);
    expect(activeDeal(r.state, "sale")?.checks).toEqual(["sale.registry"]);
    expect(activeDeal(r.state, "sale-buyer")?.checks).toEqual(["sale-buyer.loan-calc"]);
    expect(activeDeal(r.state, "sale-seller")).toBeUndefined();
    // 매수인은 당사자용이라 거래 수 상한에 세지 않는다(전세 1 + 매매 1)
    expect(limitedDealCount(r.state)).toBe(2);
  });

  it("매수인 거래에 남은 매매·매도인·전세 id 는 읽을 때 화면에서 빠진다", () => {
    const text = JSON.stringify({
      v: 1,
      deals: [
        {
          id: "b1",
          no: 1,
          type: "sale-buyer",
          checks: ["sale.registry", "sale-seller.fee", "jeonse.registry", "sale-buyer.fee"],
          createdAt: 1,
        },
      ],
      active: { "sale-buyer": "b1" },
    });
    expect(parseDeals(text).state.deals[0].checks).toEqual(["sale-buyer.fee"]);
  });
});
