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
    expect(settings.enabledAxes).toHaveLength(11);
    expect(settings.weights.units).toBe(3);
    expect(settings.weights.discount).toBe(3);
    expect(settings.weights.jeonse).toBeUndefined();
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
    expect(loaded.weights.discount).toBe(3);
  });

  /** 없어진 축 키(옛 jeonse·nearby)는 버리고, 남은 축이 3개 미만이면 기본값 (세션 471) */
  it("저장된 옛 축 키는 버린다 — '최소 3축' 판정이 실제 축으로 센다", () => {
    saveMbRadarSettings({ enabledAxes: ["units", "parking", "maxFloor", "jeonse", "nearby"], weights: {} });
    expect(getMbRadarSettings().enabledAxes).toEqual(["units", "parking", "maxFloor"]);

    saveMbRadarSettings({ enabledAxes: ["jeonse", "nearby", "units"], weights: {} });
    expect(getMbRadarSettings().enabledAxes).toHaveLength(11);
  });

  // 검사관 🟡(세션 471): 걸러내기가 지금 있는 축까지 버리면 안 된다 — 11축 전부 + 옛 키 1개를 저장하면 11축이 그대로 남는다
  it("걸러내기는 지금 있는 11축을 하나도 버리지 않는다", () => {
    const all = [...DEFAULT_RADAR_SETTINGS.enabledAxes];
    saveMbRadarSettings({ enabledAxes: [...all, "jeonse"], weights: {} });
    expect(getMbRadarSettings().enabledAxes).toEqual(all);
  });

  /** enabledAxes < 3이면 기본값으로 폴백 */
  it("enabledAxes가 3개 미만이면 기본값으로 폴백한다", () => {
    saveMbRadarSettings({ enabledAxes: ["units"], weights: {} });
    const loaded = getMbRadarSettings();
    expect(loaded.enabledAxes).toHaveLength(11);
  });

  /** clear로 초기화 */
  it("clearMbRadarSettings로 초기화된다", () => {
    saveMbRadarSettings({
      enabledAxes: ["units", "parking", "maxFloor"],
      weights: { units: 5 },
    });
    clearMbRadarSettings();
    const loaded = getMbRadarSettings();
    expect(loaded.enabledAxes).toHaveLength(11);
    expect(loaded.weights.units).toBe(3);
  });

  /** 깨진 JSON 방어 */
  it("깨진 JSON이 저장되어 있으면 기본값으로 폴백한다", () => {
    localStorage.setItem("mb_radar_settings", "{broken!!!");
    const loaded = getMbRadarSettings();
    expect(loaded.enabledAxes).toHaveLength(11);
    expect(loaded.weights.units).toBe(3);
  });

  /** DEFAULT_RADAR_SETTINGS 상수 검증 */
  it("DEFAULT_RADAR_SETTINGS는 11개 축과 균등 가중치를 가진다", () => {
    expect(DEFAULT_RADAR_SETTINGS.enabledAxes).toHaveLength(11);
    const allThree = Object.values(DEFAULT_RADAR_SETTINGS.weights).every((w) => w === 3);
    expect(allThree).toBe(true);
  });
});
