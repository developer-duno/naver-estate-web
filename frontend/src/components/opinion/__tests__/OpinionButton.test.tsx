/**
 * "의견 보내기" 고정 버튼 시험 (세션 433 의견함)
 * - 관리자 화면(/admin…)에서는 그리지 않는다 · 그 밖 화면에서는 보인다
 * 실행: npx vitest run src/components/opinion/__tests__/OpinionButton.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn() }),
}));

import OpinionButton from "../OpinionButton";

beforeEach(() => {
  nav.pathname = "/";
});

describe("OpinionButton", () => {
  it.each(["/admin", "/admin/opinions"])("%s 에서는 그리지 않는다", (path) => {
    nav.pathname = path;
    const { container } = render(<OpinionButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each(["/", "/search", "/mibunyang", "/complex/12345", "/administration-guide"])(
    "%s 에서는 보인다",
    (path) => {
      nav.pathname = path;
      render(<OpinionButton />);
      const btn = screen.getByTestId("opinion-button");
      expect(btn).toHaveAccessibleName("의견 보내기");
      // 인쇄 숨김 · 비교 막대가 있으면 위로 비키는 규칙
      expect(btn).toHaveClass("no-print", "z-40", "[body:has([data-floating-bar])_&]:bottom-16");
    },
  );
});
