/**
 * usePriceCollect 훅 테스트 — 폴링 로직, 에러 처리, cleanup
 * 실행: npx vitest run src/hooks/__tests__/usePriceCollect.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// API mock
const mockStartPriceCollect = vi.fn();
const mockGetPriceCollectStatus = vi.fn();

vi.mock("@/lib/api", () => ({
  startPriceCollect: (...args: unknown[]) => mockStartPriceCollect(...args),
  getPriceCollectStatus: (...args: unknown[]) => mockGetPriceCollectStatus(...args),
}));

describe("usePriceCollect — 초기 상태 검증", () => {
  it("반환 타입에 collecting, message, startCollect, clearPolling 포함", async () => {
    const { usePriceCollect } = await import("../usePriceCollect");
    const { result } = renderHook(() => usePriceCollect());
    expect(result.current).toHaveProperty("collecting");
    expect(result.current).toHaveProperty("message");
    expect(result.current).toHaveProperty("startCollect");
    expect(result.current).toHaveProperty("clearPolling");
  }, 15000);

  it("초기 collecting은 false, message는 빈 문자열", async () => {
    const { usePriceCollect } = await import("../usePriceCollect");
    const { result } = renderHook(() => usePriceCollect());
    expect(result.current.collecting).toBe(false);
    expect(result.current.message).toBe("");
  }, 15000);
});

describe("usePriceCollect — 정상 흐름", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockStartPriceCollect.mockReset();
    mockGetPriceCollectStatus.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 정상: "fresh" 응답 시 즉시 onDone 호출
  it("fresh 응답 시 즉시 완료 (폴링 없이 onDone 호출)", async () => {
    mockStartPriceCollect.mockResolvedValue({ status: "fresh", complex_no: "C001" });
    const onDone = vi.fn();

    const { usePriceCollect } = await import("../usePriceCollect");
    const { result } = renderHook(() => usePriceCollect());

    await act(async () => {
      result.current.startCollect("C001", "token123", onDone);
    });

    // fresh → 즉시 완료
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(result.current.collecting).toBe(false);
    expect(result.current.message).toBe("");
    // 폴링 상태 API는 호출되지 않아야 함
    expect(mockGetPriceCollectStatus).not.toHaveBeenCalled();
  }, 15000);

  // 정상: "started" → 폴링 → "done" → onDone 호출
  it("started 후 폴링으로 done 감지 시 onDone 호출", async () => {
    mockStartPriceCollect.mockResolvedValue({ status: "started", complex_no: "C001" });
    // 첫 폴링: running, 두 번째: done
    mockGetPriceCollectStatus
      .mockResolvedValueOnce({ status: "running", collected: 5, total: 10, complex_no: "C001" })
      .mockResolvedValueOnce({ status: "done", collected: 10, total: 10, complex_no: "C001" });

    const onDone = vi.fn();
    const { usePriceCollect } = await import("../usePriceCollect");
    const { result } = renderHook(() => usePriceCollect());

    await act(async () => {
      result.current.startCollect("C001", "token123", onDone);
    });

    // startCollect → startPolling → 즉시 첫 폴링 실행
    expect(mockGetPriceCollectStatus).toHaveBeenCalledTimes(1);
    expect(result.current.collecting).toBe(true);
    expect(result.current.message).toBe("수집 중... 5/10건");

    // 3초 후 두 번째 폴링
    await act(async () => {
      vi.advanceTimersByTime(3000);
      // setInterval 콜백 flush
      await vi.runOnlyPendingTimersAsync();
    });

    expect(mockGetPriceCollectStatus).toHaveBeenCalledTimes(2);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(result.current.collecting).toBe(false);
    expect(result.current.message).toBe("");
  }, 15000);
});

describe("usePriceCollect — 에러 처리", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockStartPriceCollect.mockReset();
    mockGetPriceCollectStatus.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 에러: 409 → 이미 수집 중 → 폴링 시작
  it("409 에러 시 폴링 시작하여 완료 감지", async () => {
    const err = { statusCode: 409 };
    mockStartPriceCollect.mockRejectedValue(err);
    mockGetPriceCollectStatus.mockResolvedValue({
      status: "done", collected: 10, total: 10, complex_no: "C001",
    });

    const onDone = vi.fn();
    const { usePriceCollect } = await import("../usePriceCollect");
    const { result } = renderHook(() => usePriceCollect());

    await act(async () => {
      result.current.startCollect("C001", "token123", onDone);
    });

    // 409 → startPolling → 즉시 첫 폴링 → done 감지
    expect(mockGetPriceCollectStatus).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(result.current.collecting).toBe(false);
  }, 15000);

  // 에러: 429 → 요청 한도 초과 메시지
  it("429 에러 시 '요청 한도 초과' 메시지 표시", async () => {
    const err = { statusCode: 429 };
    mockStartPriceCollect.mockRejectedValue(err);

    const { usePriceCollect } = await import("../usePriceCollect");
    const { result } = renderHook(() => usePriceCollect());

    await act(async () => {
      result.current.startCollect("C001", "token123");
    });

    expect(result.current.collecting).toBe(false);
    expect(result.current.message).toBe("요청 한도 초과");
    expect(mockGetPriceCollectStatus).not.toHaveBeenCalled();
  }, 15000);

  // 에러: BE에서 error 상태 반환
  it("폴링 중 error 상태 시 오류 메시지 표시", async () => {
    mockStartPriceCollect.mockResolvedValue({ status: "started", complex_no: "C001" });
    mockGetPriceCollectStatus.mockResolvedValue({
      status: "error", error: "DB 연결 실패", complex_no: "C001",
    });

    const { usePriceCollect } = await import("../usePriceCollect");
    const { result } = renderHook(() => usePriceCollect());

    await act(async () => {
      result.current.startCollect("C001", "token123");
    });

    expect(result.current.collecting).toBe(false);
    expect(result.current.message).toBe("수집 오류: DB 연결 실패");
  }, 15000);
});

describe("usePriceCollect — cleanup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockStartPriceCollect.mockReset();
    mockGetPriceCollectStatus.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // cleanup: 언마운트 시 interval 정리
  it("언마운트 시 폴링 interval이 정리됨", async () => {
    mockStartPriceCollect.mockResolvedValue({ status: "started", complex_no: "C001" });
    mockGetPriceCollectStatus.mockResolvedValue({
      status: "running", collected: 0, total: 0, complex_no: "C001",
    });

    const { usePriceCollect } = await import("../usePriceCollect");
    const { result, unmount } = renderHook(() => usePriceCollect());

    await act(async () => {
      result.current.startCollect("C001", "token123");
    });

    expect(result.current.collecting).toBe(true);

    // 언마운트
    unmount();

    // 언마운트 후 타이머 진행해도 에러 없음
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    // 언마운트 후 추가 폴링 호출이 없어야 함 (첫 즉시 호출 1회만)
    expect(mockGetPriceCollectStatus).toHaveBeenCalledTimes(1);
  }, 15000);
});
