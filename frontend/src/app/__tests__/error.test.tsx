/**
 * 500 에러 페이지 테스트 — Next 16 unstable_retry 시그너처 검증
 * 실행: npx vitest run src/app/__tests__/error.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GlobalError from "../error";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

describe("GlobalError 500 페이지", () => {
  it("'500' 헤더와 안내 메시지가 렌더된다", () => {
    const err = Object.assign(new Error("boom"), { digest: "abc123" });
    render(<GlobalError error={err} unstable_retry={vi.fn()} />);
    expect(screen.getByText("500")).toBeInTheDocument();
    expect(screen.getByText(/문제가 발생했습니다/)).toBeInTheDocument();
  });

  it("'다시 시도' 버튼 클릭 시 unstable_retry 콜백이 호출된다", () => {
    const retryFn = vi.fn();
    const err = new Error("fail");
    render(<GlobalError error={err} unstable_retry={retryFn} />);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(retryFn).toHaveBeenCalledTimes(1);
  });

  it("unstable_retry 가 없을 때 reset fallback 으로 동작한다 (Next 15 호환)", () => {
    const resetFn = vi.fn();
    const err = new Error("legacy");
    render(<GlobalError error={err} reset={resetFn} />);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(resetFn).toHaveBeenCalledTimes(1);
  });
});
