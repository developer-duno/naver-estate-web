/** 규제지역 코드 판정(세션 482 PR 1b, 설계 L2) — 이름에 구가 없는 2u 단지를 코드 5자리로 가른다. */
import { describe, expect, it } from "vitest";
import { GYEONGGI_REGULATED_CODES, metroSidoOf, zoneOfCortar } from "../regulation-codes";

describe("zoneOfCortar", () => {
  it.each([
    ["1168010300", "overheated"], // 서울 강남구
    ["4113510900", "overheated"], // 성남 분당구
    ["4113110100", "overheated"], // 성남 수정구
    ["4159710100", "overheated"], // 화성 동탄구
    ["4146310100", "overheated"], // 용인 기흥구
    ["4111310100", "normal"],     // 수원 권선구 — 목록 밖
    ["4159110100", "normal"],     // 화성 만세구
    ["3020012300", "normal"],     // 대전 유성구
    ["2611010100", "normal"],     // 부산
  ])("%s → %s", (cortar, want) => {
    expect(zoneOfCortar(cortar)).toBe(want);
  });

  it.each([[null], [undefined], [""], ["302001230"], ["30200123000"], ["30200abcde"]])("%s → null(판정 못 함)", (cortar) => {
    expect(zoneOfCortar(cortar)).toBeNull();
  });

  it("경기 지정 = 15곳(미분양 목록 서울 1 + 경기 15 = 16항목)", () => {
    expect(GYEONGGI_REGULATED_CODES.size).toBe(15);
  });
});

describe("metroSidoOf — 표기 흔들림", () => {
  it.each([
    ["서울", "서울"], ["서울시", "서울"], ["서울특별시", "서울"], ["경기도", "경기"], ["인천광역시", "인천"],
    ["대전", "대전"], [" 부산광역시 ", "부산광역시"],
  ])("%s → %s", (sido, want) => {
    expect(metroSidoOf(sido)).toBe(want);
  });
  it("빈 값 → null", () => {
    expect(metroSidoOf(null)).toBeNull();
    expect(metroSidoOf("")).toBeNull();
  });
});
