/**
 * 홈 「지역 시세 흐름」 세로축 짧은 단위(세션 508 보완 — 「21억3,000만」이 축 칸에서 왼쪽이 잘렸다)
 * 실행: npx vitest run src/components/home/__tests__/HomeTrendChart.test.ts
 */
import { describe, it, expect } from "vitest";
import { axisEok } from "../HomeTrendChart";

describe("axisEok", () => {
  it("1억 이상은 소수 한 자리 억, .0 은 뗀다", () => {
    expect(axisEok(213_000)).toBe("21.3억");
    expect(axisEok(225_000)).toBe("22.5억");
    expect(axisEok(200_000)).toBe("20억");
    expect(axisEok(10_000)).toBe("1억");
  });
  it("소수 둘째 자리 반올림 경계 — 21.25억은 21.3억, 21.24억은 21.2억, 9.95억은 10억(.0 뗌)", () => {
    expect(axisEok(212_500)).toBe("21.3억");
    expect(axisEok(212_400)).toBe("21.2억");
    expect(axisEok(99_500)).toBe("10억");
  });
  it("1억 미만은 만 단위", () => {
    expect(axisEok(8_500)).toBe("8,500만");
  });
  it("숫자가 아니면 빈 글자", () => {
    expect(axisEok(Number.NaN)).toBe("");
  });
});
