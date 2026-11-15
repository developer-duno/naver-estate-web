/**
 * 앱 색 (세션 509 · B36 ① — 사장님 결정 A「남색」)
 * - manifest theme_color = #0b1f3a (background_color 는 흰색 그대로)
 * - 탭 아이콘 그림(icon.tsx · favicon.ico)은 사장님이 새 모양을 따로 정하기로 해 이 변경에서 뺐다
 * 실행: npx vitest run src/app/__tests__/app-icon-colors.test.tsx
 */
import { describe, it, expect } from "vitest";
import manifest from "../manifest";

describe("앱 색", () => {
  it("manifest theme_color = #0b1f3a · background_color 는 흰색 그대로", () => {
    const m = manifest();
    expect(m.theme_color).toBe("#0b1f3a");
    expect(m.background_color).toBe("#ffffff");
  });
});
