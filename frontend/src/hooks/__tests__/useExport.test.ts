/**
 * useExport 훅 테스트 — 엑셀 내보내기 (useMutation 래핑)
 * 실행: npx vitest run src/hooks/__tests__/useExport.test.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";

/* api 모킹 */
vi.mock("@/lib/api", () => ({
  exportArticles: vi.fn().mockResolvedValue(undefined),
}));

/* supabase 모킹 */
vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "test-token" } },
      }),
    },
  }),
}));

describe("useExport 훅", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** 초기 상태 */
  it("초기 상태에서 exporting=false, exportError=빈문자열이다", async () => {
    const { useExport } = await import("../useExport");
    const { result } = renderHook(() => useExport(), {
      wrapper: TestQueryProvider,
    });

    expect(result.current.exporting).toBe(false);
    expect(result.current.exportError).toBe("");
  });

  /** clearExportError 동작 */
  it("clearExportError로 에러를 초기화할 수 있다", async () => {
    const { useExport } = await import("../useExport");
    const { result } = renderHook(() => useExport(), {
      wrapper: TestQueryProvider,
    });

    act(() => {
      result.current.clearExportError();
    });

    expect(result.current.exportError).toBe("");
  });
});
