/**
 * HUG 전세보증 한도 계산(세션 520 · B37 PR 5) — 지시서 H2~H7·H11 예시값 전부 + 빈 입력·잘못된 입력
 * 실행: npx vitest run src/lib/broker/__tests__/hug-guarantee.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  HUG_CONVERSION_RATE_PERMILLE,
  HUG_DEPOSIT_CAP_WON,
  HUG_JEONSE_RATIO_PCT,
  HUG_NOT_COVERED,
  HUG_OFFICIAL_PRICE_PCT,
  HUG_SENIOR_CAP_PCT,
  HUG_SOURCES,
  calcHugLimit,
  formatHugWon,
  hasHugItem,
  hugBasisLine,
  type HugInput,
} from "../hug-guarantee";

/** 입력 팩토리 — 기본 = 수도권 · 금액 직접 · 주택가격 1억 · 선순위 0 · 보증금 9,000만 · 월세 0 */
function input(over: Partial<HugInput> = {}): HugInput {
  return {
    region: "capital",
    priceMode: "direct",
    priceWon: 100_000_000,
    seniorWon: 0,
    depositWon: 90_000_000,
    monthlyRentWon: 0,
    ...over,
  };
}

/** status ok 인 결과만 꺼낸다 */
function ok(over: Partial<HugInput> = {}) {
  const r = calcHugLimit(input(over));
  if (r.status !== "ok") throw new Error(`계산 안 됨: ${r.status}`);
  return r;
}

describe("상수 — HUG 원문 값(2026-11-17 확인)", () => {
  it("전세가율 90 · 선순위 60 · 공시 140 · 전환율 6.5% · 상한 수도권 7억 / 그 외 5억 · 출처 2개(https)", () => {
    expect(HUG_JEONSE_RATIO_PCT).toBe(90);
    expect(HUG_SENIOR_CAP_PCT).toBe(60);
    expect(HUG_OFFICIAL_PRICE_PCT).toBe(140);
    expect(HUG_CONVERSION_RATE_PERMILLE).toBe(65);
    expect(HUG_DEPOSIT_CAP_WON).toEqual({ capital: 700_000_000, other: 500_000_000 });
    expect(HUG_SOURCES).toHaveLength(2);
    expect(HUG_SOURCES[1].url).toContain("articleId=37801");
    for (const s of HUG_SOURCES) expect(s.url.startsWith("https://")).toBe(true);
  });
});

describe("H2 주택가격", () => {
  it("금액 직접 = 넣은 금액 그대로", () => {
    expect(ok({ priceWon: 280_000_000 }).housePriceWon).toBe(280_000_000);
  });
  it("공시가격 모드 = 공시가격 × 140% (원 미만 버림)", () => {
    expect(ok({ priceMode: "official", priceWon: 200_000_000 }).housePriceWon).toBe(280_000_000);
    expect(ok({ priceMode: "official", priceWon: 123_456_789 }).housePriceWon).toBe(172_839_504);
  });
});

describe("H3 보증한도 = 주택가격 × 90% − 선순위채권 등", () => {
  it("2억 8,000만 · 선순위 6,000만 → 1억 9,200만", () => {
    expect(ok({ priceWon: 280_000_000, seniorWon: 60_000_000 }).limitWon).toBe(192_000_000);
  });
  it("1억 · 선순위 9,500만 → 0 아래(−500만) — 화면은 0원 + 문장(부품 시험)", () => {
    const r = ok({ priceWon: 100_000_000, seniorWon: 95_000_000, depositWon: 10_000_000 });
    expect(r.limitWon).toBe(-5_000_000);
    expect(r.depositFits).toBe(false);
  });
});

describe("H4 조건 ① 보증금 + 선순위 ≤ 주택가격 × 90%(실제 보증금)", () => {
  it("주택가격 1억 · 보증금 9,500만 → 넘음(한도 9,000만)", () => {
    const r = ok({ depositWon: 95_000_000 });
    expect(r.limitWon).toBe(90_000_000);
    expect(r.depositFits).toBe(false);
  });
  it("주택가격 1억 · 보증금 9,000만 → 한도와 같음 = 들어감(경계)", () => {
    const r = ok({ depositWon: 90_000_000 });
    expect(r.depositFits).toBe(true);
    expect(r.limitWon - r.depositWon).toBe(0);
  });
  it("주택가격 1억 · 보증금 4,000만 · 선순위 5,500만 → 한도 3,500만 · 넘음(500만) · 60% 조건은 들어감", () => {
    const r = ok({ depositWon: 40_000_000, seniorWon: 55_000_000 });
    expect(r.limitWon).toBe(35_000_000);
    expect(r.depositFits).toBe(false);
    expect(r.depositWon - r.limitWon).toBe(5_000_000);
    expect(r.seniorFits).toBe(true);
  });
  it("그림 예시(공시 2억 · 선순위 6,000만 · 보증금 1억 8,000만) → 1,200만 남음 / 보증금 2억 1,000만 → 1,800만 많음", () => {
    const fit = ok({ priceMode: "official", priceWon: 200_000_000, seniorWon: 60_000_000, depositWon: 180_000_000 });
    expect(fit.depositFits).toBe(true);
    expect(fit.limitWon - fit.depositWon).toBe(12_000_000);
    const over = ok({ priceMode: "official", priceWon: 200_000_000, seniorWon: 60_000_000, depositWon: 210_000_000 });
    expect(over.depositFits).toBe(false);
    expect(over.depositWon - over.limitWon).toBe(18_000_000);
  });
  it("월세가 있어도 조건 ① 은 실제 보증금으로 본다(환산 보증금 1억 7,230만 원대여도 8,000만 으로 판정)", () => {
    const r = ok({ depositWon: 80_000_000, monthlyRentWon: 500_000 });
    expect(r.convertedDepositWon).toBe(172_307_692);
    expect(r.depositFits).toBe(true);
  });
});

describe("H5 조건 ② 선순위 ≤ 주택가격 × 60% · 비율 0.1 단위 올림", () => {
  const cases: Array<[number, number, string, boolean]> = [
    [280_000_000, 60_000_000, "21.5", true],
    [100_000_000, 55_000_000, "55", true],
    [100_000_000, 60_000_000, "60", true],
    [100_000_000, 60_000_001, "60.1", false],
    [100_000_000, 0, "0", true],
  ];
  it.each(cases)("주택가격 %d · 선순위 %d → %s%% · 들어감=%s", (price, senior, text, fits) => {
    const r = ok({ priceWon: price, seniorWon: senior, depositWon: 1_000_000 });
    expect(r.seniorRatioText).toBe(text);
    expect(r.seniorFits).toBe(fits);
  });
});

describe("H6 조건 ③ 보증금 상한(월세는 전월세전환율 6.5% 로 환산)", () => {
  it("그 외 지역 · 보증금 4억 · 월세 60만 → 환산 510,769,231(넘음이라 올림) / 같은 값 수도권 → 510,769,230 이하", () => {
    const other = ok({ region: "other", priceWon: 1_000_000_000, depositWon: 400_000_000, monthlyRentWon: 600_000 });
    expect(other.convertedDepositWon).toBe(510_769_231);
    expect(other.depositCapWon).toBe(500_000_000);
    expect(other.capFits).toBe(false);
    const capital = ok({ region: "capital", priceWon: 1_000_000_000, depositWon: 400_000_000, monthlyRentWon: 600_000 });
    expect(capital.depositCapWon).toBe(700_000_000);
    expect(capital.capFits).toBe(true);
    expect(capital.convertedDepositWon).toBe(510_769_230);
  });
  it("수도권 보증금 정확히 7억 → 이하 · 700,000,001 → 넘음 · 월세 0 이면 환산값 없음", () => {
    const eq = ok({ priceWon: 2_000_000_000, depositWon: 700_000_000 });
    expect(eq.capFits).toBe(true);
    expect(eq.convertedDepositWon).toBeNull();
    expect(ok({ priceWon: 2_000_000_000, depositWon: 700_000_001 }).capFits).toBe(false);
  });
  it("상한을 아주 조금 넘으면 환산 보증금은 올림 — 그 외 지역 · 보증금 499,999,816 · 월세 1원 → 500,000,001(넘음)", () => {
    // 환산 = 499,999,816 + 12 ÷ 0.065 = 500,000,000.61… → 내림이면 「5억 원」인데 넘음으로 보인다(세션 521 검사관 재현)
    const r = ok({ region: "other", priceWon: 2_000_000_000, depositWon: 499_999_816, monthlyRentWon: 1 });
    expect(r.capFits).toBe(false);
    expect(r.convertedDepositWon).toBe(500_000_001);
    expect(r.convertedDepositWon!).toBeGreaterThan(r.depositCapWon);
  });
  it("상한 안이면 환산 보증금은 내림 그대로 — 그 외 지역 · 보증금 499,999,815 · 월세 1원 → 499,999,999", () => {
    // 499,999,815 + 184.61… = 499,999,999.61… → 이하이므로 버림
    const r = ok({ region: "other", priceWon: 2_000_000_000, depositWon: 499_999_815, monthlyRentWon: 1 });
    expect(r.capFits).toBe(true);
    expect(r.convertedDepositWon).toBe(499_999_999);
  });
  it("그 외 지역 보증금 5억 → 이하 · 5억 1원 → 넘음", () => {
    expect(ok({ region: "other", priceWon: 2_000_000_000, depositWon: 500_000_000 }).capFits).toBe(true);
    expect(ok({ region: "other", priceWon: 2_000_000_000, depositWon: 500_000_001 }).capFits).toBe(false);
  });
});

describe("H7 금액 글자", () => {
  it.each([
    [192_000_000, "1억 9,200만 원"],
    [12_000_000, "1,200만 원"],
    [510_769_230, "5억 1,076만 9,230원"],
    [280_000_000, "2억 8,000만 원"],
    [700_000_000, "7억 원"],
    [5_000, "5,000원"],
    [0, "0원"],
  ])("%d → %s", (won, text) => {
    expect(formatHugWon(won)).toBe(text);
  });
  it("식 줄용(원 없이) — 2억 8,000만 · 6,000만 · 1억 9,200만 · 0 · 음수는 −", () => {
    expect(formatHugWon(280_000_000, false)).toBe("2억 8,000만");
    expect(formatHugWon(60_000_000, false)).toBe("6,000만");
    expect(formatHugWon(192_000_000, false)).toBe("1억 9,200만");
    expect(formatHugWon(0, false)).toBe("0");
    expect(formatHugWon(-5_000_000, false)).toBe("−500만");
  });
});

describe("H9 빈 입력 · 잘못된 입력", () => {
  it("주택가격·전세보증금이 비거나 0 이면 empty — 선순위·월세는 비면 0", () => {
    expect(calcHugLimit(input({ priceWon: null })).status).toBe("empty");
    expect(calcHugLimit(input({ depositWon: null })).status).toBe("empty");
    expect(calcHugLimit(input({ priceWon: 0 })).status).toBe("empty");
    const r = ok({ seniorWon: null, monthlyRentWon: null });
    expect(r.seniorWon).toBe(0);
    expect(r.monthlyRentWon).toBe(0);
    expect(r.convertedDepositWon).toBeNull();
  });
  it("음수·NaN·소수·무한대 → invalid(계산하지 않음)", () => {
    expect(calcHugLimit(input({ priceWon: -1 })).status).toBe("invalid");
    expect(calcHugLimit(input({ seniorWon: Number.NaN })).status).toBe("invalid");
    expect(calcHugLimit(input({ depositWon: 1.5 })).status).toBe("invalid");
    expect(calcHugLimit(input({ monthlyRentWon: Number.POSITIVE_INFINITY })).status).toBe("invalid");
  });
});

describe("H11 적용 기준 줄 · H12 넣지 않은 조건 · H14 링크 판정", () => {
  it("적용 기준 줄 = 상수에서 만든 글자", () => {
    expect(hugBasisLine()).toBe(
      "적용 기준: 전세가율 90% · 선순위채권 60% · 보증금 상한 수도권 7억·그 외 5억 · 공시가격 140% · " +
        "전월세전환율 6.5%(2026. 7. 1. 신청분부터) · HUG 원문 확인 2026. 11. 17.",
    );
    expect(hugBasisLine()).toContain(`전세가율 ${HUG_JEONSE_RATIO_PCT}%`);
  });
  it("넣지 않은 조건 14줄 — 맨 앞 HUG 상품 기준 · 보증료·감정평가서 줄 · 원문에서 더한 6줄(세션 521)", () => {
    expect(HUG_NOT_COVERED).toHaveLength(14);
    expect(HUG_NOT_COVERED[0]).toBe("HUG 상품 기준입니다 — HF(주택금융공사)·SGI서울보증 전세보증은 조건이 다릅니다");
    expect(HUG_NOT_COVERED[6]).toBe("보증료(원문의 보증료율 표를 보세요)");
    expect(HUG_NOT_COVERED[7]).toBe("감정평가서가 있으면 HUG는 그 값을 먼저 씁니다(6개월 이내)");
    expect(HUG_NOT_COVERED.slice(8)).toEqual([
      "갱신 계약에서 보증금이 늘지 않으면 HUG는 주택가격을 다시 보지 않고, 전월세전환율도 예전 보증 때 것을 씁니다",
      "질권 설정·채권양도 통지가 된 전세대출이 있으면 가입할 수 없습니다(HUG와 협약한 SGI서울보증 보증부 전세대출·신용대출은 예외)",
      "임대인이 HUG 보증금지 대상이거나 전세보증금 미반환 임대인으로 등록된 경우 · 임대인이 미성년자면 법정대리인 연대보증",
      "오피스텔은 전세계약서나 중개대상물 확인·설명서에 「주거용」 표기가 있어야 합니다",
      "전세권이 설정돼 있으면 말소하거나 보증 이행 때 HUG로 이전해야 합니다",
      "이사 전 사전한도심사(계약일부터 계약 시작 14일 전까지 안심전세 앱에서 신청)",
    ]);
  });
  it("「HUG」 글자가 든 항목이 있을 때만 참", () => {
    expect(hasHugItem(["전세보증(HUG 등) 가입 요건", "개별 특약 문구"])).toBe(true);
    expect(hasHugItem(["개별 특약 문구"])).toBe(false);
    expect(hasHugItem([])).toBe(false);
  });
});
