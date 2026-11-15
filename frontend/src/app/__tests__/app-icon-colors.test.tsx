/**
 * 탭 아이콘·앱 색 (세션 509 · B36 ① — 사장님 결정 A「남색 바탕」)
 * - /icon: 남색 #0b1f3a 바탕에 주황 #ff9a4d 「2u」
 * - manifest theme_color = #0b1f3a (background_color 는 흰색 그대로)
 * 실행: npx vitest run src/app/__tests__/app-icon-colors.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";

// ImageResponse 는 그림을 실제로 굽지 않고 받은 요소만 들고 있게 가짜로 바꾼다
vi.mock("next/og", () => ({
  ImageResponse: class {
    element: ReactElement;
    constructor(element: ReactElement) {
      this.element = element;
    }
  },
}));

import Icon from "../icon";
import manifest from "../manifest";

describe("탭 아이콘·앱 색", () => {
  it("/icon 은 남색 바탕 · 주황 2u", () => {
    const res = Icon() as unknown as { element: ReactElement<{ style: Record<string, unknown>; children: unknown }> };
    expect(res.element.props.style.background).toBe("#0b1f3a");
    expect(res.element.props.style.color).toBe("#ff9a4d");
    expect(res.element.props.children).toBe("2u");
  });

  it("manifest theme_color = #0b1f3a · background_color 는 흰색 그대로", () => {
    const m = manifest();
    expect(m.theme_color).toBe("#0b1f3a");
    expect(m.background_color).toBe("#ffffff");
  });
});
