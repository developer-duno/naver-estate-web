/**
 * 「중개 실무」 체크 목록의 거래 묶음 — **이 기기 이 브라우저(localStorage)에만** 저장한다(세션 513 PR 2b).
 *
 * - 키 `broker_deals_v1` 의 `_v1` 은 저장 모양의 판 번호다. 모양을 바꾸면 `broker_deals_v2` 새 키를 만들고,
 *   읽을 때 v1 을 v2 로 옮기는 이관 함수를 두며, 옮긴 뒤 옛 키는 지운다(같은 키에 다른 모양을 덮어쓰지 않는다).
 * - 체크는 **항목 id 로만** 저장한다(순번 금지) — 법이 바뀌어 항목이 중간에 끼어들어도 체크가 다른 줄로 옮겨 가지 않게.
 *   지금 CHECKLISTS 에 없는 id 는 읽을 때 버린다.
 * - 손님 이름·연락처·자유 글 칸은 두지 않는다(칸 = 거래 번호 · 거래 유형 · 계약일).
 * - 읽을 때 모양을 검사한다(`readJSON` 은 검사가 없다). 모양이 틀리면 통째로 버리고 corrupt 를 돌려 화면이 한 번 알린다.
 * - 쓰기는 `safeSetItem` — 막힌 브라우저면 false 를 그대로 돌려 화면이 알린다.
 * 화면 = `components/broker/DealChecklist.tsx` · 시험 = `src/lib/broker/__tests__/deals-storage.test.ts`.
 */
import { safeSetItem } from "@/lib/storage";
import { CHECKLISTS, type ChecklistType } from "./checklists";

export const DEALS_KEY = "broker_deals_v1";
/** 저장하는 거래 수 상한(모든 유형 합) */
export const MAX_DEALS = 20;

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
};

export type DealsState = {
  v: 1;
  deals: Deal[];
  /** 유형마다 지금 고른 거래 id */
  active: Partial<Record<ChecklistType, string>>;
};

export type ReadResult = { ok: true; state: DealsState } | { ok: false; reason: "corrupt"; state: DealsState };

export function emptyState(): DealsState {
  return { v: 1, deals: [], active: {} };
}

function isKnownType(t: unknown): t is ChecklistType {
  return typeof t === "string" && Object.prototype.hasOwnProperty.call(CHECKLISTS, t);
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
    // 모르는 유형(이 판에 없는 체크 목록)의 거래는 조용히 뺀다
    if (!isKnownType(d.type)) continue;
    const known = itemIds(d.type);
    const deal: Deal = {
      id: d.id,
      no: d.no as number,
      type: d.type,
      checks: [...new Set(d.checks as string[])].filter((c) => known.has(c)),
      createdAt: d.createdAt,
    };
    if (d.contractDate !== undefined) deal.contractDate = d.contractDate as string;
    deals.push(deal);
  }
  const kept = deals.slice(0, MAX_DEALS);
  const active: DealsState["active"] = {};
  for (const [t, id] of Object.entries(data.active)) {
    if (isKnownType(t) && kept.some((d) => d.id === id && d.type === t)) active[t] = id as string;
  }
  return { ok: true, state: { v: 1, deals: kept, active } };
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

/** 저장 — 막힌 브라우저면 false */
export function writeDeals(state: DealsState): boolean {
  return safeSetItem(DEALS_KEY, JSON.stringify(state), "broker-deals");
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

/** 새 거래(번호 = 그 유형의 가장 큰 번호 + 1)를 만들고 고른다. 상한이면 null. */
export function addDeal(state: DealsState, type: ChecklistType, now: number): { state: DealsState; deal: Deal } | null {
  if (state.deals.length >= MAX_DEALS) return null;
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

/** 고른 거래 하나의 체크를 모두 지운다 — 지운 id 목록을 함께 돌려 되돌리기에 쓴다 */
export function clearChecks(state: DealsState, dealId: string): { state: DealsState; removed: string[] } {
  const removed = state.deals.find((d) => d.id === dealId)?.checks ?? [];
  return { state: mapDeal(state, dealId, (d) => ({ ...d, checks: [] })), removed: [...removed] };
}

/** 되돌리기 — 지웠던 체크를 다시 넣는다(그 사이 새로 켠 체크는 남긴다) */
export function restoreChecks(state: DealsState, dealId: string, checks: string[]): DealsState {
  return mapDeal(state, dealId, (d) => {
    const known = itemIds(d.type);
    return { ...d, checks: [...new Set([...checks, ...d.checks])].filter((c) => known.has(c)) };
  });
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
