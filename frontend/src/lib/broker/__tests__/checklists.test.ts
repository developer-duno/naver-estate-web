/**
 * 「중개 실무」 체크 목록 자료(lib/broker/checklists.ts) — 키 꼴·근거 조문 주소·항목 수(세션 513 PR 2a)
 * 실행: npx vitest run src/lib/broker/__tests__/checklists.test.ts
 */
import { describe, it, expect } from "vitest";
import { CHECKLISTS, CHECKLIST_TYPES, getChecklist } from "../checklists";

const jeonse = CHECKLISTS.jeonse;
const items = jeonse.stages.flatMap((s) => s.items);

describe("체크 목록 자료", () => {
  it("유형 목록은 CHECKLISTS 키에서 파생 — 지금은 jeonse 하나", () => {
    expect(CHECKLIST_TYPES).toEqual(["jeonse"]);
    for (const t of CHECKLIST_TYPES) expect(CHECKLISTS[t].type).toBe(t);
    expect(getChecklist("jeonse")).toBe(jeonse);
    expect(getChecklist("wolse")).toBeUndefined();
    expect(getChecklist("toString")).toBeUndefined();
  });

  it("전세 = 단계 4 · 항목 17", () => {
    expect(jeonse.stages).toHaveLength(4);
    expect(items).toHaveLength(17);
  });

  it("항목 id 는 서로 다르고 `jeonse.` + 소문자/하이픈 꼴(다음 PR 의 체크 저장 키)", () => {
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^jeonse\.[a-z]+(-[a-z]+)*$/);
  });

  it("모든 항목에 근거 조문 1개 이상 · 주소는 법제처 한글 주소(https://www.law.go.kr/법령/)", () => {
    for (const item of items) {
      expect(item.laws.length).toBeGreaterThanOrEqual(1);
      for (const law of item.laws) {
        expect(law.url.startsWith("https://www.law.go.kr/법령/")).toBe(true);
        expect(law.label.length).toBeGreaterThan(0);
      }
    }
  });

  it("바로가기 링크는 사이트 안 주소(/) 또는 https 원문만", () => {
    const links = items.flatMap((i) => i.links ?? []);
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) expect(l.href.startsWith("/") || l.href.startsWith("https://")).toBe(true);
  });

  it("법령 기준일은 YYYY-MM-DD 이고 실제 날짜", () => {
    expect(jeonse.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(jeonse.checkedAt).toISOString().slice(0, 10)).toBe(jeonse.checkedAt);
  });

  it("신뢰도를 변명하는 문장이 없다(금지 문구 2종 0)", () => {
    // 금지 문구를 이어 붙여 만든다 — 이 시험 파일 자체가 `grep -rn "<금지 문구>" src/lib/broker` 검사에 걸리지 않게
    const banned = ["참고" + "용", "정확하지 않을" + " 수"];
    const all = JSON.stringify(CHECKLISTS);
    for (const w of banned) expect(all).not.toContain(w);
  });
});
