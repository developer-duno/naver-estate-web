/**
 * 매매 체크 목록 세 장 자료(lib/broker/sale-checklists.ts) — 항목 수·id 꼴·audience·손님 목록 짝·대출 가드(세션 516)
 * 조문 글자↔주소 짝 시험은 checklists.test.ts 에서 여섯 목록 전부를 돈다.
 * 실행: npx vitest run src/lib/broker/__tests__/sale-checklists.test.ts
 */
import { describe, it, expect } from "vitest";
import { CHECKLISTS, getChecklist } from "../checklists";
import { SALE, SALE_BUYER, SALE_SELLER } from "../sale-checklists";

const itemsOf = (l: typeof SALE) => l.stages.flatMap((s) => s.items);

describe("매매 체크 목록 자료 — 중개사·매수인·매도인", () => {
  it("레지스트리에 같은 객체로 들어 있고 audience 는 broker·party·party", () => {
    expect(CHECKLISTS.sale).toBe(SALE);
    expect(CHECKLISTS["sale-buyer"]).toBe(SALE_BUYER);
    expect(CHECKLISTS["sale-seller"]).toBe(SALE_SELLER);
    expect([SALE.audience, SALE_BUYER.audience, SALE_SELLER.audience]).toEqual(["broker", "party", "party"]);
  });

  it("audience 가 다르면 undefined — /broker/sale-buyer · /checklist/sale 은 열리지 않는다", () => {
    expect(getChecklist("sale", "broker")).toBe(SALE);
    expect(getChecklist("sale-buyer", "party")).toBe(SALE_BUYER);
    expect(getChecklist("sale-seller", "party")).toBe(SALE_SELLER);
    expect(getChecklist("sale-buyer", "broker")).toBeUndefined();
    expect(getChecklist("sale-seller", "broker")).toBeUndefined();
    expect(getChecklist("sale", "party")).toBeUndefined();
  });

  it("중개사 매매의 손님 목록 짝 = 매수인용·매도인용", () => {
    expect(SALE.partyTypes).toEqual(["sale-buyer", "sale-seller"]);
    for (const t of SALE.partyTypes ?? []) expect(getChecklist(t, "party")).toBeDefined();
  });

  it("항목 수 = 중개사 15 · 매수인 13 · 매도인 9 (단계 4·3·2)", () => {
    expect(itemsOf(SALE)).toHaveLength(15);
    expect(itemsOf(SALE_BUYER)).toHaveLength(13);
    expect(itemsOf(SALE_SELLER)).toHaveLength(9);
    expect(SALE.stages.map((s) => s.title)).toEqual(["계약 전 — 물건 확인", "계약 전 — 금액과 세금", "계약", "계약 뒤"]);
    expect(SALE_BUYER.stages.map((s) => s.title)).toEqual(["계약 전 — 집과 자금", "계약", "계약 뒤 — 잔금과 이사"]);
    expect(SALE_SELLER.stages.map((s) => s.title)).toEqual(["계약 전·계약", "계약 뒤"]);
  });

  it("항목 id 는 여섯 목록을 합쳐 서로 다르고, 유형 접두어 + 소문자/하이픈 꼴(체크 저장 키)", () => {
    const all = Object.values(CHECKLISTS).flatMap((l) => l.stages.flatMap((s) => s.items.map((i) => i.id)));
    expect(Object.keys(CHECKLISTS)).toHaveLength(6);
    expect(new Set(all).size).toBe(all.length);
    for (const id of itemsOf(SALE).map((i) => i.id)) expect(id).toMatch(/^sale\.[a-z]+(-[a-z]+)*$/);
    for (const id of itemsOf(SALE_BUYER).map((i) => i.id)) expect(id).toMatch(/^sale-buyer\.[a-z]+(-[a-z]+)*$/);
    for (const id of itemsOf(SALE_SELLER).map((i) => i.id)) expect(id).toMatch(/^sale-seller\.[a-z]+(-[a-z]+)*$/);
  });

  it("이름·제목(결정 ⓐ — 중개사 「중개 체크 목록」 · 손님 「체크리스트」)", () => {
    expect(SALE).toMatchObject({ name: "매매", h1: "매매 중개 체크 목록 — 공인중개사용" });
    expect(SALE_BUYER).toMatchObject({ name: "매수인용 (집 살 때)", h1: "집 살 때 체크리스트 — 매수인용" });
    expect(SALE_SELLER).toMatchObject({ name: "매도인용 (집 팔 때)", h1: "집 팔 때 체크리스트 — 매도인용" });
  });

  it("근거 조문 = 법제처 한글 주소 · 대출 계산 항목만 근거 없음 · 바로가기는 사이트 안 계산기·단지 찾기 또는 법제처 서식", () => {
    for (const l of [SALE, SALE_BUYER, SALE_SELLER]) {
      for (const item of itemsOf(l)) {
        if (item.id === "sale-buyer.loan-calc") expect(item.laws).toEqual([]);
        else expect(item.laws.length).toBeGreaterThanOrEqual(1);
        for (const law of item.laws) expect(law.url.startsWith("https://www.law.go.kr/법령/")).toBe(true);
        for (const link of item.links ?? []) {
          expect(
            ["/tools/brokerage-fee", "/tools/acquisition-tax", "/tools/transfer-tax", "/search"].includes(link.href) ||
              link.href.startsWith("https://www.law.go.kr/"),
          ).toBe(true);
        }
      }
    }
    const loan = itemsOf(SALE_BUYER).find((i) => i.id === "sale-buyer.loan-calc")!;
    expect(loan.links).toEqual([{ label: "단지 찾기", href: "/search" }]);
  });

  it("대출 가드 — 매매 세 목록 글자에 비율·상담·금리·제휴·「대출 받」 0 · 대출 항목 제목·설명에 숫자 0(금융위 등록 전)", () => {
    // 금지 낱말은 이어 붙여 만든다 — 이 시험 파일이 광고·대출 문구 grep 에 걸리지 않게
    const banned = ["%", "LT" + "V", "DS" + "R", "금" + "리", "상" + "담", "제" + "휴", "대출 " + "받"];
    for (const l of [SALE, SALE_BUYER, SALE_SELLER]) {
      const texts = [
        ...itemsOf(l).flatMap((i) => [i.title, i.detail ?? "", ...(i.links ?? []).map((x) => x.label)]),
        ...l.notCovered,
        l.description,
      ];
      for (const t of texts) for (const w of banned) expect({ t, w, hit: t.includes(w) }).toEqual({ t, w, hit: false });
    }
    const loan = itemsOf(SALE_BUYER).find((i) => i.id === "sale-buyer.loan-calc")!;
    expect(loan.title).not.toMatch(/\d/);
    expect(loan.detail ?? "").not.toMatch(/\d/);
  });

  it("토지거래허가구역은 구역 이름을 적지 않는다(바뀌는 공고를 손으로 옮기지 않기)", () => {
    const all = JSON.stringify([SALE, SALE_BUYER, SALE_SELLER]);
    for (const w of ["강남", "서초", "송파", "용산"]) expect(all).not.toContain(w);
  });

  it("법령 기준일 2026-11-16 · 넣지 않은 것", () => {
    for (const l of [SALE, SALE_BUYER, SALE_SELLER]) expect(l.checkedAt).toBe("2026-11-16");
    expect(SALE.notCovered).toEqual(["주택 구입 대출 조건", "양도세 비과세 판정", "개별 특약 문구"]);
    expect(SALE_BUYER.notCovered).toEqual(["주택 구입 대출 조건", "개별 특약 문구"]);
    expect(SALE_SELLER.notCovered).toEqual(["양도세 비과세 판정", "개별 특약 문구"]);
  });

  it("신뢰도를 변명하는 문장이 없다(금지 문구 2종 0)", () => {
    const banned = ["참고" + "용", "정확하지 않을" + " 수"];
    const all = JSON.stringify([SALE, SALE_BUYER, SALE_SELLER]);
    for (const w of banned) expect(all).not.toContain(w);
  });
});
