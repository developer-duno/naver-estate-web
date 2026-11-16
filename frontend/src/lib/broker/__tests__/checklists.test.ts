/**
 * 「중개 실무」 체크 목록 자료(lib/broker/checklists.ts) — 키 꼴·근거 조문 주소·항목 수(세션 513 PR 2a)
 * 세션 514: audience(broker/party) 거르기 · 조문 글자↔주소 짝 시험은 세 목록(전세·세입자·집주인) 전부를 돈다.
 * 실행: npx vitest run src/lib/broker/__tests__/checklists.test.ts
 */
import { describe, it, expect } from "vitest";
import { BROKER_TYPES, CHECKLISTS, PARTY_TYPES, getChecklist } from "../checklists";

const jeonse = CHECKLISTS.jeonse;
const items = jeonse.stages.flatMap((s) => s.items);

describe("체크 목록 자료", () => {
  it("유형 목록은 CHECKLISTS 키에서 audience 로 갈라 파생 — 중개사용 jeonse · 당사자용 세입자·집주인", () => {
    expect(BROKER_TYPES).toEqual(["jeonse"]);
    expect(PARTY_TYPES).toEqual(["jeonse-tenant", "jeonse-landlord"]);
    expect(BROKER_TYPES.filter((t) => (PARTY_TYPES as string[]).includes(t))).toEqual([]);
    expect([...BROKER_TYPES, ...PARTY_TYPES].sort()).toEqual(Object.keys(CHECKLISTS).sort());
    for (const t of Object.keys(CHECKLISTS) as (keyof typeof CHECKLISTS)[]) expect(CHECKLISTS[t].type).toBe(t);
    expect(getChecklist("jeonse", "broker")).toBe(jeonse);
    expect(getChecklist("wolse", "broker")).toBeUndefined();
    expect(getChecklist("toString", "broker")).toBeUndefined();
    expect(getChecklist("toString", "party")).toBeUndefined();
  });

  it("audience 가 다르면 undefined — /broker/jeonse-tenant · /checklist/jeonse 는 열리지 않는다", () => {
    expect(getChecklist("jeonse-tenant", "broker")).toBeUndefined();
    expect(getChecklist("jeonse-landlord", "broker")).toBeUndefined();
    expect(getChecklist("jeonse", "party")).toBeUndefined();
    expect(getChecklist("jeonse-tenant", "party")).toBe(CHECKLISTS["jeonse-tenant"]);
    expect(getChecklist("jeonse-landlord", "party")).toBe(CHECKLISTS["jeonse-landlord"]);
  });

  it("중개사용 전세의 손님 목록 짝(partyTypes)은 당사자용 목록만 가리킨다", () => {
    expect(jeonse.partyTypes).toEqual(["jeonse-tenant", "jeonse-landlord"]);
    for (const t of jeonse.partyTypes ?? []) expect(getChecklist(t, "party")).toBeDefined();
  });

  it("전세 = 단계 4 · 항목 18", () => {
    expect(jeonse.stages).toHaveLength(4);
    expect(items).toHaveLength(18);
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

  it("근거 조문 글자와 주소가 같은 법령·같은 조문을 가리킨다(label ↔ url) — 세 목록 전부", () => {
    const allItems = Object.values(CHECKLISTS).flatMap((l) => l.stages.flatMap((s) => s.items));
    expect(allItems).toHaveLength(18 + 15 + 10);
    // 화면 글자의 약칭 → 법제처 주소의 법령명(띄어쓰기 뺀 뒤 앞부분만 바꾼다)
    const FULL_NAME: Record<string, string> = { 부동산거래신고법: "부동산거래신고등에관한법률" };
    const ARTICLE = /제\d+조(의\d+)?/;
    for (const item of allItems) {
      for (const law of item.laws) {
        const [, name, article] = decodeURI(law.url).match(/^https:\/\/www\.law\.go\.kr\/법령\/([^/]+)\/([^/]+)$/) ?? [];
        const labelArticle = law.label.match(ARTICLE)?.[0];
        expect({ id: item.id, article: labelArticle }).toEqual({ id: item.id, article });
        let labelName = law.label.slice(0, law.label.search(ARTICLE)).replace(/\s/g, "");
        for (const [short, full] of Object.entries(FULL_NAME)) {
          if (labelName.startsWith(short)) labelName = full + labelName.slice(short.length);
        }
        expect({ id: item.id, name: labelName }).toEqual({ id: item.id, name });
      }
    }
  });

  it("8번 설명 ⓑ 는 임대인 동의를 받아 국세·지방세 열람을 신청한다고 적는다(법 원문 감사 반영)", () => {
    const rights = items.find((i) => i.id === "jeonse.explain-rights");
    expect(rights?.detail).toContain("ⓑ 임대인 동의를 받아 임대인이 내지 않은");
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
