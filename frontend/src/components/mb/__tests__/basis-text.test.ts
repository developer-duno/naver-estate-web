/**
 * basis-text 순수 함수 시험 — 미분양 상세의 「값 + 공인 기준·출처 한 줄」 경계 (세션 472 PR 2)
 * 실행: npx vitest run src/components/mb/__tests__/basis-text.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  maxFloorBasis,
  unitsBasis,
  roadDistanceText,
  pm25Basis,
  pm25StandardShort,
  positiveOrNull,
  finiteOrNull,
  jeonseRateBasis,
  BASIS,
  PIR_REFERENCE,
} from "../basis-text";

describe("maxFloorBasis — 건축법 고층(30층)·초고층(50층) 경계", () => {
  it("29층 = 고층 기준 미만", () => {
    expect(maxFloorBasis(29)).toBe("건축법 고층건축물 기준(30층 이상) 미만");
  });
  it("30층 = 고층건축물", () => {
    expect(maxFloorBasis(30)).toBe("고층건축물(30층 이상 또는 120m 이상, 건축법 §2)");
  });
  it("49층 = 고층건축물", () => {
    expect(maxFloorBasis(49)).toBe("고층건축물(30층 이상 또는 120m 이상, 건축법 §2)");
  });
  it("50층 = 초고층건축물", () => {
    expect(maxFloorBasis(50)).toBe("초고층건축물(50층 이상 또는 200m 이상, 건축법 시행령 §2)");
  });
});

describe("unitsBasis — 의무관리대상(300)·주민공동시설 확대(500) 경계", () => {
  it("299세대 = 의무관리대상 미만", () => {
    expect(unitsBasis(299)).toBe("의무관리대상(300세대 이상) 미만 · 공동주택관리법 §2");
  });
  it("300세대 = 의무관리대상", () => {
    expect(unitsBasis(300)).toBe("의무관리대상 공동주택(300세대 이상, 공동주택관리법 §2)");
  });
  it("499세대 = 의무관리대상", () => {
    expect(unitsBasis(499)).toBe("의무관리대상 공동주택(300세대 이상, 공동주택관리법 §2)");
  });
  it("500세대 = 주민공동시설 확대 대상까지", () => {
    expect(unitsBasis(500)).toBe(
      "의무관리대상(300세대 이상) · 주민공동시설 확대 대상(500세대 이상, 주택건설기준 등에 관한 규정 §55의2)",
    );
  });
});

describe("roadDistanceText — 추정 dB → 큰 도로 거리 구간", () => {
  it.each([
    [70, "50m 이내"],
    [60, "50~100m"],
    [50, "100~200m"],
    [40, "200m 넘음"],
  ])("%s → %s", (db, text) => {
    expect(roadDistanceText(db)).toBe(text);
  });
  it("구간에 없는 값·빈 값은 null", () => {
    expect(roadDistanceText(55)).toBeNull();
    expect(roadDistanceText(null)).toBeNull();
    expect(roadDistanceText(undefined)).toBeNull();
  });
});

describe("pm25Basis — 국가 대기환경기준 연평균 15㎍/㎥ 이하/초과 (글자로만)", () => {
  it("15.0 = 이하", () => {
    expect(pm25Basis(15)).toBe(
      "이 값은 국가 대기환경기준(연평균 15㎍/㎥) 이하 · 환경정책기본법 시행령 별표1 · 에어코리아 측정소 3년 평균(미분양 계산)",
    );
  });
  it("15.1 = 초과", () => {
    expect(pm25Basis(15.1)).toContain("이 값은 국가 대기환경기준(연평균 15㎍/㎥) 초과 · ");
  });
  it("화면 값과 같은 반올림으로 비교: 15.04 → 15.0 이하 · 15.05 → 15.1 초과", () => {
    expect(pm25StandardShort(15.04)).toBe("이 값은 국가 대기환경기준(연평균 15㎍/㎥) 이하");
    expect(pm25StandardShort(15.05)).toBe("이 값은 국가 대기환경기준(연평균 15㎍/㎥) 초과");
  });
  it("짧은 꼴(지도 오버레이): 15 = 이하 · 15.1 = 초과", () => {
    expect(pm25StandardShort(15)).toBe("이 값은 국가 대기환경기준(연평균 15㎍/㎥) 이하");
    expect(pm25StandardShort(15.1)).toBe("이 값은 국가 대기환경기준(연평균 15㎍/㎥) 초과");
  });
});

describe("숫자 거르개·고정 문구", () => {
  it("positiveOrNull 은 0 이하·NaN 을 버린다 (옛 막대의 nonZero 규칙)", () => {
    expect(positiveOrNull(0)).toBeNull();
    expect(positiveOrNull(-3)).toBeNull();
    expect(positiveOrNull(Number.NaN)).toBeNull();
    expect(positiveOrNull(12.4)).toBe(12.4);
  });
  it("finiteOrNull 은 0 을 살린다", () => {
    expect(finiteOrNull(0)).toBe(0);
    expect(finiteOrNull(Number.POSITIVE_INFINITY)).toBeNull();
  });
  it("전세율 기준 줄에 표본 건수가 들어간다 (없으면 0건)", () => {
    expect(jeonseRateBasis(170, 23)).toBe(
      "같은 단지 대표 평수에서 전용면적이 같은 거래끼리 전세 중앙값 ÷ 매매 중앙값 · 표본 전세 170건·매매 23건 · 국토교통부 실거래가 기반(미분양 계산)",
    );
    expect(jeonseRateBasis(undefined, null)).toContain("표본 전세 0건·매매 0건");
  });
  it("PIR 기준 줄은 주거실태조사 연도·값 상수에서 만든다", () => {
    expect(BASIS.pir).toBe(
      `참고: 국토교통부 주거실태조사 ${PIR_REFERENCE.year} 자가가구 PIR 전국 6.3배 · 수도권 8.7배(중위수)`,
    );
    expect(PIR_REFERENCE.year).toBe(2024);
  });
});
