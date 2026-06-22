/**
 * useGeolocation 훅 테스트 — navigator.geolocation mock
 * 실행: npx vitest run src/hooks/__tests__/useGeolocation.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { useGeolocation } from "../useGeolocation";

const getCurrentPosition = vi.fn();

beforeEach(() => {
  getCurrentPosition.mockReset();
  Object.defineProperty(navigator, "geolocation", {
    value: { getCurrentPosition },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useGeolocation", () => {
  it("enabled=false 면 위치를 요청하지 않는다 (불필요 권한 팝업 방지)", () => {
    renderHook(() => useGeolocation(false));
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("enabled=true 면 1회 요청하고, 허용 시 coords + status=granted", async () => {
    getCurrentPosition.mockImplementation((success) => {
      success({ coords: { latitude: 37.5, longitude: 127.0 } });
    });
    const { result } = renderHook(() => useGeolocation(true));
    await waitFor(() => {
      expect(result.current.status).toBe("granted");
    });
    expect(result.current.coords).toEqual({ lat: 37.5, lng: 127.0 });
  });

  it("거부 시 coords=null + status=denied (전국 폴백)", async () => {
    getCurrentPosition.mockImplementation((_success, error) => {
      error({ code: 1, message: "User denied" });
    });
    const { result } = renderHook(() => useGeolocation(true));
    await waitFor(() => {
      expect(result.current.status).toBe("denied");
    });
    expect(result.current.coords).toBeNull();
  });

  it("geolocation 미지원 환경이면 status=unavailable", () => {
    Object.defineProperty(navigator, "geolocation", { value: undefined, writable: true, configurable: true });
    const { result } = renderHook(() => useGeolocation(true));
    expect(result.current.status).toBe("unavailable");
    expect(result.current.coords).toBeNull();
  });

  it("enabled=true 라도 위치 요청은 1회만 (재렌더 시 중복 팝업 방지)", async () => {
    getCurrentPosition.mockImplementation((success) => {
      success({ coords: { latitude: 35.1, longitude: 129.0 } });
    });
    const { result, rerender } = renderHook(() => useGeolocation(true));
    await waitFor(() => expect(result.current.status).toBe("granted"));
    rerender();
    rerender();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });
});
