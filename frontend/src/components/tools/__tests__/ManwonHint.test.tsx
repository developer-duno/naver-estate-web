/**
 * 만원 풀이 줄 시험(세션 530 · B40 PR 3a 지시서 A1-4 표 그대로)
 * - 빈 칸·0·음수·1만원 미만은 안 그린다 · 소수 만원은 원 단위까지 푼다(반올림하지 않음)
 * - 쉼표는 브라우저 언어와 무관하게 한국식
 * 실행: npx vitest run src/components/tools/__tests__/ManwonHint.test.tsx
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ManwonHint, { manwonToKorean } from "../ManwonHint";

describe("manwonToKorean", () => {
  it.each([
    [5, "5만원"],
    [50000, "5억원"],
    [150000, "15억원"],
    [12345, "1억 2,345만원"],
    [1.5, "1만 5,000원"],
    ["50000", "5억원"],
    ["12345", "1억 2,345만원"],
  ])("%s → %s", (input, expected) => {
    expect(manwonToKorean(input)).toBe(expected);
  });

  it.each([[""], [0], ["0"], [-5], ["-50000"], [0.5], [null], [undefined], ["abc"]])("%s → 안 그림(null)", (input) => {
    expect(manwonToKorean(input as string | number | null | undefined)).toBeNull();
  });

  describe("브라우저 기본 언어가 독일어여도", () => {
    const orig = Number.prototype.toLocaleString;
    afterEach(() => {
      Number.prototype.toLocaleString = orig;
    });
    it("쉼표는 한국식으로 찍는다", () => {
      // 언어를 안 준 호출만 독일어로 바꾼다 — ko-KR 을 직접 주는 코드만 통과한다
      vi.spyOn(Number.prototype, "toLocaleString").mockImplementation(function (this: number, locales?: unknown, opts?: unknown) {
        return orig.call(this, (locales as string | undefined) ?? "de-DE", opts as Intl.NumberFormatOptions);
      });
      expect(manwonToKorean(12345)).toBe("1억 2,345만원");
      vi.restoreAllMocks();
    });
  });
});

describe("ManwonHint", () => {
  it("값이 있으면 「= …」 한 줄을 그린다", () => {
    render(<ManwonHint value="150000" />);
    expect(screen.getByText("= 15억원")).toBeInTheDocument();
  });

  it("빈 칸이면 아무것도 안 그린다", () => {
    const { container } = render(<ManwonHint value="" />);
    expect(container).toBeEmptyDOMElement();
  });
});
