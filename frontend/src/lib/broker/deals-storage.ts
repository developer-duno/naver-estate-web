/**
 * 「중개 실무」 체크 목록의 거래 묶음 — **이 기기 이 브라우저(localStorage)에만** 저장한다(세션 513 PR 2b).
 *
 * - 키 `broker_deals_v1` 의 `_v1` 은 저장 모양의 판 번호다. 모양을 바꾸면 `broker_deals_v2` 새 키를 만들고,
 *   읽을 때 v1 을 v2 로 옮기는 이관 함수를 두며, 옮긴 뒤 옛 키는 지운다(같은 키에 다른 모양을 덮어쓰지 않는다).
 * - 체크는 **항목 id 로만** 저장한다(순번 금지) — 법이 바뀌어 항목이 중간에 끼어들어도 체크가 다른 줄로 옮겨 가지 않게.
 * - 이 판의 CHECKLISTS 에 없는 유형의 거래·없는 항목 id 의 체크·active 의 모르는 유형 열쇠는 **읽을 때 화면에서 숨기고 쓸 때 보존**한다
 *   (`unknown*` 칸에 들고 있다가 `writeDeals` 가 기존 deals·checks·active 자리에 다시 붙인다 — 저장 모양에 새 칸은 없다).
 *   새 판(새 유형·새 항목)이 저장한 것을 옛 판으로 열린 탭이 체크 한 번에 지우지 않게(세션 515).
 *   모르는 거래는 상한에 세지 않고, 보존은 앞 MAX_UNKNOWN_DEALS 개까지.
 * - 손님 이름·연락처·자유 글 칸은 두지 않는다(칸 = 거래 번호 · 거래 유형 · 계약일).
 * - 읽을 때 모양을 검사한다(`readJSON` 은 검사가 없다). 모양이 틀리면 통째로 버리고 corrupt 를 돌려 화면이 한 번 알린다.
 * - 쓰기는 `safeSetItem` — 막힌 브라우저면 false 를 그대로 돌려 화면이 알린다.
 * 화면 = `components/broker/DealChecklist.tsx` · 시험 = `src/lib/broker/__tests__/deals-storage.test.ts`.
 */
import { safeSetItem } from "@/lib/storage";
import { CHECKLISTS, type ChecklistType } from "./checklists";

export const DEALS_KEY = "broker_deals_v1";
/**
 * 중개사용 목록(audience broker)의 거래 수 상한(그 유형들 합).
 * 세입자·집주인 같은 당사자용 목록(audience party)은 유형마다 거래가 1개뿐이라 이 합계에 넣지 않는다 —
 * 중개사 거래가 꽉 차도 당사자용 장의 첫 체크가 늘 저장되게(세션 514).
 */
export const MAX_DEALS = 20;
/** 이 판이 모르는 유형의 거래를 보존하는 최대 개수(넘으면 뒤쪽을 버린다 — 한없이 늘지 않게) */
export const MAX_UNKNOWN_DEALS = 50;

export type Deal = {
  id: string;
  /** 화면 이름 「거래 N」의 N(유형마다 1부터) */
  no: number;
  type: ChecklistType;
  /** 계약일(YYYY-MM-DD, 선택) */
  contractDate?: string;
  /** 체크한 항목 id */
  checks: string[];
  createdAt: number;
  /** 이 판이 모르는 항목 id 의 체크 — 화면에 안 보이고, 쓸 때 checks 뒤에 다시 붙인다(없으면 칸 자체가 없다) */
  unknownChecks?: string[];
};

export type DealsState = {
  v: 1;
  deals: Deal[];
  /** 유형마다 지금 고른 거래 id */
  active: Partial<Record<ChecklistType, string>>;
  /** 이 판이 모르는 유형의 거래(읽은 그대로) — 화면에 안 보이고, 쓸 때 deals 뒤에 다시 붙인다(없으면 칸 자체가 없다) */
  unknownDeals?: Record<string, unknown>[];
  /** active 의 모르는 유형 열쇠 — 쓸 때 active 에 다시 붙인다(없으면 칸 자체가 없다) */
  unknownActive?: Record<string, string>;
};

export type ReadResult = { ok: true; state: DealsState } | { ok: false; reason: "corrupt"; state: DealsState };

export function emptyState(): DealsState {
  return { v: 1, deals: [], active: {} };
}

function isKnownType(t: unknown): t is ChecklistType {
  return typeof t === "string" && Object.prototype.hasOwnProperty.call(CHECKLISTS, t);
}

/** 당사자용(세입자·집주인) 유형인가 — 유형마다 거래 1개, 상한 합계에서 뺀다 */
function isPartyType(type: ChecklistType): boolean {
  return CHECKLISTS[type].audience === "party";
}

/** 상한(MAX_DEALS)에 세는 거래 수 = 중개사용 유형의 거래만 */
export function limitedDealCount(state: DealsState): number {
  return state.deals.filter((d) => !isPartyType(d.type)).length;
}

function itemIds(type: ChecklistType): Set<string> {
  return new Set(CHECKLISTS[type].stages.flatMap((s) => s.items.map((i) => i.id)));
}

/** 계약일 형식 — YYYY-MM-DD 이고 실제 있는 날짜 */
export function isValidDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** 저장된 글자 → 상태. 없으면 빈 상태, 모양이 틀리면 corrupt(빈 상태와 함께). */
export function parseDeals(raw: string | null): ReadResult {
  if (raw === null) return { ok: true, state: emptyState() };
  const corrupt: ReadResult = { ok: false, reason: "corrupt", state: emptyState() };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return corrupt;
  }
  if (!isPlainObject(data) || data.v !== 1 || !Array.isArray(data.deals) || !isPlainObject(data.active)) {
    return corrupt;
  }
  const deals: Deal[] = [];
  const unknownDeals: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const d of data.deals) {
    if (
      !isPlainObject(d) ||
      typeof d.id !== "string" ||
      d.id === "" ||
      seen.has(d.id) ||
      !Number.isInteger(d.no) ||
      (d.no as number) < 1 ||
      typeof d.type !== "string" ||
      !Array.isArray(d.checks) ||
      !d.checks.every((c) => typeof c === "string") ||
      typeof d.createdAt !== "number" ||
      !Number.isFinite(d.createdAt) ||
      (d.contractDate !== undefined && !isValidDate(d.contractDate))
    ) {
      return corrupt;
    }
    seen.add(d.id);
    // 모르는 유형(이 판에 없는 체크 목록)의 거래는 화면에서 빼되, 읽은 그대로 들고 있다가 쓸 때 다시 붙인다
    if (!isKnownType(d.type)) {
      if (unknownDeals.length < MAX_UNKNOWN_DEALS) unknownDeals.push(d);
      continue;
    }
    const known = itemIds(d.type);
    const ids = [...new Set(d.checks as string[])];
    const deal: Deal = {
      id: d.id,
      no: d.no as number,
      type: d.type,
      checks: ids.filter((c) => known.has(c)),
      createdAt: d.createdAt,
    };
    if (d.contractDate !== undefined) deal.contractDate = d.contractDate as string;
    const unknownChecks = ids.filter((c) => !known.has(c));
    if (unknownChecks.length > 0) deal.unknownChecks = unknownChecks;
    deals.push(deal);
  }
  // 중개사용 거래는 앞에서부터 상한까지, 당사자용 거래는 유형마다 첫 1개만 남긴다
  let limited = 0;
  const partySeen = new Set<ChecklistType>();
  const kept = deals.filter((d) => {
    if (isPartyType(d.type)) {
      if (partySeen.has(d.type)) return false;
      partySeen.add(d.type);
      return true;
    }
    return ++limited <= MAX_DEALS;
  });
  const active: DealsState["active"] = {};
  const unknownActive: [string, string][] = [];
  for (const [t, id] of Object.entries(data.active)) {
    if (isKnownType(t)) {
      if (kept.some((d) => d.id === id && d.type === t)) active[t] = id as string;
    } else if (typeof id === "string") {
      unknownActive.push([t, id]);
    }
  }
  const state: DealsState = { v: 1, deals: kept, active };
  if (unknownDeals.length > 0) state.unknownDeals = unknownDeals;
  // fromEntries 는 열쇠를 제 칸으로 만든다("__proto__" 열쇠도 원형을 건드리지 않는다)
  if (unknownActive.length > 0) state.unknownActive = Object.fromEntries(unknownActive);
  return { ok: true, state };
}

/** 이 브라우저에서 읽기(서버·막힌 저장소면 빈 상태) */
export function readDeals(): ReadResult {
  if (typeof window === "undefined") return { ok: true, state: emptyState() };
  let raw: string | null;
  try {
    raw = localStorage.getItem(DEALS_KEY);
  } catch {
    return { ok: true, state: emptyState() };
  }
  return parseDeals(raw);
}

/** 상태 → 저장 글자. 보존해 둔 모르는 거래·체크·active 열쇠를 기존 자리에 다시 붙인다(새 칸을 만들지 않는다). */
function serializeDeals(state: DealsState): string {
  const deals: Record<string, unknown>[] = state.deals.map((d) => {
    const out: Record<string, unknown> = {
      id: d.id,
      no: d.no,
      type: d.type,
      checks: [...d.checks, ...(d.unknownChecks ?? [])],
      createdAt: d.createdAt,
    };
    if (d.contractDate !== undefined) out.contractDate = d.contractDate;
    return out;
  });
  return JSON.stringify({
    v: 1,
    deals: [...deals, ...(state.unknownDeals ?? [])],
    active: { ...state.unknownActive, ...state.active },
  });
}

/** 저장 — 막힌 브라우저면 false */
export function writeDeals(state: DealsState): boolean {
  return safeSetItem(DEALS_KEY, serializeDeals(state), "broker-deals");
}

/** 그 유형의 거래들(번호 순) */
export function dealsOf(state: DealsState, type: ChecklistType): Deal[] {
  return state.deals.filter((d) => d.type === type).sort((a, b) => a.no - b.no);
}

/** 그 유형에서 지금 고른 거래 — 고른 것이 없으면 번호가 가장 큰 거래 */
export function activeDeal(state: DealsState, type: ChecklistType): Deal | undefined {
  const list = dealsOf(state, type);
  return list.find((d) => d.id === state.active[type]) ?? list[list.length - 1];
}

function mapDeal(state: DealsState, dealId: string, fn: (d: Deal) => Deal): DealsState {
  return { ...state, deals: state.deals.map((d) => (d.id === dealId ? fn(d) : d)) };
}

/**
 * 새 거래(번호 = 그 유형의 가장 큰 번호 + 1)를 만들고 고른다.
 * 중개사용 유형은 상한(MAX_DEALS)이면 null · 당사자용 유형은 이미 거래가 있으면 null(유형마다 1개).
 */
export function addDeal(state: DealsState, type: ChecklistType, now: number): { state: DealsState; deal: Deal } | null {
  if (isPartyType(type) ? dealsOf(state, type).length > 0 : limitedDealCount(state) >= MAX_DEALS) return null;
  const no = dealsOf(state, type).reduce((m, d) => Math.max(m, d.no), 0) + 1;
  const deal: Deal = { id: `${type}-${now.toString(36)}-${no}`, no, type, checks: [], createdAt: now };
  return { state: { ...state, deals: [...state.deals, deal], active: { ...state.active, [type]: deal.id } }, deal };
}

export function setActive(state: DealsState, type: ChecklistType, dealId: string): DealsState {
  if (!state.deals.some((d) => d.id === dealId && d.type === type)) return state;
  return { ...state, active: { ...state.active, [type]: dealId } };
}

/** 항목 체크를 켜고 끈다(그 유형에 없는 id 는 무시) */
export function toggleCheck(state: DealsState, dealId: string, itemId: string): DealsState {
  return mapDeal(state, dealId, (d) => {
    if (!itemIds(d.type).has(itemId)) return d;
    const checks = d.checks.includes(itemId) ? d.checks.filter((c) => c !== itemId) : [...d.checks, itemId];
    return { ...d, checks };
  });
}

/**
 * 고른 거래 하나의 체크를 모두 지운다(이 판이 모르는 항목 체크까지) — 지운 id 목록을 함께 돌려 되돌리기에 쓴다.
 * removed = 화면에 보이던 체크(알림 숫자) · removedUnknown = 모르는 항목 체크.
 */
export function clearChecks(
  state: DealsState,
  dealId: string,
): { state: DealsState; removed: string[]; removedUnknown: string[] } {
  const deal = state.deals.find((d) => d.id === dealId);
  const next = mapDeal(state, dealId, (d) => {
    const cleared = { ...d, checks: [] };
    delete cleared.unknownChecks;
    return cleared;
  });
  return { state: next, removed: [...(deal?.checks ?? [])], removedUnknown: [...(deal?.unknownChecks ?? [])] };
}

/** 되돌리기 — 지웠던 체크(모르는 항목 체크 포함)를 다시 넣는다(그 사이 새로 켠 체크는 남긴다) */
export function restoreChecks(state: DealsState, dealId: string, checks: string[], unknown: string[] = []): DealsState {
  return mapDeal(state, dealId, (d) => {
    const known = itemIds(d.type);
    const next = { ...d, checks: [...new Set([...checks, ...d.checks])].filter((c) => known.has(c)) };
    const unknownChecks = [...new Set([...unknown, ...(d.unknownChecks ?? [])])].filter((c) => !known.has(c));
    if (unknownChecks.length > 0) next.unknownChecks = unknownChecks;
    return next;
  });
}

/** 지운 거래 하나 — 되살리기에 그대로 쓴다(거래 칸·모르는 체크·원래 자리·지우기 전 active) */
export type RemovedDeal = { deal: Deal; index: number; prevActive: DealsState["active"] };

/** 거래 하나를 지운다(그 거래를 가리키던 active 열쇠도 뺀다). 없는 id 면 null. */
export function removeDeal(state: DealsState, dealId: string): { state: DealsState; removed: RemovedDeal } | null {
  const index = state.deals.findIndex((d) => d.id === dealId);
  if (index < 0) return null;
  const deal = state.deals[index];
  const active = { ...state.active };
  if (active[deal.type] === dealId) delete active[deal.type];
  return {
    state: { ...state, deals: state.deals.filter((d) => d.id !== dealId), active },
    removed: { deal, index, prevActive: { ...state.active } },
  };
}

/**
 * 되돌리기 — 지운 거래를 그대로(체크·모르는 체크·계약일·만든 시각·id) 원래 자리에 되살리고 그 거래를 고른다.
 * active 열쇠 순서도 지우기 전대로 둔다(그 사이 바뀐 다른 유형 값은 지금 값). 같은 id 가 이미 있거나
 * 상한(중개사용 MAX_DEALS · 당사자용 1개)에 걸리면 null(되살리지 않는다).
 */
export function restoreDeal(state: DealsState, removed: RemovedDeal): DealsState | null {
  const { deal, index, prevActive } = removed;
  if (state.deals.some((d) => d.id === deal.id)) return null;
  if (isPartyType(deal.type) ? dealsOf(state, deal.type).length > 0 : limitedDealCount(state) >= MAX_DEALS) return null;
  const deals = [...state.deals];
  deals.splice(Math.min(index, deals.length), 0, deal);
  // 지우기 전 열쇠 순서대로 먼저 자리를 잡고(되살린 유형 = 그 거래), 그 사이 새로 생긴 열쇠는 뒤에 붙인다
  const active: DealsState["active"] = {};
  for (const t of Object.keys(prevActive) as ChecklistType[]) {
    const id = t === deal.type ? deal.id : state.active[t];
    if (id !== undefined) active[t] = id;
  }
  Object.assign(active, state.active, { [deal.type]: deal.id });
  return { ...state, deals, active };
}

/** 계약일 넣기·지우기(빈 값 = 지우기). 형식이 틀리면 null. */
export function setContractDate(state: DealsState, dealId: string, date: string | undefined): DealsState | null {
  if (date !== undefined && date !== "" && !isValidDate(date)) return null;
  return mapDeal(state, dealId, (d) => {
    const next = { ...d };
    if (date) next.contractDate = date;
    else delete next.contractDate;
    return next;
  });
}
