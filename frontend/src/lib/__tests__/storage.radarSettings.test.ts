/**
 * 레이더 차트 설정 storage 함수 테스트
 * 실행: npx vitest run src/lib/__tests__/storage.radarSettings.test.ts
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  getMbRadarSettings,
  saveMbRadarSettings,
  clearMbRadarSettings,
  DEFAULT_RADAR_SETTINGS,
} from "../storage";

describe("레이더 차트 설정 (storage)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** 초기 상태: 기본 설정 반환 */
  it("초기 상태에서 기본 설정을 반환한다", () => {
    const settings = getMbRadarSettings();
    expect(settings.enabledAxes).toHaveLength(13);
    expect(settings.weights.units).toBe(3);
    expect(settings.weights.jeonse).toBe(3);
  });

  /** 저장 후 조회 */
  it("saveMbRadarSettings로 저장한 후 getMbRadarSettings로 조회할 수 있다", () => {
    saveMbRadarSettings({
      enabledAxes: ["units", "parking", "maxFloor"],
      weights: { units: 5, parking: 1, maxFloor: 3 },
    });
    const loaded = getMbRadarSettings();
    expect(loaded.enabledAxes).toEqual(["units", "parking", "maxFloor"]);
    expect(loaded.weights.units).toBe(5);
    // 저장하지 않은 키는 기본값(3)으로 merge
    expect(loaded.weights.jeonse).toBe(3);
  });

  /** enabledAxes < 3이면 기본값으로 폴백 */
  it("enabledAxes가 3개 미만이면 기본값으로 폴백한다", () => {
    saveMbRadarSettings({ enabledAxes: ["units"], weights: {} });
    const loaded = getMbRadarSettings();
    expect(loaded.enabledAxes).toHaveLength(13);
  });

  /** clear로 초기화 */
  it("clearMbRadarSettings로 초기화된다", () => {
    saveMbRadarSettings({
      enabledAxes: ["units", "parking", "maxFloor"],
      weights: { units: 5 },
    });
    clearMbRadarSettings();
    const loaded = getMbRadarSettings();
    expect(loaded.enabledAxes).toHaveLength(13);
    expect(loaded.weights.units).toBe(3);
  });

  /** 깨진 JSON 방어 */
  it("깨진 JSON이 저장되어 있으면 기본값으로 폴백한다", () => {
    localStorage.setItem("mb_radar_settings", "{broken!!!");
    const loaded = getMbRadarSettings();
    expect(loaded.enabledAxes).toHaveLength(13);
    expect(loaded.weights.units).toBe(3);
  });

  /** DEFAULT_RADAR_SETTINGS 상수 검증 */
  it("DEFAULT_RADAR_SETTINGS는 13개 축과 균등 가중치를 가진다", () => {
    expect(DEFAULT_RADAR_SETTINGS.enabledAxes).toHaveLength(13);
    const allThree = Object.values(DEFAULT_RADAR_SETTINGS.weights).every((w) => w === 3);
    expect(allThree).toBe(true);
  });
});
