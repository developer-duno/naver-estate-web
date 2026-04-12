"use client";

/**
 * 레이더 차트 축 선택 + 가중치 영속화 훅
 * localStorage 기반, useMbCompareBookmarks 패턴 따름
 */
import { useState, useEffect, useCallback } from "react";
import {
  getMbRadarSettings,
  saveMbRadarSettings,
  DEFAULT_RADAR_SETTINGS,
  type MbRadarSettings,
} from "@/lib/storage";

const MIN_AXES = 3;

export function useMbRadarSettings() {
  // SSR 안전: DEFAULT로 시작 → useEffect에서 localStorage 로드 (hydration mismatch 방지)
  const [settings, setSettings] = useState<MbRadarSettings>(DEFAULT_RADAR_SETTINGS);

  useEffect(() => {
    setSettings(getMbRadarSettings());
  }, []);

  /** 축 활성/비활성 토글 (최소 3개 유지) */
  const toggleAxis = useCallback((key: string) => {
    setSettings((prev) => {
      const enabled = new Set(prev.enabledAxes);
      if (enabled.has(key)) {
        if (enabled.size <= MIN_AXES) return prev;
        enabled.delete(key);
      } else {
        enabled.add(key);
      }
      const next: MbRadarSettings = { ...prev, enabledAxes: [...enabled] };
      saveMbRadarSettings(next);
      return next;
    });
  }, []);

  /** 개별 축 가중치 변경 (1-5 클램프) */
  const setWeight = useCallback((key: string, value: number) => {
    const clamped = Math.max(1, Math.min(5, Math.round(value)));
    setSettings((prev) => {
      const next: MbRadarSettings = {
        ...prev,
        weights: { ...prev.weights, [key]: clamped },
      };
      saveMbRadarSettings(next);
      return next;
    });
  }, []);

  /** 프리셋 가중치 일괄 적용 */
  const applyPreset = useCallback((weights: Record<string, number>) => {
    setSettings((prev) => {
      const next: MbRadarSettings = { ...prev, weights: { ...prev.weights, ...weights } };
      saveMbRadarSettings(next);
      return next;
    });
  }, []);

  /** 가중치만 기본값(3) 복원, 축 선택은 유지 */
  const reset = useCallback(() => {
    setSettings((prev) => {
      const next: MbRadarSettings = { ...prev, weights: { ...DEFAULT_RADAR_SETTINGS.weights } };
      saveMbRadarSettings(next);
      return next;
    });
  }, []);

  const enabledAxes = new Set(settings.enabledAxes);

  return {
    enabledAxes,
    weights: settings.weights,
    toggleAxis,
    setWeight,
    applyPreset,
    reset,
  };
}
