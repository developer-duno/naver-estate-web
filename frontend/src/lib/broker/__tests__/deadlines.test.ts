/**
 * 신고 기한 계산(lib/broker/deadlines.ts) — 계약일 + 30일(첫날 불산입) · 토·일·공휴일이면 다음 첫 평일까지 늘어남 ·
 * 공휴일 목록 기간 밖이면 늘어남 없음 · 상태 세 갈래 · 오늘(한국 시각) · 첫 화면 줄 순서(세션 519)
 * 실행: npx vitest run src/lib/broker/__tests__/deadlines.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  REPORT_ITEM,
  computeDeadline,
  deadlineRows,
  deadlineStatus,
  deadlineTitle,
  formatFull,
  formatShort,
  kindLabel,
  statusText,
  todayKST,
} from "../deadlines";
import { CHECKLISTS, type ChecklistType } from "../checklists";
import { emptyState, type Deal, type DealsState } from "../deals-storage";

/** 거래 하나(시험용) */
function makeDeal(over: Partial<Deal> & Pick<Deal, "id" | "type">): Deal {
  return { no: 1, checks: [], createdAt: 1, ...over };
}

/** 거래 목록 → 상태 */
function stateOf(deals: Deal[]): DealsState {
  return { ...emptyState(), deals };
}

describe("computeDeadline — 기본 기한 · 늘어난 기한(지시서 A1 예시 6개)", () => {
  it.each([
    // [계약일, 기본 기한, 기본 기한 요일, 늘어난 기한, 늘어난 이유]
    ["2026-11-05", "2026-12-05", "토", "2026-12-07", "토요일"],
    ["2026-11-02", "2026-12-02", "수", undefined, undefined],
    ["2026-12-15", "2027-01-14", "목", undefined, undefined],
    // 일요일 + 설 연휴 + 대체공휴일 — 연휴를 전부 넘겨 수요일까지
    ["2027-01-08", "2027-02-07", "일", "2027-02-10", "일요일"],
    // 토요일(노동절) → 일요일 → 대체공휴일 → 화요일
    ["2027-04-01", "2027-05-01", "토", "2027-05-04", "토요일"],
    // 공휴일 목록 기간 밖 — 토요일이어도 늘어난다고 말하지 않는다
    ["2027-12-02", "2028-01-01", "토", undefined, undefined],
  ])("계약 %s → 기본 %s(%s) · 늘어난 %s", (contract, base, wd, extended, kind) => {
    const d = computeDeadline(contract)!;
    expect(d.base).toBe(base);
    expect(formatFull(d.base)).toMatch(new RegExp(`\\(${wd}\\)$`));
    expect(d.extended).toBe(extended);
    expect(d.baseKind).toBe(kind);
  });

  it("평일 공휴일이면 이유에 그 이름 — 2027-09-16(목, 추석) → 다음 날 금요일", () => {
    const d = computeDeadline("2027-08-17")!;
    expect(d).toMatchObject({ base: "2027-09-16", baseKind: "공휴일", baseHoliday: "추석", extended: "2027-09-17" });
    expect(kindLabel(d)).toBe("공휴일(추석)");
  });

  it("토요일 성탄절 → 일요일 → 대체공휴일까지 넘겨 화요일", () => {
    expect(computeDeadline("2027-11-25")).toMatchObject({ base: "2027-12-25", extended: "2027-12-28" });
  });

  it("공휴일 목록 기간보다 앞(2026-09-05 토요일)이면 늘어남 없음", () => {
    expect(computeDeadline("2026-08-06")).toEqual({ base: "2026-09-05" });
  });

  it.each(["2026-02-30", "2026-13-01", "", "20261105"])("틀린 계약일(%s)은 null", (bad) => {
    expect(computeDeadline(bad)).toBeNull();
  });
});

describe("deadlineStatus·statusText — 상태 세 갈래(지시서 A2)", () => {
  const d = computeDeadline("2026-11-05")!; // 기본 12-05(토) · 늘어난 12-07(월)

  it.each([
    ["2026-11-17", "18일 남음"],
    ["2026-12-05", "오늘까지"],
    ["2026-12-06", "늘어난 기한까지 1일 남음"],
    ["2026-12-07", "오늘까지(늘어난 기한)"],
    ["2026-12-08", "기한 지남"],
  ])("오늘 %s → 「%s」", (today, text) => {
    expect(statusText(deadlineStatus(d, today))).toBe(text);
  });

  it("늘어난 기한이 없으면 기본 기한 다음 날부터 바로 「기한 지남」", () => {
    const plain = computeDeadline("2026-11-02")!; // 12-02(수)
    expect(statusText(deadlineStatus(plain, "2026-12-02"))).toBe("오늘까지");
    expect(statusText(deadlineStatus(plain, "2026-12-03"))).toBe("기한 지남");
  });
});

describe("todayKST — 한국 시각의 오늘(지시서 A3)", () => {
  it("UTC 15:30 = 한국 다음 날 00:30", () => {
    expect(todayKST(new Date("2026-11-17T15:30:00Z"))).toBe("2026-11-18");
  });
  it("UTC 14:59:59 = 한국 그날 23:59:59", () => {
    expect(todayKST(new Date("2026-11-17T14:59:59Z"))).toBe("2026-11-17");
  });
});

describe("표기·제목·신고 항목", () => {
  it("formatFull·formatShort", () => {
    expect(formatFull("2026-12-05")).toBe("2026. 12. 5.(토)");
    expect(formatShort("2026-12-07")).toBe("12. 7.(월)");
  });

  it("매매 = 부동산 거래신고 · 전세·월세 = 임대차 신고", () => {
    expect(deadlineTitle("sale")).toBe("부동산 거래신고 기한");
    expect(deadlineTitle("jeonse")).toBe("임대차 신고 기한(신고 대상 계약이면)");
    expect(deadlineTitle("wolse")).toBe("임대차 신고 기한(신고 대상 계약이면)");
  });

  it("신고 항목 id 는 그 중개사용 목록에 실제로 있다(목록이 바뀌어 id 가 사라지면 막는다)", () => {
    const entries = Object.entries(REPORT_ITEM) as [ChecklistType, string][];
    expect(entries.map(([t]) => t).sort()).toEqual(["jeonse", "sale", "wolse"]);
    for (const [t, id] of entries) {
      expect(CHECKLISTS[t].audience).toBe("broker");
      const ids = CHECKLISTS[t].stages.flatMap((s) => s.items.map((i) => i.id));
      expect(ids).toContain(id);
    }
  });
});

describe("deadlineRows — 첫 화면 줄(지시서 A9)", () => {
  const today = "2026-11-17";

  it("순서 = 신고 안 한 것 기본 기한 이른 순(지난 것 먼저) → 신고 체크한 것 · 당사자 유형·계약일 없는 거래는 뺀다", () => {
    const rows = deadlineRows(
      stateOf([
        makeDeal({ id: "j2", type: "jeonse", no: 2, contractDate: "2026-11-05" }),
        makeDeal({ id: "w1", type: "wolse", no: 1, contractDate: "2026-11-12", checks: ["wolse.lease-report"] }),
        makeDeal({ id: "s1", type: "sale", no: 1, contractDate: "2026-11-02" }),
        makeDeal({ id: "j3", type: "jeonse", no: 3, contractDate: "2026-10-10" }),
        makeDeal({ id: "j1", type: "jeonse", no: 1 }),
        makeDeal({ id: "t1", type: "jeonse-tenant", no: 1, contractDate: "2026-10-01" }),
      ]),
      today,
    );
    expect(rows.map((r) => r.id)).toEqual(["j3", "s1", "j2", "w1"]);
    expect(rows.map((r) => r.status.kind)).toEqual(["past", "left", "left", "left"]);
    expect(rows.map((r) => r.reported)).toEqual([false, false, false, true]);
  });

  it("신고 체크한 거래가 기한이 더 일러도 맨 아래", () => {
    const rows = deadlineRows(
      stateOf([
        makeDeal({ id: "a", type: "sale", contractDate: "2026-10-01", checks: ["sale.deal-report"] }),
        makeDeal({ id: "b", type: "sale", no: 2, contractDate: "2026-11-10" }),
      ]),
      today,
    );
    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("거래가 없으면 빈 목록", () => {
    expect(deadlineRows(emptyState(), today)).toEqual([]);
  });
});
