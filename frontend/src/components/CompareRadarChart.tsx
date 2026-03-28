"use client";

import { useMemo } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Legend, Tooltip,
} from "recharts";
import { COMPARE_COLORS } from "@/lib/constants";
import type { Complex } from "@/types";

const MAX_BUILDING_AGE = 50;

/** 준공년도 → 신축도 (최대 50년, 역수) */
function getNewness(ymd?: string): number {
  if (!ymd) return 0;
  const year = parseInt(ymd.slice(0, 4), 10);
  if (isNaN(year)) return 0;
  const age = new Date().getFullYear() - year;
  return Math.max(0, MAX_BUILDING_AGE - age);
}

interface AxisDef {
  key: string;
  label: string;
  getValue: (c: Complex) => number;
}

const AXES: AxisDef[] = [
  { key: "household", label: "세대수", getValue: (c) => c.total_household_count ?? 0 },
  { key: "parking", label: "세대당 주차", getValue: (c) => c.parking_count_by_household ?? 0 },
  { key: "jeonse", label: "전세가율", getValue: (c) => (c.jeonse_rate ?? 0) * 100 },
  { key: "trades", label: "최근 거래", getValue: (c) => c.recent_trades_6m ?? 0 },
  { key: "articles", label: "매물수", getValue: (c) => c.article_count ?? 0 },
  { key: "newness", label: "신축도", getValue: (c) => getNewness(c.use_approve_ymd) },
  { key: "price", label: "주변 시세", getValue: (c) => c.nearby_median_price ?? 0 },
  { key: "floor", label: "최고층", getValue: (c) => c.high_floor ?? 0 },
];

interface Props {
  complexes: Complex[];
}

export default function CompareRadarChart({ complexes }: Props) {
  const { data, bestName } = useMemo(() => {
    // 각 축의 max 값 계산
    const maxMap = new Map<string, number>();
    for (const axis of AXES) {
      const max = Math.max(...complexes.map((c) => axis.getValue(c)), 1);
      maxMap.set(axis.key, max);
    }

    // 정규화 데이터 생성
    const rows = AXES.map((axis) => {
      const row: Record<string, string | number> = { axis: axis.label };
      for (let i = 0; i < complexes.length; i++) {
        const raw = axis.getValue(complexes[i]);
        const max = maxMap.get(axis.key) ?? 1;
        row[complexes[i].complex_name] = Math.round((raw / max) * 100);
      }
      return row;
    });

    // 종합 우위: 정규화 값 합계 최대
    let bestIdx = 0;
    let bestSum = 0;
    for (let i = 0; i < complexes.length; i++) {
      const sum = rows.reduce((acc, r) => acc + (Number(r[complexes[i].complex_name]) || 0), 0);
      if (sum > bestSum) {
        bestSum = sum;
        bestIdx = i;
      }
    }

    return { data: rows, bestName: complexes[bestIdx]?.complex_name ?? "" };
  }, [complexes]);

  if (complexes.length < 2) return null;

  return (
    <div>
      <ResponsiveContainer width="100%" height={400}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
          <PolarGrid />
          <PolarAngleAxis dataKey="axis" fontSize={11} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} />
          {complexes.map((c, i) => (
            <Radar
              key={c.complex_no}
              name={c.complex_name}
              dataKey={c.complex_name}
              stroke={COMPARE_COLORS[i % COMPARE_COLORS.length].main}
              fill={COMPARE_COLORS[i % COMPARE_COLORS.length].main}
              fillOpacity={0.15}
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
