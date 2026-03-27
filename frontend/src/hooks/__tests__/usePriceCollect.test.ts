/**
 * usePriceCollect 훅 테스트 — React Query 기반 폴링
 * 실행: npx vitest run src/hooks/__tests__/usePriceCollect.test.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";

// API mock
const mockStartPriceCollect = vi.fn();
const mockGetPriceCollectStatus = vi.fn();

vi.mock("@/lib/api", () => ({
  startPriceCollect: (...args: unknown[]) => mockStartPriceCollect(...args),
  getPriceCollectStatus: (...args: unknown[]) => mockGetPriceCollectStatus(...args),
}));

describe("usePriceCollect — 초기 상태 검증 (React Query)", () => {
  it("반환 타입에 collecting, message, startCollect, clearPolling 포함", async () => {
    const { usePriceCollect } = await import("../usePriceCollect");
    const { result } = renderHook(() => usePriceCollect(), {
      wrapper: TestQueryProvider,
    });
    expect(result.current).toHaveProperty("collecting");
    expect(result.current).toHaveProperty("message");
    expect(result.current).toHaveProperty("startCollect");
    expect(result.current).toHaveProperty("clearPolling");
  }, 15000);

  it("초기 collecting은 false, message는 빈 문자열", async () => {
    const { usePriceCollect } = await import("../usePriceCollect");
    const { result } = renderHook(() => usePriceCollect(), {
      wrapper: TestQueryProvider,
    });
    expect(result.current.collecting).toBe(false);
    expect(result.current.message).toBe("");
  }, 15000);
});

describe("usePriceCollect — 정상 흐름 (React Query)", () => {
  beforeEach(() => {
    mockStartPriceCollect.mockReset();
    mockGetPriceCollectStatus.mockReset();
  });

  // 정상: "fresh" 응답 시 즉시 onDone 호출 (폴링 없이)
  it("fresh 응답 시 즉시 완료 (폴링 없이 onDone 호출)", async () => {
    mockStartPriceCollect.mockResolvedValue({ status: "fresh", complex_no: "C001" });
    const onDone = vi.fn();

    const { usePriceCollect } = await import("../usePriceCollect");
    const { result } = renderHook(() => usePriceCollect(), {
      wrapper: TestQueryProvider,
    });

    await act(async () => {
      result.current.startCollect("C001", "token123", onDone);
    });

    // fresh → 즉시 완료
    await waitFor(() => {
      expect(onDone).toHaveBeenCalledTimes(1);
    });
    expect(result.current.collecting).toBe(false);
    expect(result.current.message).toBe("");
    // 폴링 상태 API는 호출되지 않아야 함
    expect(mockGetPriceCollectStatus).not.toHaveBeenCalled();
  }, 15000);
});

describe("usePriceCollect — 에러 처리 (React Query)", () => {
  beforeEach(() => {
    mockStartPriceCollect.mockReset();
    mockGetPriceCollectStatus.mockReset();
  });

  // 에러: 429 → 요청 한도 초과 메시지
  it("429 에러 시 '요청 한도 초과' 메시지 표시", async () => {
    const err = { statusCode: 429 };
    mockStartPriceCollect.mockRejectedValue(err);

    const { usePriceCollect } = await import("../usePriceCollect");
    const { result } = renderHook(() => usePriceCollect(), {
      wrapper: TestQueryProvider,
    });

    await act(async () => {
      result.current.startCollect("C001", "token123");
    });

    await waitFor(() => {
      expect(result.current.collecting).toBe(false);
      expect(result.current.message).toBe("요청 한도 초과");
    });
    expect(mockGetPriceCollectStatus).not.toHaveBeenCalled();
  }, 15000);

  // 에러: BE에서 error 상태 반환 — 폴링 중 error status
  it("폴링 중 error 상태 시 오류 메시지 표시", async () => {
    mockStartPriceCollect.mockResolvedValue({ status: "started", complex_no: "C001" });
    mockGetPriceCollectStatus.mockResolvedValue({
      status: "error", error: "DB 연결 실패", complex_no: "C001",
    });

    const { usePriceCollect } = await import("../usePriceCollect");
    const { result } = renderHook(() => usePriceCollect(), {
      wrapper: TestQueryProvider,
    });

    await act(async () => {
      result.current.startCollect("C001", "token123");
    });

    // 폴링이 시작되고 error 상태 감지 → 오류 메시지
    await waitFor(() => {
      expect(result.current.collecting).toBe(false);
      expect(result.current.message).toBe("수집 오류: DB 연결 실패");
    }, { timeout: 10000 });
  }, 15000);
});

describe("usePriceCollect — cleanup (React Query)", () => {
  beforeEach(() => {
    mockStartPriceCollect.mockReset();
    mockGetPriceCollectStatus.mockReset();
  });

  // cleanup: 언마운트 시 에러 없이 정리
  it("언마운트 시 에러 없이 정리됨", async () => {
    mockStartPriceCollect.mockResolvedValue({ status: "started", complex_no: "C001" });
    mockGetPriceCollectStatus.mockResolvedValue({
      status: "running", collected: 0, total: 0, complex_no: "C001",
    });

    const { usePriceCollect } = await import("../usePriceCollect");
    const { result, unmount } = renderHook(() => usePriceCollect(), {
      wrapper: TestQueryProvider,
    });

    await act(async () => {
      result.current.startCollect("C001", "token123");
    });

    await waitFor(() => {
      expect(result.current.collecting).toBe(true);
    });

    // 언마운트 — 에러 없이 정리되어야 함
    unmount();
  }, 15000);
});
