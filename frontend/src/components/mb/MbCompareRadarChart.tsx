"use client";

/**
 * 미분양 비교 레이더 차트 — 9축 정규화 + 가중치 프리셋 + 축별 슬라이더 + 가중 점수
 * useMbRadarSettings 훅으로 축 선택 + 가중치를 localStorage에 영속화
 */
import { useMemo } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Legend, Tooltip,
} from "recharts";
import { COMPARE_COLORS } from "@/lib/constants";
import { useMbRadarSettings } from "@/hooks/useMbRadarSettings";
import type { MbApartment } from "@/types";

const RADAR_HEIGHT = 400;
const NORMALIZE_MAX = 100;
const RADAR_FILL_OPACITY = 0.15;
const MIN_AXES = 3;

interface AxisDef {
  key: string;
  label: string;
  getValue: (a: MbApartment) => number;
  invert?: boolean;
}

const AXES: AxisDef[] = [
  { key: "units", label: "세대수", getValue: (a) => a.units ?? 0 },
  { key: "parking", label: "주차비율", getValue: (a) => a.parking_ratio ?? 0 },
  { key: "maxFloor", label: "최고층", getValue: (a) => a.max_floor ?? 0 },
  { key: "jeonse", label: "전세가율", getValue: (a) => a.naver_jeonse_rate ?? 0 },
  { key: "nearby", label: "주변시세", getValue: (a) => a.naver_nearby_median ?? 0 },
  { key: "discount", label: "할인율", getValue: (a) => a.discount_pct ?? 0 },
  { key: "unsold", label: "미분양률", getValue: (a) => a.unsold_rate ?? 0, invert: true },
  { key: "pp", label: "평당가", getValue: (a) => a.presale_pp ?? 0, invert: true },
  { key: "far", label: "용적률", getValue: (a) => a.floor_area_ratio ?? 0, invert: true },
];

// ── 칩 스타일 ──

const BASE_CHIP = "inline-flex items-center rounded-full px-2.5 py-1 text-xs border transition-colors";

function getAxisChipClass(active: boolean, locked: boolean): string {
  if (!active) return `${BASE_CHIP} bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200 cursor-pointer`;
  if (locked) return `${BASE_CHIP} bg-blue-50 text-blue-700 border-blue-200 cursor-not-allowed opacity-70`;
  return `${BASE_CHIP} bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 cursor-pointer`;
}

// ── 가중치 프리셋 ──

interface WeightPreset {
  name: string;
  weights: Record<string, number>;
}

const WEIGHT_PRESETS: WeightPreset[] = [
  { name: "균등", weights: { units: 3, parking: 3, maxFloor: 3, jeonse: 3, nearby: 3, discount: 3, unsold: 3, pp: 3, far: 3 } },
  { name: "투자형", weights: { units: 2, parking: 1, maxFloor: 1, jeonse: 5, nearby: 5, discount: 5, unsold: 4, pp: 4, far: 1 } },
  { name: "실거주형", weights: { units: 4, parking: 5, maxFloor: 3, jeonse: 2, nearby: 2, discount: 2, unsold: 3, pp: 3, far: 4 } },
];

/** 현재 가중치가 프리셋과 일치하는지 판정 */
function isPresetActive(preset: Record<string, number>, current: Record<string, number>): boolean {
  return Object.entries(preset).every(([k, v]) => (current[k] ?? 3) === v);
}

// ── 컴포넌트 ──

interface Props {
  apartments: MbApartment[];
}

export default function MbCompareRadarChart({ apartments }: Props) {
  const { enabledAxes, weights, toggleAxis, setWeight, applyPreset } = useMbRadarSettings();

  const activeAxes = useMemo(
    () => AXES.filter((a) => enabledAxes.has(a.key)),
    [enabledAxes],
  );

  const { data, scores, bestIdx } = useMemo(() => {
    const maxMap = new Map<string, number>();
    for (const axis of activeAxes) {
      const max = Math.max(...apartments.map((a) => axis.getValue(a)), 1);
      maxMap.set(axis.key, max);
    }

    const rows = activeAxes.map((axis) => {
      const row: Record<string, string | number> = { axis: axis.label };
      for (let i = 0; i < apartments.length; i++) {
        const raw = axis.getValue(apartments[i]);
        const max = maxMap.get(axis.key) ?? 1;
        row[apartments[i].id] = axis.invert
          ? Math.round(((max - raw) / max) * NORMALIZE_MAX)
          : Math.round((raw / max) * NORMALIZE_MAX);
      }
      return row;
    });

    // 가중 점수 계산 (0-100 스케일)
    const totalWeight = activeAxes.reduce((acc, axis) => acc + (weights[axis.key] ?? 3), 0);
    const scoreList: { name: string; score: number }[] = [];
    let bestI = 0;
    let bestScore = -1;
    for (let i = 0; i < apartments.length; i++) {
      const raw = rows.reduce((acc, r, rIdx) => {
        const w = weights[activeAxes[rIdx].key] ?? 3;
        return acc + (Number(r[apartments[i].id]) || 0) * w;
      }, 0);
      const score = totalWeight > 0 ? Math.round(raw / totalWeight) : 0;
      scoreList.push({ name: apartments[i].name, score });
      if (score > bestScore) { bestScore = score; bestI = i; }
    }

    return { data: rows, scores: scoreList, bestIdx: bestI };
  }, [apartments, enabledAxes, weights]);

  if (apartments.length < 2) return null;

  const atMinimum = enabledAxes.size <= MIN_AXES;
  const bestName = apartments[bestIdx]?.name ?? "";

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">종합 비교 (레이더)</h3>

      {/* 축 선택 칩 */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2 no-print">
        {AXES.map((axis) => {
          const active = enabledAxes.has(axis.key);
          const locked = active && atMinimum;
          return (
            <button
              key={axis.key}
              type="button"
              onClick={() => toggleAxis(axis.key)}
              className={getAxisChipClass(active, locked)}
              aria-pressed={active}
            >
              {axis.label}
            </button>
          );
        })}
        {atMinimum && (
          <span className="text-xs text-gray-400">(최소 {MIN_AXES}개)</span>
        )}
      </div>

      {/* 프리셋 버튼 */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2 no-print">
        <span className="text-xs text-gray-500 mr-1">프리셋:</span>
        {WEIGHT_PRESETS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            onClick={() => applyPreset(preset.weights)}
            className={`${BASE_CHIP} cursor-pointer ${
              isPresetActive(preset.weights, weights)
                ? "bg-blue-100 text-blue-700 border-blue-400"
                : "bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200"
            }`}
          >
            {preset.name}
          </button>
        ))}
      </div>

      {/* 축별 가중치 슬라이더 — 접이식 */}
      <details className="mb-3 no-print">
        <summary className="text-xs text-gray-500 cursor-pointer select-none px-2 py-1.5 rounded bg-gray-50 hover:bg-gray-100 transition-colors">
          축별 가중치 조정 ▼
        </summary>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5 mt-2 px-1">
          {AXES.filter((a) => enabledAxes.has(a.key)).map((axis) => (
            <label key={axis.key} className="flex items-center gap-2 text-xs text-gray-600">
              <span className="w-16 truncate">{axis.label}</span>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={weights[axis.key] ?? 3}
                onChange={(e) => setWeight(axis.key, Number(e.target.value))}
                className="flex-1 h-1.5 accent-blue-500"
              />
              <span className="w-4 text-center font-mono">{weights[axis.key] ?? 3}</span>
            </label>
          ))}
        </div>
      </details>

      {/* 레이더 차트 */}
      <ResponsiveContainer width="100%" height={RADAR_HEIGHT}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
          <PolarGrid />
          <PolarAngleAxis dataKey="axis" fontSize={11} />
          <PolarRadiusAxis angle={90} domain={[0, NORMALIZE_MAX]} tick={false} />
          {apartments.map((a, i) => (
            <Radar
              key={a.id}
              name={a.name}
              dataKey={a.id}
              stroke={COMPARE_COLORS[i % COMPARE_COLORS.length].main}
              fill={COMPARE_COLORS[i % COMPARE_COLORS.length].main}
              fillOpacity={RADAR_FILL_OPACITY}
              strokeWidth={2}
            />
          ))}
          <Legend />
          <Tooltip />
        </RadarChart>
      </ResponsiveContainer>

      {/* 가중 점수 + 종합 우위 */}
      {scores.length > 0 && (
        <div className="mt-2 text-center space-y-1">
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-gray-600">
            {scores.map((s, i) => (
              <span key={i} className={bestIdx === i ? "font-bold text-green-600" : ""}>
                {s.name}: {s.score}점
              </span>
            ))}
          </div>
          {bestName && (
            <p className="text-sm">
              <span className="text-green-600 font-bold">★ 종합 우위: {bestName} ({scores[bestIdx]?.score ?? 0}점)</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
