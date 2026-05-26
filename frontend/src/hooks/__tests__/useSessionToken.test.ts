/**
 * useSessionToken 훅 테스트 — Supabase getSession + tokenError
 * 실행: npx vitest run src/hooks/__tests__/useSessionToken.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const getSessionMock = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: { getSession: getSessionMock },
  }),
}));

import { useSessionToken } from "../useSessionToken";

describe("useSessionToken", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getSession 성공 시 sessionToken 에 access_token 저장", async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "abc-token" } } });
    const { result } = renderHook(() => useSessionToken());
    await waitFor(() => expect(result.current.sessionToken).toBe("abc-token"));
    expect(result.current.tokenError).toBe(false);
  });

  it("getSession 실패 시 tokenError = true, sessionToken = undefined", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getSessionMock.mockRejectedValue(new Error("auth down"));
    const { result } = renderHook(() => useSessionToken());
    await waitFor(() => expect(result.current.tokenError).toBe(true));
    expect(result.current.sessionToken).toBeUndefined();
    consoleError.mockRestore();
  });

  it("dismissTokenError 호출 시 tokenError = false", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getSessionMock.mockRejectedValue(new Error("auth down"));
    const { result } = renderHook(() => useSessionToken());
    await waitFor(() => expect(result.current.tokenError).toBe(true));
    act(() => {
      result.current.dismissTokenError();
    });
    expect(result.current.tokenError).toBe(false);
    consoleError.mockRestore();
  });
});
