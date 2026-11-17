/**
 * 월세 체크 목록 세 장 자료(lib/broker/wolse-checklists.ts) — 항목 수·id 꼴·audience·손님 목록 짝 ·
 * 전세와 같은 항목의 글자 대조 · 전환 상한 법 글자 · 금리·상담·제휴 낱말 가드 · 세액공제 숫자 0 (세션 517)
 * 조문 글자↔주소 짝 시험은 checklists.test.ts 에서 아홉 목록 전부를 돈다.
 * 실행: npx vitest run src/lib/broker/__tests__/wolse-checklists.test.ts
 */
import { describe, it, expect } from "vitest";
import { CHECKLISTS, getChecklist, type ChecklistItem, type DealChecklist } from "../checklists";
import { JEONSE_LANDLORD, JEONSE_TENANT } from "../party-checklists";
import { WOLSE, WOLSE_LANDLORD, WOLSE_TENANT } from "../wolse-checklists";

const itemsOf = (l: DealChecklist) => l.stages.flatMap((s) => s.items);
const JEONSE = CHECKLISTS.jeonse;
/** id 의 유형 접두어를 뗀 뒷부분(`wolse-tenant.fee` → `fee`) */
const suffix = (id: string) => id.slice(id.indexOf(".") + 1);
/** 같은 항목 대조에 쓰는 칸 — id 는 접두어만 다르다 */
const body = (i: ChecklistItem) => ({ title: i.title, detail: i.detail, laws: i.laws, links: i.links });

/** 법 글자 그대로의 전환 상한(결정 ⓐ) */
const CAP_WORDS = "연 10%와 「한국은행 기준금리 + 연 2%」 중 낮은 비율";

describe("월세 체크 목록 자료 — 중개사·세입자·집주인", () => {
  it("레지스트리에 같은 객체로 들어 있고 audience 는 broker·party·party", () => {
    expect(CHECKLISTS.wolse).toBe(WOLSE);
    expect(CHECKLISTS["wolse-tenant"]).toBe(WOLSE_TENANT);
    expect(CHECKLISTS["wolse-landlord"]).toBe(WOLSE_LANDLORD);
    expect([WOLSE.audience, WOLSE_TENANT.audience, WOLSE_LANDLORD.audience]).toEqual(["broker", "party", "party"]);
  });

  it("audience 가 다르면 undefined — /broker/wolse-tenant · /checklist/wolse 은 열리지 않는다", () => {
    expect(getChecklist("wolse", "broker")).toBe(WOLSE);
    expect(getChecklist("wolse-tenant", "party")).toBe(WOLSE_TENANT);
    expect(getChecklist("wolse-landlord", "party")).toBe(WOLSE_LANDLORD);
    expect(getChecklist("wolse-tenant", "broker")).toBeUndefined();
    expect(getChecklist("wolse-landlord", "broker")).toBeUndefined();
    expect(getChecklist("wolse", "party")).toBeUndefined();
  });

  it("중개사 월세의 손님 목록 짝 = 세입자용·집주인용", () => {
    expect(WOLSE.partyTypes).toEqual(["wolse-tenant", "wolse-landlord"]);
    for (const t of WOLSE.partyTypes ?? []) expect(getChecklist(t, "party")).toBeDefined();
  });

  it("항목 수 = 중개사 20 · 세입자 19 · 집주인 12 · 단계 제목", () => {
    expect(itemsOf(WOLSE)).toHaveLength(20);
    expect(itemsOf(WOLSE_TENANT)).toHaveLength(19);
    expect(itemsOf(WOLSE_LANDLORD)).toHaveLength(12);
    expect(WOLSE.stages.map((s) => s.title)).toEqual(JEONSE.stages.map((s) => s.title));
    expect(WOLSE_TENANT.stages.map((s) => s.title)).toEqual([
      "계약 전 — 집과 집주인 확인",
      "계약",
      "계약 뒤 — 이사 날까지",
      "사는 동안 — 월세",
      "만기 때",
    ]);
    expect(WOLSE_LANDLORD.stages.map((s) => s.title)).toEqual(["계약 전·계약", "계약 뒤", "사는 동안 — 월세", "만기 때"]);
  });

  it("항목 id 는 아홉 목록을 합쳐 서로 다르고, 유형 접두어 + 소문자/하이픈 꼴(체크 저장 키)", () => {
    const all = Object.values(CHECKLISTS).flatMap((l) => l.stages.flatMap((s) => s.items.map((i) => i.id)));
    expect(Object.keys(CHECKLISTS)).toHaveLength(9);
    expect(new Set(all).size).toBe(all.length);
    for (const id of itemsOf(WOLSE).map((i) => i.id)) expect(id).toMatch(/^wolse\.[a-z]+(-[a-z]+)*$/);
    for (const id of itemsOf(WOLSE_TENANT).map((i) => i.id)) expect(id).toMatch(/^wolse-tenant\.[a-z]+(-[a-z]+)*$/);
    for (const id of itemsOf(WOLSE_LANDLORD).map((i) => i.id)) expect(id).toMatch(/^wolse-landlord\.[a-z]+(-[a-z]+)*$/);
  });

  it("이름·제목·설명·법령 기준일·넣지 않은 것", () => {
    expect(WOLSE).toMatchObject({ name: "월세", h1: "월세 중개 체크 목록 — 공인중개사용" });
    expect(WOLSE_TENANT).toMatchObject({ name: "세입자용", h1: "월세 계약 체크리스트 — 세입자용" });
    expect(WOLSE_LANDLORD).toMatchObject({ name: "집주인용", h1: "월세 계약 체크리스트 — 집주인용" });
    expect(WOLSE_TENANT.description).toBe(
      "아파트 월세 계약에서 세입자(임차인)가 계약 전·계약·사는 동안·만기 때 챙길 일을 법 조문과 함께 정리했습니다.",
    );
    for (const l of [WOLSE, WOLSE_TENANT, WOLSE_LANDLORD]) expect(l.checkedAt).toBe("2026-11-16");
    expect(WOLSE.notCovered).toEqual(["보증금 반환보증(HUG 등) 가입 요건", "월세 세액공제 조건", "개별 특약 문구"]);
    expect(WOLSE_TENANT.notCovered).toEqual(["보증금 반환보증(HUG 등) 가입 요건", "개별 특약 문구"]);
    expect(WOLSE_LANDLORD.notCovered).toEqual(["월세 임대소득 세금", "보증금 반환보증(HUG 등) 가입 요건", "개별 특약 문구"]);
  });
});

describe("같은 항목 — 전세 목록의 글자를 그대로 옮겼다(id 접두어만 다름)", () => {
  /** 월세 목록 · 짝 전세 목록 · 짝 전세에서 빼고 옮긴 뒷부분 · 월세에만 있는 새 뒷부분 */
  const PAIRS: [DealChecklist, DealChecklist, string[], string[]][] = [
    [WOLSE, JEONSE, [], ["rent-arrears-notice", "rent-caps-notice"]],
    [
      WOLSE_TENANT,
      JEONSE_TENANT,
      ["increase-cap"],
      ["rent-arrears", "increase-cap", "conversion-cap", "overpaid-refund", "rent-tax-credit"],
    ],
    [WOLSE_LANDLORD, JEONSE_LANDLORD, ["increase-cap"], ["rent-arrears-terminate", "increase-cap", "conversion-cap"]],
  ];

  it("월세 목록 = (전세 항목 − 뺀 것) + 새 항목 — 빠지거나 더 붙은 항목이 없다", () => {
    for (const [wolse, jeonse, dropped, added] of PAIRS) {
      const copied = itemsOf(jeonse)
        .map((i) => suffix(i.id))
        .filter((s) => !dropped.includes(s));
      expect(itemsOf(wolse).map((i) => suffix(i.id)).sort()).toEqual([...copied, ...added].sort());
    }
  });

  it("같은 항목마다 title·detail·laws·links 가 전세 짝과 같다(집주인 renewal-notice 는 제목만)", () => {
    let compared = 0;
    for (const [wolse, jeonse, dropped] of PAIRS) {
      for (const j of itemsOf(jeonse)) {
        const s = suffix(j.id);
        if (dropped.includes(s)) continue;
        const w = itemsOf(wolse).find((i) => i.id === `${wolse.type}.${s}`);
        expect(w, `${wolse.type}.${s}`).toBeDefined();
        compared += 1;
        if (w!.id === "wolse-landlord.renewal-notice") {
          expect(w!.title).toBe(j.title);
          continue;
        }
        expect({ id: w!.id, ...body(w!) }).toEqual({ id: w!.id, ...body(j) });
      }
    }
    // 중개사 18 + 세입자 14 + 집주인 8(+ 제목만 대조한 renewal-notice 1)
    expect(compared).toBe(18 + 14 + 8 + 1);
  });

  it("집주인 renewal-notice — 월세 연체 설명 한 줄 + 전세 근거 뒤에 제6조 제3항", () => {
    const w = itemsOf(WOLSE_LANDLORD).find((i) => i.id === "wolse-landlord.renewal-notice")!;
    const j = itemsOf(JEONSE_LANDLORD).find((i) => i.id === "jeonse-landlord.renewal-notice")!;
    expect(w.detail).toBe("월세를 2기분 밀린 세입자에게는 자동 연장이 적용되지 않습니다.");
    expect(w.laws).toEqual([...j.laws, { label: "주택임대차보호법 제6조 제3항", url: j.laws[0].url }]);
  });
});

describe("월세에만 있는 항목 — 법 글자·낱말 가드", () => {
  const all = [WOLSE, WOLSE_TENANT, WOLSE_LANDLORD].flatMap(itemsOf);
  const byId = (id: string) => all.find((i) => i.id === id)!;

  it("전환 상한 = 법 글자 그대로(연 10% · 「한국은행 기준금리 + 연 2%」 · 낮은 비율 · 연 비율이라 ÷ 12 — 결정 ⓐ)", () => {
    expect(byId("wolse-tenant.conversion-cap").title).toBe(`보증금을 월세로 바꿀 때 월세 상한 = 바꾸는 금액 × (${CAP_WORDS}) ÷ 12`);
    expect(byId("wolse-landlord.conversion-cap").title).toBe(
      `보증금을 월세로 바꿀 때 월세 상한 = 바꾸는 금액 × (${CAP_WORDS}) ÷ 12 — 넘게 받은 돈은 세입자가 돌려 달라고 할 수 있음`,
    );
    expect(byId("wolse.rent-caps-notice").detail).toBe(`보증금을 월세로 바꿀 때 월세 상한 = 바꾸는 금액 × (${CAP_WORDS}) ÷ 12.`);
  });

  it("세 목록 글자(h1·단계 제목·항목·근거 글자·링크·넣지 않은 것·설명)에 상담·제휴·「대출 받」 0 · 「금리」는 전환 상한 법 글자 세 곳에만", () => {
    // 금지 낱말은 이어 붙여 만든다 — 이 시험 파일이 광고·대출 문구 grep 에 걸리지 않게
    const banned = ["상" + "담", "제" + "휴", "대출 " + "받"];
    const RATE = "금" + "리";
    const rateAllowed = [
      "wolse.rent-caps-notice:detail",
      "wolse-tenant.conversion-cap:title",
      "wolse-landlord.conversion-cap:title",
    ];
    const texts: [string, string][] = [];
    for (const l of [WOLSE, WOLSE_TENANT, WOLSE_LANDLORD]) {
      texts.push([`${l.type}:h1`, l.h1]);
      for (const st of l.stages) texts.push([`${l.type}:stage:${st.id}`, st.title]);
      for (const i of itemsOf(l)) {
        texts.push([`${i.id}:title`, i.title], [`${i.id}:detail`, i.detail ?? ""]);
        for (const x of i.links ?? []) texts.push([`${i.id}:link`, x.label]);
        for (const x of i.laws) texts.push([`${i.id}:law`, x.label]);
      }
      for (const n of l.notCovered) texts.push([`${l.type}:notCovered`, n]);
      texts.push([`${l.type}:description`, l.description]);
    }
    for (const [where, t] of texts) for (const w of banned) expect({ where, w, hit: t.includes(w) }).toEqual({ where, w, hit: false });
    expect(texts.filter(([, t]) => t.includes(RATE)).map(([where]) => where)).toEqual(rateAllowed);
  });

  it("월세 세액공제 항목은 제목·설명에 숫자 0(결정 ⓑ — 소득·%·한도 금액 없음) · 근거 조세특례제한법 제95조의2", () => {
    const credit = byId("wolse-tenant.rent-tax-credit");
    expect(credit.title).toBe("집 없는 세대주인 근로자 등이 조건에 맞으면 신청해서 월세 세액공제를 받을 수 있음");
    expect(credit.detail).toBe("소득·집 조건은 조문 원문으로 확인합니다.");
    expect(credit.title).not.toMatch(/\d/);
    expect(credit.detail ?? "").not.toMatch(/\d/);
    expect(credit.laws.map((x) => x.label)).toEqual(["조세특례제한법 제95조의2"]);
  });

  it("밀린 월세 항목은 민법 제640조로 시작한다(중개사·세입자·집주인)", () => {
    for (const id of ["wolse.rent-arrears-notice", "wolse-tenant.rent-arrears", "wolse-landlord.rent-arrears-terminate"]) {
      expect(byId(id).laws[0].label).toBe("민법 제640조");
    }
  });

  // 왜: 법은 제7조 증액청구와 제6조의3 요구갱신만 5% 로 묶는다 — 맨 「갱신 때」 라고만 쓰면 합의 갱신까지 5% 라는 뜻이 된다(세션 518 맹점 🟠2)
  it("인상 상한 네 항목 제목 — 맨 「갱신 때」 없음 · 세입자는 「갱신을 요구해 연장할 때」 · 집주인은 「세입자 요구로 갱신할 때」", () => {
    const titleOf = (l: DealChecklist) => itemsOf(l).find((i) => i.id === `${l.type}.increase-cap`)!.title;
    for (const l of [JEONSE_TENANT, WOLSE_TENANT, JEONSE_LANDLORD, WOLSE_LANDLORD]) {
      expect(titleOf(l), l.type).not.toContain("갱신 때");
    }
    for (const l of [JEONSE_TENANT, WOLSE_TENANT]) expect(titleOf(l), l.type).toContain("갱신을 요구해 연장할 때");
    for (const l of [JEONSE_LANDLORD, WOLSE_LANDLORD]) expect(titleOf(l), l.type).toContain("세입자 요구로 갱신할 때");
  });

  it("신뢰도를 변명하는 문장이 없다(금지 문구 2종 0)", () => {
    const banned = ["참고" + "용", "정확하지 않을" + " 수"];
    const text = JSON.stringify([WOLSE, WOLSE_TENANT, WOLSE_LANDLORD]);
    for (const w of banned) expect(text).not.toContain(w);
  });
});
