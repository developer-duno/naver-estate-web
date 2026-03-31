/**
 * useAdminToken 훅 테스트 — Supabase 세션에서 토큰 추출
 * 실행: npx vitest run src/hooks/__tests__/useAdminToken.test.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const getSessionMock = vi.fn();

/* supabase 모킹 */
vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: { getSession: getSessionMock },
  }),
}));

describe("useAdminToken 훅", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
  });

  /** 토큰 반환 확인 */
  it("세션에서 access_token을 추출한다", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: "mock-admin-token" } },
    });

    const { useAdminToken } = await import("../useAdminToken");
    const { result } = renderHook(() => useAdminToken());

    const token = await result.current();
    expect(token).toBe("mock-admin-token");
  });

  /** 세션 없으면 빈 문자열 */
  it("세션이 없으면 빈 문자열을 반환한다", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: null },
    });

    const { useAdminToken } = await import("../useAdminToken");
    const { result } = renderHook(() => useAdminToken());

    const token = await result.current();
    expect(token).toBe("");
  });
});
