/**
 * useSmartBack 훅 테스트 — 같은 origin이면 뒤로가기, 아니면 홈
 * 실행: npx vitest run src/hooks/__tests__/useSmartBack.test.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

/* next/navigation 모킹 */
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe("useSmartBack 훅", () => {
  beforeEach(() => {
    pushMock.mockClear();
    vi.spyOn(window.history, "back").mockImplementation(() => {});
  });

  /** 같은 origin referrer → history.back */
  it("같은 origin에서 왔으면 history.back()을 호출한다", async () => {
    Object.defineProperty(document, "referrer", {
      value: window.location.origin + "/search",
      configurable: true,
    });

    const { useSmartBack } = await import("../useSmartBack");
    const { result } = renderHook(() => useSmartBack());

    act(() => {
      result.current();
    });

    expect(window.history.back).toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  /** 빈 referrer → 홈으로 이동 */
  it("referrer가 없으면 홈으로 이동한다", async () => {
    Object.defineProperty(document, "referrer", {
      value: "",
      configurable: true,
    });

    const { useSmartBack } = await import("../useSmartBack");
    const { result } = renderHook(() => useSmartBack());

    act(() => {
      result.current();
    });

    expect(pushMock).toHaveBeenCalledWith("/");
  });

  /** 외부 origin referrer → 홈으로 이동 */
  it("다른 origin에서 왔으면 홈으로 이동한다", async () => {
    Object.defineProperty(document, "referrer", {
      value: "https://external-site.com/page",
      configurable: true,
    });

    const { useSmartBack } = await import("../useSmartBack");
    const { result } = renderHook(() => useSmartBack());

    act(() => {
      result.current();
    });

    expect(pushMock).toHaveBeenCalledWith("/");
  });
});
