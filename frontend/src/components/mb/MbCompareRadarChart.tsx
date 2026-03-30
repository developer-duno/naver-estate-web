"use client";

import { useState, useCallback, useMemo } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Legend, Tooltip,
} from "recharts";
import { COMPARE_COLORS } from "@/lib/constants";
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

interface Props {
  apartments: MbApartment[];
}

export default function MbCompareRadarChart({ apartments }: Props) {
  const [enabledAxes, setEnabledAxes] = useState<Set<string>>(
    () => new Set(AXES.map((a) => a.key)),
  );

  const toggleAxis = useCallback((key: string) => {
    setEnabledAxes((prev) => {
      if (prev.has(key)) {
        if (prev.size <= MIN_AXES) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      }
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const activeAxes = AXES.filter((a) => enabledAxes.has(a.key));

  const { data, bestName } = useMemo(() => {
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

    let bestIdx = 0;
    let bestSum = 0;
    for (let i = 0; i < apartments.length; i++) {
      const sum = rows.reduce((acc, r) => acc + (Number(r[apartments[i].id]) || 0), 0);
      if (sum > bestSum) { bestSum = sum; bestIdx = i; }
    }

    return { data: rows, bestName: apartments[bestIdx]?.name ?? "" };
  }, [apartments, enabledAxes]);

  if (apartments.length < 2) return null;

  const atMinimum = enabledAxes.size <= MIN_AXES;

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">종합 비교 (레이더)</h3>
      <div className="flex flex-wrap items-center gap-1.5 mb-3 no-print">
        {AXES.map((axis) => {
          const active = enabledAxes.has(axis.key);
          const locked = active && atMinimum;
          return (
            <button
              key={axis.key}
              type="button"
              onClick={() => toggleAxis(axis.key)}
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs border transition-colors ${
                active
                  ? `bg-blue-50 text-blue-700 border-blue-200${locked ? " cursor-not-allowed opacity-70" : " hover:bg-blue-100 cursor-pointer"}`
                  : "bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200 cursor-pointer"
              }`}
              aria-pressed={active}
            >
              {axis.label}
            </button>
          );
        })}
        {atMinimum && (
          <span className="text-xs text-gray-400">(최소 3개)</span>
        )}
      </div>
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
      {bestName && (
        <p className="text-center text-sm mt-2">
          <span className="text-green-600 font-bold">★ 종합 우위: {bestName}</span>
        </p>
      )}
    </div>
  );
}
