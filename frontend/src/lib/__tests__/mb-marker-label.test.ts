import { describe, it, expect } from "vitest";
import { markerLabel } from "@/lib/mb-marker-label";
import type { MbApartment } from "@/types";

/** markerLabel — 탭(kind)별 마커 표시값 + 폴백 체인 검증 (세션 318 호갱노노 마커) */
function apt(over: Partial<MbApartment> = {}): MbApartment {
  return { id: "a", name: "래미안테스트", region: "서울", ...over };
}

describe("markerLabel — presale (민간/공공 분양)", () => {
  it("분양가(presale_min_price, 만원)가 있으면 억 축약형으로", () => {
    // 46000만 = 4억6,000만 (formatChartPrice: 만 단위 toLocaleString 콤마)
    expect(markerLabel(apt({ presale_min_price: 46000 }), "presale")).toBe("4억6,000만");
  });
  it("정확히 N억이면 만 단위 생략", () => {
    expect(markerLabel(apt({ presale_min_price: 50000 }), "presale")).toBe("5억");
  });
  it("분양가 없고 평당가만 있으면 평당N만", () => {
    expect(markerLabel(apt({ presale_pp: 1506 }), "presale")).toBe("평당1,506만");
  });
  it("평당가 0(미공개 sentinel)은 폴백 — 단지명", () => {
    expect(markerLabel(apt({ presale_pp: 0 }), "presale")).toBe("래미안테스트");
  });
  it("가격 정보 전무하면 단지명 (빈 말풍선 금지)", () => {
    expect(markerLabel(apt(), "presale")).toBe("래미안테스트");
  });
  it("분양가가 평당가보다 우선", () => {
    expect(markerLabel(apt({ presale_min_price: 46000, presale_pp: 1506 }), "presale")).toBe("4억6,000만");
  });
});

describe("markerLabel — competition (분양결과)", () => {
  it("경쟁률이 있으면 N:1", () => {
    expect(markerLabel(apt({ competition_rate: 12.5 }), "competition")).toBe("12.5:1");
  });
  it("경쟁률 없으면 단지명", () => {
    expect(markerLabel(apt(), "competition")).toBe("래미안테스트");
  });
  it("경쟁률 0은 폴백", () => {
    expect(markerLabel(apt({ competition_rate: 0 }), "competition")).toBe("래미안테스트");
  });
});

describe("markerLabel — unsold (미분양)", () => {
  it("미분양 호수가 있으면 미분양N", () => {
    expect(markerLabel(apt({ unsold: 120 }), "unsold")).toBe("미분양120");
  });
  it("미분양 0(완판)은 폴백 — 단지명", () => {
    expect(markerLabel(apt({ unsold: 0 }), "unsold")).toBe("래미안테스트");
  });
  it("미분양 정보 없으면 단지명", () => {
    expect(markerLabel(apt(), "unsold")).toBe("래미안테스트");
  });
});
