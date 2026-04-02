/**
 * useMbRadarSettings 훅 테스트 — localStorage 기반 레이더 축 + 가중치 영속화
 * 실행: npx vitest run src/hooks/__tests__/useMbRadarSettings.test.ts
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

describe("useMbRadarSettings 훅", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** 초기 상태: 모든 축 활성, 가중치 3 */
  it("초기 상태에서 모든 축이 활성화되고 가중치가 3이다", async () => {
    const { useMbRadarSettings } = await import("../useMbRadarSettings");
    const { result } = renderHook(() => useMbRadarSettings());
    expect(result.current.enabledAxes.size).toBe(11);
    expect(result.current.weights.units).toBe(3);
    expect(result.current.weights.jeonse).toBe(3);
  });

  /** toggleAxis: 축 비활성화 + localStorage 저장 */
  it("toggleAxis로 축을 비활성화하면 localStorage에 저장된다", async () => {
    const { useMbRadarSettings } = await import("../useMbRadarSettings");
    const { result } = renderHook(() => useMbRadarSettings());

    act(() => { result.current.toggleAxis("units"); });
    expect(result.current.enabledAxes.has("units")).toBe(false);
    expect(result.current.enabledAxes.size).toBe(10);

    const stored = JSON.parse(localStorage.getItem("mb_radar_settings")!);
    expect(stored.enabledAxes).not.toContain("units");
  });

  /** 최소 3개 축 미만으로 비활성화 불가 */
  it("최소 3개 축 미만으로 비활성화할 수 없다", async () => {
    const { useMbRadarSettings } = await import("../useMbRadarSettings");
    const { result } = renderHook(() => useMbRadarSettings());

    // 8개 비활성화 → 3개 남음
    const toDisable = ["units", "parking", "maxFloor", "jeonse", "nearby", "discount", "airQuality", "medical"];
    toDisable.forEach((key) => act(() => { result.current.toggleAxis(key); }));
    expect(result.current.enabledAxes.size).toBe(3);

    // 추가 비활성화 시도 → 변동 없음
    act(() => { result.current.toggleAxis("unsold"); });
    expect(result.current.enabledAxes.size).toBe(3);
  });

  /** setWeight: 1-5 범위 클램프 */
  it("setWeight로 가중치를 변경하면 1-5 범위로 클램프된다", async () => {
    const { useMbRadarSettings } = await import("../useMbRadarSettings");
    const { result } = renderHook(() => useMbRadarSettings());

    act(() => { result.current.setWeight("parking", 5); });
    expect(result.current.weights.parking).toBe(5);

    act(() => { result.current.setWeight("parking", 0); }); // 최소 미만
    expect(result.current.weights.parking).toBe(1);

    act(() => { result.current.setWeight("parking", 99); }); // 최대 초과
    expect(result.current.weights.parking).toBe(5);
  });

  /** applyPreset: 프리셋 가중치 일괄 적용 */
  it("applyPreset으로 프리셋 가중치가 일괄 적용된다", async () => {
    const { useMbRadarSettings } = await import("../useMbRadarSettings");
    const { result } = renderHook(() => useMbRadarSettings());

    const investPreset = { units: 2, parking: 1, maxFloor: 1, jeonse: 5, nearby: 5, discount: 5, unsold: 4, pp: 4, far: 1 };
    act(() => { result.current.applyPreset(investPreset); });

    expect(result.current.weights.jeonse).toBe(5);
    expect(result.current.weights.parking).toBe(1);
    expect(result.current.weights.far).toBe(1);
  });

  /** reset: 가중치만 기본값(3) 복원, 축 선택 유지 */
  it("reset으로 가중치만 초기화되고 축 선택은 유지된다", async () => {
    const { useMbRadarSettings } = await import("../useMbRadarSettings");
    const { result } = renderHook(() => useMbRadarSettings());

    // 축 비활성화 + 가중치 변경
    act(() => { result.current.toggleAxis("units"); });
    act(() => { result.current.setWeight("parking", 5); });
    expect(result.current.enabledAxes.has("units")).toBe(false);
    expect(result.current.weights.parking).toBe(5);

    // reset → 가중치만 3으로
    act(() => { result.current.reset(); });
    expect(result.current.weights.parking).toBe(3);
    expect(result.current.enabledAxes.has("units")).toBe(false); // 축 선택 유지
  });
});
