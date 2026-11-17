/**
 * 중개사용 체크 목록(매매·전세·월세)의 신고 기한 계산 — 순수 함수(세션 519).
 *
 * - 신고 기한 = 「계약 체결일부터 30일 이내」(부동산거래신고법 제3조 ① 매매 · 제6조의2 ① 임대차).
 * - 세는 법 = 첫날(계약일)은 빼고(민법 제157조) → 기본 기한 = 계약일 + 30일.
 *   기본 기한이 토요일·공휴일이면 다음 날로 늘어난다(민법 제161조 — 일요일도 공휴일).
 *   행정기본법 제6조 ② 는 「국민에게 불리한 경우에는 그러하지 아니하다」 단서라 결과가 같다.
 * - 늘어난 기한은 기본 기한이 공휴일 목록(lib/broker/holidays.ts)이 다루는 기간 안일 때만 계산한다 —
 *   기간 밖이면 공휴일을 모르므로 늘어난다고 말하지 않는다(기본 기한만 보여 주면 언제나 기한 안이다).
 * - 날짜는 전부 YYYY-MM-DD 문자열로 UTC 자정 기준 계산한다(시간대를 섞지 않는다). 「오늘」만 한국 시각으로 뽑는다.
 * - 저장 모양은 바꾸지 않는다 — 거래에 이미 있는 계약일로 그때그때 계산한다.
 * 시험 = `src/lib/broker/__tests__/deadlines.test.ts`.
 */
import { CHECKLISTS, type ChecklistType } from "./checklists";
import { isValidDate, type DealsState } from "./deals-storage";
import { holidayCovered, holidayName } from "./holidays";

/** 신고 기한 일수 */
export const REPORT_DAYS = 30;

/** 유형별 신고 항목 id — 이 항목을 체크한 거래는 「신고 항목 체크함」으로 보인다 */
export const REPORT_ITEM: Partial<Record<ChecklistType, string>> = {
  sale: "sale.deal-report",
  jeonse: "jeonse.lease-report",
  wolse: "wolse.lease-report",
};

/** 기한 상자 제목 — 매매 = 거래신고 · 전세·월세 = 임대차 신고 */
export function deadlineTitle(type: ChecklistType): string {
  return type === "sale" ? "부동산 거래신고 기한" : "임대차 신고 기한(신고 대상 계약이면)";
}

export type DayKind = "토요일" | "일요일" | "공휴일";

export type Deadline = {
  /** 기본 기한 = 계약일 + 30일 */
  base: string;
  /** 기본 기한이 토·일·공휴일이고 공휴일 목록 기간 안이면 그 성질(토·일이 공휴일보다 먼저) */
  baseKind?: DayKind;
  /** 기본 기한이 공휴일이면 그 이름 */
  baseHoliday?: string;
  /** 늘어난 기한 = 기본 기한 다음의 첫 평일(없으면 늘어나지 않음) */
  extended?: string;
};

export type DeadlineStatus =
  | { kind: "left"; days: number }
  | { kind: "extended-left"; days: number }
  | { kind: "past" };

const DAY_MS = 86_400_000;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function toMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** 날짜에 n 일 더하기 */
export function addDays(iso: string, n: number): string {
  return fromMs(toMs(iso) + n * DAY_MS);
}

/** 두 날짜의 차이(to − from, 날 수) */
export function daysBetween(from: string, to: string): number {
  return Math.round((toMs(to) - toMs(from)) / DAY_MS);
}

/** 요일 한 글자(일~토) */
export function weekdayOf(iso: string): string {
  return WEEKDAYS[new Date(toMs(iso)).getUTCDay()];
}

/** 그날이 토·일·공휴일인가(공휴일 목록 기간 밖이면 공휴일은 모르므로 토·일만 본다) */
function dayKind(iso: string): DayKind | undefined {
  const w = new Date(toMs(iso)).getUTCDay();
  if (w === 6) return "토요일";
  if (w === 0) return "일요일";
  return holidayName(iso) ? "공휴일" : undefined;
}

/** 계약일 → 신고 기한. 계약일 형식이 틀리면 null. */
export function computeDeadline(contractDate: string): Deadline | null {
  if (!isValidDate(contractDate)) return null;
  const base = addDays(contractDate, REPORT_DAYS);
  if (!holidayCovered(base)) return { base };
  const kind = dayKind(base);
  if (!kind) return { base };
  const out: Deadline = { base, baseKind: kind };
  const name = holidayName(base);
  if (name) out.baseHoliday = name;
  // 다음 첫 평일까지 — 연휴가 이어져도 전부 넘긴다. 목록 기간을 넘어가면 모르므로 늘어난다고 말하지 않는다.
  let next = addDays(base, 1);
  while (dayKind(next)) next = addDays(next, 1);
  if (holidayCovered(next)) out.extended = next;
  return out;
}

/** 오늘 기준 상태 — 남은 날수는 기본 기한으로 세고, 기본 기한이 지났으면 늘어난 기한으로 센다 */
export function deadlineStatus(d: Deadline, today: string): DeadlineStatus {
  if (today <= d.base) return { kind: "left", days: daysBetween(today, d.base) };
  if (d.extended && today <= d.extended) return { kind: "extended-left", days: daysBetween(today, d.extended) };
  return { kind: "past" };
}

/** 상태 글자 */
export function statusText(s: DeadlineStatus): string {
  if (s.kind === "left") return s.days === 0 ? "오늘까지" : `${s.days}일 남음`;
  if (s.kind === "extended-left") return s.days === 0 ? "오늘까지(늘어난 기한)" : `늘어난 기한까지 ${s.days}일 남음`;
  return "기한 지남";
}

const KST_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 한국 시각의 오늘(YYYY-MM-DD) — 시각은 밖에서 넣는다(시험에서 고정) */
export function todayKST(now: Date): string {
  return KST_DATE.format(now);
}

/** "2026-12-05" → "2026. 12. 5.(토)" */
export function formatFull(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${y}. ${Number(m)}. ${Number(d)}.(${weekdayOf(iso)})`;
}

/** "2026-12-07" → "12. 7.(월)" */
export function formatShort(iso: string): string {
  return `${formatMonthDay(iso)}(${weekdayOf(iso)})`;
}

/** "2026-10-10" → "10. 10." */
export function formatMonthDay(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}. ${Number(d)}.`;
}

/** 첫 화면 「내 거래 신고 기한」 한 줄 */
export type DeadlineRow = {
  id: string;
  type: ChecklistType;
  no: number;
  contractDate: string;
  deadline: Deadline;
  status: DeadlineStatus;
  /** 그 유형의 신고 항목을 체크했나 */
  reported: boolean;
};

/**
 * 저장된 거래 → 첫 화면 줄. 중개사용 유형(신고 항목이 있는 유형)이고 계약일이 있는 거래만.
 * 순서 = 신고 안 한 것을 기본 기한 이른 순(지난 것이 자연히 먼저) → 신고 체크한 것(기본 기한 이른 순).
 */
export function deadlineRows(state: DealsState, today: string): DeadlineRow[] {
  const rows: DeadlineRow[] = [];
  for (const d of state.deals) {
    const item = REPORT_ITEM[d.type];
    if (!item || CHECKLISTS[d.type].audience !== "broker" || !d.contractDate) continue;
    const deadline = computeDeadline(d.contractDate);
    if (!deadline) continue;
    rows.push({
      id: d.id,
      type: d.type,
      no: d.no,
      contractDate: d.contractDate,
      deadline,
      status: deadlineStatus(deadline, today),
      reported: d.checks.includes(item),
    });
  }
  return rows.sort(
    (a, b) =>
      Number(a.reported) - Number(b.reported) ||
      a.deadline.base.localeCompare(b.deadline.base) ||
      a.type.localeCompare(b.type) ||
      a.no - b.no,
  );
}

/** 기본 기한이 늘어나는 이유 — "토요일" · "일요일" · "공휴일(설날)" */
export function kindLabel(d: Deadline): string {
  if (d.baseKind === "공휴일" && d.baseHoliday) return `공휴일(${d.baseHoliday})`;
  return d.baseKind ?? "";
}
