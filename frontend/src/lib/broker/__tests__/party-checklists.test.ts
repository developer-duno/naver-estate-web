/**
 * 「계약 체크 목록」 세입자·집주인 자료(lib/broker/party-checklists.ts) — 항목 수·id 꼴·근거 조문·기준일(세션 514)
 * 조문 글자↔주소 짝 시험은 checklists.test.ts 에서 세 목록 전부를 돈다.
 * 실행: npx vitest run src/lib/broker/__tests__/party-checklists.test.ts
 */
import { describe, it, expect } from "vitest";
import { CHECKLISTS } from "../checklists";
import { JEONSE_LANDLORD, JEONSE_TENANT } from "../party-checklists";

const itemsOf = (l: typeof JEONSE_TENANT) => l.stages.flatMap((s) => s.items);

describe("계약 체크 목록 자료 — 세입자·집주인", () => {
  it("레지스트리에 같은 객체로 들어 있고 audience 는 party", () => {
    expect(CHECKLISTS["jeonse-tenant"]).toBe(JEONSE_TENANT);
    expect(CHECKLISTS["jeonse-landlord"]).toBe(JEONSE_LANDLORD);
    expect(JEONSE_TENANT.audience).toBe("party");
    expect(JEONSE_LANDLORD.audience).toBe("party");
  });

  it("세입자 = 단계 4 · 항목 15 / 집주인 = 단계 3 · 항목 10", () => {
    expect(JEONSE_TENANT.stages.map((s) => s.title)).toEqual([
      "계약 전 — 집과 집주인 확인",
      "계약",
      "계약 뒤 — 이사 날까지",
      "만기 때",
    ]);
    expect(itemsOf(JEONSE_TENANT)).toHaveLength(15);
    expect(JEONSE_LANDLORD.stages.map((s) => s.title)).toEqual(["계약 전·계약", "계약 뒤", "만기 때"]);
    expect(itemsOf(JEONSE_LANDLORD)).toHaveLength(10);
  });

  it("이름·제목·설명(사장님 승인 글자)", () => {
    expect(JEONSE_TENANT).toMatchObject({ name: "세입자용", h1: "전세 계약 체크 목록 — 세입자용" });
    expect(JEONSE_LANDLORD).toMatchObject({ name: "집주인용", h1: "전세 계약 체크 목록 — 집주인용" });
    expect(JEONSE_TENANT.description).toContain("세입자(임차인)");
    expect(JEONSE_LANDLORD.description).toContain("집주인(임대인)");
  });

  it("항목 id 는 세 목록을 합쳐 서로 다르고, 유형 접두어 + 소문자/하이픈 꼴(체크 저장 키)", () => {
    const all = Object.values(CHECKLISTS).flatMap((l) => l.stages.flatMap((s) => s.items.map((i) => i.id)));
    expect(new Set(all).size).toBe(all.length);
    for (const id of itemsOf(JEONSE_TENANT).map((i) => i.id)) expect(id).toMatch(/^jeonse-tenant\.[a-z]+(-[a-z]+)*$/);
    for (const id of itemsOf(JEONSE_LANDLORD).map((i) => i.id)) expect(id).toMatch(/^jeonse-landlord\.[a-z]+(-[a-z]+)*$/);
  });

  it("모든 항목에 근거 조문 1개 이상 · 주소는 법제처 한글 주소 · 바로가기는 사이트 안 계산기", () => {
    for (const item of [...itemsOf(JEONSE_TENANT), ...itemsOf(JEONSE_LANDLORD)]) {
      expect(item.laws.length).toBeGreaterThanOrEqual(1);
      for (const law of item.laws) expect(law.url.startsWith("https://www.law.go.kr/법령/")).toBe(true);
      for (const l of item.links ?? []) expect(l.href).toBe("/tools/brokerage-fee");
    }
    expect(itemsOf(JEONSE_TENANT).find((i) => i.id === "jeonse-tenant.fee")?.links).toHaveLength(1);
    expect(itemsOf(JEONSE_LANDLORD).find((i) => i.id === "jeonse-landlord.fee")?.links).toHaveLength(1);
  });

  it("법령 기준일 2026-11-16 · 넣지 않은 것 3가지", () => {
    for (const l of [JEONSE_TENANT, JEONSE_LANDLORD]) {
      expect(l.checkedAt).toBe("2026-11-16");
      expect(l.notCovered).toEqual(["전세보증(HUG 등) 가입 요건", "전세대출 조건", "개별 특약 문구"]);
    }
  });

  it("법 원문 검사 반영(세션 514) — 세입자 6번 근거 ④·② 포함 · 보강 설명 4건 · 세입자 9·14번 근거 추가", () => {
    const item = (l: typeof JEONSE_TENANT, id: string) => itemsOf(l).find((i) => i.id === id)!;
    expect(item(JEONSE_TENANT, "jeonse-tenant.contract-docs").laws.map((x) => x.label)).toEqual([
      "공인중개사법 제25조 제3항·제4항",
      "공인중개사법 제26조 제1항·제2항",
    ]);
    expect(item(JEONSE_TENANT, "jeonse-tenant.landlord-info").detail).toBe("법은 집주인이 계약할 때 세입자에게 보여 주도록 정합니다.");
    const report = item(JEONSE_TENANT, "jeonse-tenant.lease-report");
    expect(report.detail).toBe("보증금 6천만원 초과 또는 월 차임 30만원 초과 계약이 대상입니다.");
    expect(report.laws.map((x) => x.label)).toContain("부동산거래신고법 시행령 제4조의3");
    expect(item(JEONSE_TENANT, "jeonse-tenant.implied-renewal-exit").laws.map((x) => x.label)).toContain(
      "주택임대차보호법 제6조의3 제4항",
    );
    expect(item(JEONSE_LANDLORD, "jeonse-landlord.lease-report").detail).toBe(
      "한쪽이 신고를 거부하면 다른 쪽이 혼자 신고할 수 있습니다.",
    );
    expect(item(JEONSE_LANDLORD, "jeonse-landlord.renewal-refusal").detail).toBe(
      "손해배상은 정당한 사유 없이, 원래 갱신됐을 기간이 끝나기 전에 남에게 세를 준 경우입니다.",
    );
  });

  it("신뢰도를 변명하는 문장이 없다(금지 문구 2종 0)", () => {
    const banned = ["참고" + "용", "정확하지 않을" + " 수"];
    const all = JSON.stringify([JEONSE_TENANT, JEONSE_LANDLORD]);
    for (const w of banned) expect(all).not.toContain(w);
  });
});
